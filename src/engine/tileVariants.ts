import type { RegistryTile, TileRegistry } from './types';
import { resolvePublicAssetUrl } from '../shared/apiUrl';

export const VARIANT_BRUSH_ID_BASE = 9000;
export const VARIANT_BRUSH_ID_MAX = 9999;

export interface VariantGroupManifestEntry {
    label?: string;
    previewTileFileKey?: string;
    weights?: Record<string, number>;
}

export interface VariantGroupManifest {
    version: number;
    groups?: Record<string, VariantGroupManifestEntry>;
}

const GROUP_LABELS: Record<string, string> = {
    grass: 'Grama',
    stone: 'Pedra',
    dirt: 'Terra',
    sand: 'Areia',
    water: 'Água',
};

let manifestCache: VariantGroupManifest | null = null;
let groupToBrushId = new Map<string, number>();
let brushIdToGroup = new Map<number, string>();
let tileIdToGroup = new Map<number, string>();
let groupMembers = new Map<string, number[]>();
let nextVirtualBrushId = VARIANT_BRUSH_ID_BASE;

export function formatVariantGroupLabel(groupKey: string, manifest?: VariantGroupManifest | null): string {
    const m = manifest ?? manifestCache;
    const override = m?.groups?.[groupKey]?.label;
    if (override) return override;
    if (GROUP_LABELS[groupKey]) return GROUP_LABELS[groupKey];
    return groupKey
        .split(/[_-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

import { assetLoader } from '../game-data/assetLoader';

export async function loadVariantGroupManifest(): Promise<VariantGroupManifest> {
    if (manifestCache) return manifestCache;
    try {
        if (assetLoader.isPackaged()) {
            const raw = await assetLoader.getJson<VariantGroupManifest>('tile_variant_groups.json');
            if (raw) {
                manifestCache = raw;
                return manifestCache;
            }
        } else {
            const res = await fetch(resolvePublicAssetUrl('/tile_variant_groups.json'));
            if (res.ok) {
                manifestCache = (await res.json()) as VariantGroupManifest;
                return manifestCache;
            }
        }
    } catch {
        // optional manifest
    }
    manifestCache = { version: 1, groups: {} };
    return manifestCache;
}

export function invalidateVariantGroupManifestCache(): void {
    manifestCache = null;
}

function resetVariantState(): void {
    groupToBrushId = new Map();
    brushIdToGroup = new Map();
    tileIdToGroup = new Map();
    groupMembers = new Map();
    nextVirtualBrushId = VARIANT_BRUSH_ID_BASE;
}

export function buildVariantGroupIndex(registry: TileRegistry): Map<string, number[]> {
    const index = new Map<string, number[]>();
    for (const tile of Object.values(registry)) {
        if (tile.id < 0 || tile.isVariantBrush) continue;
        const group = tile.variantGroup?.trim();
        if (!group) continue;
        const list = index.get(group) ?? [];
        list.push(tile.id);
        index.set(group, list);
    }
    for (const [key, ids] of index) {
        ids.sort((a, b) => a - b);
        index.set(key, ids);
    }
    return index;
}

export function attachVariantBrushes(
    registry: TileRegistry,
    index?: Map<string, number[]>,
    manifest?: VariantGroupManifest | null
): void {
    const m = manifest ?? manifestCache;
    const builtIndex = index ?? buildVariantGroupIndex(registry);
    resetVariantState();

    const sortedGroups = [...builtIndex.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    for (const groupKey of sortedGroups) {
        const memberIds = builtIndex.get(groupKey);
        if (!memberIds || memberIds.length < 2) continue;

        groupMembers.set(groupKey, [...memberIds]);
        for (const id of memberIds) {
            tileIdToGroup.set(id, groupKey);
        }

        const brushId = nextVirtualBrushId++;
        if (brushId > VARIANT_BRUSH_ID_MAX) {
            console.warn('[TileVariants] Limite de pincéis virtuais atingido.');
            break;
        }

        groupToBrushId.set(groupKey, brushId);
        brushIdToGroup.set(brushId, groupKey);

        const firstMember = registry[memberIds[0]];
        const label = formatVariantGroupLabel(groupKey, m);
        const brushName = /aleat|random|randon/i.test(label) ? label : `${label} aleatório`;
        const previewKey = m?.groups?.[groupKey]?.previewTileFileKey;
        const previewMember = previewKey
            ? memberIds.map((id) => registry[id]).find((t) => t?.fileKey === previewKey)
            : undefined;

        registry[brushId] = {
            id: brushId,
            name: brushName,
            category: firstMember?.category ?? 'ground',
            paletteCategory: firstMember?.paletteCategory ?? 'ground',
            walkable: firstMember?.walkable ?? true,
            speedModifier: firstMember?.speedModifier ?? 1,
            isVariantBrush: true,
            variantGroup: groupKey,
            variantMemberIds: [...memberIds],
            image: previewMember?.image ?? firstMember?.image,
            fileKey: `variant_brush_${groupKey}`,
        } as RegistryTile;
    }
}

export function isVariantBrush(tileId: number): boolean {
    return brushIdToGroup.has(tileId);
}

export function getVariantGroupForBrush(tileId: number): string | undefined {
    return brushIdToGroup.get(tileId);
}

export function getVariantGroupForTile(tileId: number): string | undefined {
    return tileIdToGroup.get(tileId);
}

export function getVariantBrushIdForGroup(groupKey: string): number | undefined {
    return groupToBrushId.get(groupKey);
}

export function getVariantMemberIds(groupKey: string): readonly number[] {
    return groupMembers.get(groupKey) ?? [];
}

export function findVariantBrushForTileId(tileId: number): number | undefined {
    const group = tileIdToGroup.get(tileId);
    if (!group) return undefined;
    const members = groupMembers.get(group);
    if (!members || members.length < 2) return undefined;
    return groupToBrushId.get(group);
}

function pickWeighted(memberIds: number[], registry: TileRegistry, groupKey: string): number {
    const weights = manifestCache?.groups?.[groupKey]?.weights;
    if (!weights || Object.keys(weights).length === 0) {
        return memberIds[Math.floor(Math.random() * memberIds.length)];
    }

    const entries = memberIds.map((id) => {
        const tile = registry[id];
        const key = tile?.fileKey ?? String(id);
        const w = weights[key] ?? 1;
        return { id, weight: Math.max(0, w) };
    });

    const total = entries.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) {
        return memberIds[Math.floor(Math.random() * memberIds.length)];
    }

    let r = Math.random() * total;
    for (const entry of entries) {
        r -= entry.weight;
        if (r <= 0) return entry.id;
    }
    return entries[entries.length - 1].id;
}

/**
 * Sorteia um membro do grupo ao **pintar** com o pincel 🎲 aleatório.
 * Não é usado na renderização — o mapa salvo guarda ids fixos por célula.
 */
export function resolvePaintTileId(
    selectedId: number,
    registry: TileRegistry,
    rng: () => number = Math.random
): number {
    const groupKey = brushIdToGroup.get(selectedId);
    if (!groupKey) return selectedId;

    const members = groupMembers.get(groupKey);
    if (!members || members.length === 0) return selectedId;

    if (manifestCache?.groups?.[groupKey]?.weights) {
        return pickWeighted(members, registry, groupKey);
    }

    return members[Math.floor(rng() * members.length)];
}

export function getVariantSelectionSummary(
    selectedId: number,
    registry: TileRegistry
): {
    isRandomBrush: boolean;
    groupKey?: string;
    groupLabel?: string;
    memberCount?: number;
    tileName: string;
} {
    const tile = registry[selectedId];
    if (!tile) {
        return { isRandomBrush: false, tileName: '—' };
    }

    if (isVariantBrush(selectedId)) {
        const groupKey = getVariantGroupForBrush(selectedId)!;
        const count = groupMembers.get(groupKey)?.length ?? 0;
        return {
            isRandomBrush: true,
            groupKey,
            groupLabel: formatVariantGroupLabel(groupKey),
            memberCount: count,
            tileName: tile.name,
        };
    }

    const groupKey = getVariantGroupForTile(selectedId);
    return {
        isRandomBrush: false,
        groupKey,
        groupLabel: groupKey ? formatVariantGroupLabel(groupKey) : undefined,
        tileName: tile.name,
    };
}
