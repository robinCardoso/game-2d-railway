/**
 * Carregador de arquivos de mapa — busca o JSON de um MapEntry via fetch().
 * Pode ser usado tanto pelo editor (GM) quanto pelo cliente (jogador).
 */

import type { MapEntry } from './mapRegistry';
import { loadMapFromJson } from './worldMap';
import type { PortalData } from './types';
import type { WorldMap, SpawnPoint, TileMetadata, HouseData, CreatureSpawn } from './types';
import type { LayerMap } from './mapPaintLayers';

export interface LoadedMapResult {
    worldMap: WorldMap;
    grassOverlay?: LayerMap;
    borderOverlay?: LayerMap;
    spawn: SpawnPoint;
    name: string;
    mapId?: string;
    metadata: Record<string, TileMetadata>;
    houses: Record<number, HouseData>;
    spawns: CreatureSpawn[];
    portals: PortalData[];
    /** Tamanho efetivo do mapa após carregamento (pode diferir do entry.size). */
    size: number;
}

/**
 * Carrega um mapa pelo seu MapEntry, fazendo fetch do arquivo JSON.
 * Lança erro se o arquivo não puder ser carregado ou se o JSON for inválido.
 */
export async function loadMapFile(
    entry: MapEntry,
    tileRegistry?: import('./types').TileRegistry
): Promise<LoadedMapResult> {
    const url = `/${entry.file}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`[WorldLoader] Falha ao carregar o mapa "${entry.id}" em "${url}": HTTP ${response.status}`);
    }
    const raw: unknown = await response.json();
    const loaded = loadMapFromJson(raw, { x: 50, y: 50, z: 0 }, tileRegistry);
    return {
        ...loaded,
        size: loaded.size,
    };
}

/**
 * Carrega um mapa diretamente de um objeto JSON (ex: ao importar via File Input).
 * Equivalente ao `loadMapFile`, mas sem fetch.
 */
export function loadMapFromObject(
    raw: unknown,
    tileRegistry?: import('./types').TileRegistry
): LoadedMapResult {
    const loaded = loadMapFromJson(raw, { x: 50, y: 50, z: 0 }, tileRegistry);
    return {
        ...loaded,
        size: loaded.size,
    };
}
