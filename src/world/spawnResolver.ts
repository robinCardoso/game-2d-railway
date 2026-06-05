import { ENGINE_CONFIG, clampFloorZ } from '../engine';
import type { LayerMap } from '../engine/mapPaintLayers';
import { getLayerCell } from '../engine/mapPaintLayers';
import type { SpawnPoint, WorldMap } from '../engine/types';

function hasMapContentAt(
    worldMap: WorldMap,
    grassOverlay: LayerMap | undefined,
    mapSize: number,
    x: number,
    y: number,
    z: number
): boolean {
    if (x < 0 || y < 0 || x >= mapSize || y >= mapSize) return false;
    const floorZ = clampFloorZ(z);
    const ground = worldMap[floorZ]?.[y]?.[x];
    if (ground !== undefined && ground !== ENGINE_CONFIG.EMPTY_TILE_ID) return true;
    const grass = grassOverlay ? getLayerCell(grassOverlay, floorZ, x, y) : undefined;
    return grass !== undefined && grass !== ENGINE_CONFIG.EMPTY_TILE_ID;
}

/**
 * Preferência: posição salva do personagem, mas só se houver tile no mapa.
 * Evita spawn em coordenadas default (ex. 10,10) onde o JSON não tem conteúdo.
 */
export function resolveEffectiveSpawn(
    worldMap: WorldMap,
    mapSize: number,
    mapSpawn: SpawnPoint,
    saved?: SpawnPoint | null,
    grassOverlay?: LayerMap
): SpawnPoint {
    const fallback = {
        x: mapSpawn.x,
        y: mapSpawn.y,
        z: clampFloorZ(mapSpawn.z),
    };
    if (!saved) return fallback;

    const candidate = {
        x: saved.x,
        y: saved.y,
        z: clampFloorZ(saved.z),
    };
    if (hasMapContentAt(worldMap, grassOverlay, mapSize, candidate.x, candidate.y, candidate.z)) {
        return candidate;
    }
    return fallback;
}
