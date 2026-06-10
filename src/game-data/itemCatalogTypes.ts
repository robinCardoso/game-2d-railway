/** Tipos do catálogo de itens (`public/item_catalog.json`). */

import {
    sanitizeItemSpriteCalibration,
    type ItemSpriteCalibration,
} from '../../shared/itemSprite.js';

export type { ItemSpriteCalibration };

export type EquipmentSlot =
    | 'head'
    | 'body'
    | 'legs'
    | 'feet'
    | 'ring'
    | 'amulet'
    | 'weapon'
    | 'shield';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
    'head',
    'body',
    'legs',
    'feet',
    'ring',
    'amulet',
    'weapon',
    'shield',
];

export type ItemCategory = 'equipment' | 'loot';

export interface ItemCatalogEntry {
    id: string;
    name: string;
    category: ItemCategory;
    /** Obrigatório quando `category === 'equipment'`. */
    slot?: EquipmentSlot;
    speedBonus?: number;
    /** Bônus somado ao skill de ataque (melee/distance) no combate. */
    attackBonus?: number;
    /** Bônus somado à defesa do alvo no combate. */
    defenseBonus?: number;
    description?: string;
    /**
     * false = só cadastro (Studio/loot); ainda sem sprite, inventário ou drop no Play.
     * true = pronto para gameplay (quando implementado).
     */
    implemented: boolean;
    /** Ícone de inventário — `tiles/items/icons/` (fora do tile registry). */
    sprite?: ItemSpriteCalibration;
}

export interface ItemCatalogDocument {
    items: ItemCatalogEntry[];
}

const VALID_SLOTS = new Set<EquipmentSlot>(EQUIPMENT_SLOTS);
const VALID_CATEGORIES = new Set<ItemCategory>(['equipment', 'loot']);

function slugifyId(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function sanitizeItemCatalogEntry(raw: unknown): ItemCatalogEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;

    const id = slugifyId(typeof row.id === 'string' ? row.id : '');
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!id || !name) return null;

    const category = VALID_CATEGORIES.has(row.category as ItemCategory)
        ? (row.category as ItemCategory)
        : row.slot && VALID_SLOTS.has(row.slot as EquipmentSlot)
          ? 'equipment'
          : 'loot';

    let slot: EquipmentSlot | undefined;
    if (typeof row.slot === 'string' && VALID_SLOTS.has(row.slot as EquipmentSlot)) {
        slot = row.slot as EquipmentSlot;
    }
    if (category === 'equipment' && !slot) {
        slot = 'feet';
    }

    const parseOptionalInt = (raw: unknown): number | undefined => {
        if (raw === undefined || raw === null || raw === '') return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? Math.floor(n) : undefined;
    };

    const sprite = sanitizeItemSpriteCalibration(row.sprite, id);

    const entry: ItemCatalogEntry = {
        id,
        name,
        category,
        slot: category === 'equipment' ? slot : undefined,
        speedBonus: parseOptionalInt(row.speedBonus),
        attackBonus: parseOptionalInt(row.attackBonus),
        defenseBonus: parseOptionalInt(row.defenseBonus),
        description: typeof row.description === 'string' ? row.description.trim() : undefined,
        implemented: row.implemented === true,
    };
    if (sprite) entry.sprite = sprite;
    return entry;
}

export function sanitizeItemCatalogDocument(raw: unknown): ItemCatalogDocument {
    if (!raw || typeof raw !== 'object') return { items: [] };
    const row = raw as { items?: unknown };
    if (!Array.isArray(row.items)) return { items: [] };

    const byId = new Map<string, ItemCatalogEntry>();
    for (const entry of row.items) {
        const sanitized = sanitizeItemCatalogEntry(entry);
        if (sanitized) byId.set(sanitized.id, sanitized);
    }
    return { items: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export function findUnknownLootItemIds(
    loot: { itemId: string }[] | undefined,
    catalog: ItemCatalogDocument
): string[] {
    if (!loot?.length) return [];
    const known = new Set(catalog.items.map((i) => i.id));
    return [...new Set(loot.map((l) => l.itemId.trim()).filter((id) => id && !known.has(id)))];
}

export function findUnimplementedLootItemIds(
    loot: { itemId: string }[] | undefined,
    catalog: ItemCatalogDocument
): string[] {
    if (!loot?.length) return [];
    const byId = new Map(catalog.items.map((i) => [i.id, i]));
    const missing: string[] = [];
    for (const row of loot) {
        const id = row.itemId.trim();
        const item = byId.get(id);
        if (item && !item.implemented) missing.push(id);
    }
    return [...new Set(missing)];
}
