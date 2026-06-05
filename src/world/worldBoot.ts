/**
 * Bootstrap compartilhado Studio + Play: registry de tiles, registry de mapas, entrada de load.
 */

import { buildTileRegistryAsync, mergeRuntimeTileProperties } from '../engine';
import { hydrateRegistryFromPublicMapFiles } from '../engine/mapDiscovery';
import type { MapEntry } from '../engine/mapRegistry';
import { loadMapFile, type LoadedMapResult } from '../engine/worldLoader';
import { mergeCustomTileProperties } from '../functions/tileConfig';
import { apiFetch } from '../shared/apiFetch';
import type { TileRegistry } from '../engine/types';

/** Tile registry + propriedades custom da API (mesmo fluxo do Studio). */
export async function prepareTileRegistry(): Promise<TileRegistry> {
    try {
        const response = await apiFetch('/api/list-tile-properties');
        if (response.ok) {
            const result = (await response.json()) as { properties?: Record<string, unknown> };
            if (result.properties) {
                mergeCustomTileProperties(result.properties as Parameters<typeof mergeCustomTileProperties>[0]);
                mergeRuntimeTileProperties(result.properties as Parameters<typeof mergeRuntimeTileProperties>[0]);
            }
        }
    } catch (err) {
        console.warn('[worldBoot] Propriedades de tiles indisponíveis:', err);
    }
    return buildTileRegistryAsync();
}

/** Sincroniza MAP_REGISTRY com JSONs em public/maps/. */
export async function prepareMapRegistry(): Promise<void> {
    await hydrateRegistryFromPublicMapFiles();
}

export function toLoadMapEntry(entry: MapEntry) {
    return {
        id: entry.id,
        name: entry.name,
        file: entry.file.startsWith('/') ? entry.file.substring(1) : entry.file,
        size: entry.size,
        instanced: entry.instanced,
    };
}

export async function loadWorldMap(
    entry: MapEntry,
    tileRegistry: TileRegistry
): Promise<LoadedMapResult> {
    return loadMapFile(toLoadMapEntry(entry), tileRegistry);
}
