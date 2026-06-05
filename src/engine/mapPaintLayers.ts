import { ENGINE_CONFIG } from './config';
import type { MapDocument, MapTileEntry, TileRegistry } from './types';
import { collectSparseTiles, sparseTilesToWorldMap } from './worldMap';

/** Grade paralela de ids por andar (`-1` = vazio). */
export type LayerMap = Record<number, number[][]>;

const { EMPTY_TILE_ID } = ENGINE_CONFIG;

export function createEmptyLayerMap(_size?: number, _emptyId?: number): LayerMap {
    return {};
}

export function ensureLayerFloor(layer: LayerMap, z: number, size: number, emptyId = EMPTY_TILE_ID): void {
    if (!layer[z]) {
        layer[z] = Array(size)
            .fill(0)
            .map(() => Array(size).fill(emptyId));
    }
}

export function getLayerCell(
    layer: LayerMap,
    z: number,
    x: number,
    y: number,
    emptyId = EMPTY_TILE_ID
): number {
    return layer[z]?.[y]?.[x] ?? emptyId;
}

export function setLayerCell(
    layer: LayerMap,
    z: number,
    x: number,
    y: number,
    tileId: number,
    size: number,
    emptyId = EMPTY_TILE_ID
): void {
    ensureLayerFloor(layer, z, size, emptyId);
    layer[z][y][x] = tileId;
}

export function clearLayerCell(
    layer: LayerMap,
    z: number,
    x: number,
    y: number,
    _size?: number,
    emptyId = EMPTY_TILE_ID
): void {
    if (!layer[z]?.[y]) return;
    layer[z][y][x] = emptyId;
}

export function cloneLayerMap(source: LayerMap): LayerMap {
    const clone: LayerMap = {};
    for (const key of Object.keys(source)) {
        const z = Number(key);
        clone[z] = source[z].map((row) => [...row]);
    }
    return clone;
}

function groupLayerSparseByFloor(
    layer: LayerMap,
    size: number,
    emptyId = EMPTY_TILE_ID
): Record<string, MapTileEntry[]> {
    const sparse = collectSparseTiles(layer, size, emptyId);
    const byFloor: Record<string, MapTileEntry[]> = {};
    for (const [x, y, z, id] of sparse) {
        const key = String(z);
        if (!byFloor[key]) byFloor[key] = [];
        byFloor[key].push({ x, y, id });
    }
    for (const list of Object.values(byFloor)) {
        list.sort((a, b) => a.y - b.y || a.x - b.x);
    }
    return byFloor;
}

export function serializeLayerMaps(
    grass: LayerMap,
    border: LayerMap,
    items: LayerMap,
    size: number
): MapDocument['layers'] | undefined {
    const grassTiles = groupLayerSparseByFloor(grass, size);
    const borderTiles = groupLayerSparseByFloor(border, size);
    const itemsTiles = groupLayerSparseByFloor(items, size);
    if (
        Object.keys(grassTiles).length === 0 &&
        Object.keys(borderTiles).length === 0 &&
        Object.keys(itemsTiles).length === 0
    ) {
        return undefined;
    }
    const out: NonNullable<MapDocument['layers']> = {};
    if (Object.keys(grassTiles).length > 0) out.grass = grassTiles;
    if (Object.keys(borderTiles).length > 0) out.border = borderTiles;
    if (Object.keys(itemsTiles).length > 0) out.items = itemsTiles;
    return out;
}

function layerFromTilesByFloor(
    tilesByFloor: Record<string, MapTileEntry[]> | undefined,
    size: number,
    emptyId = EMPTY_TILE_ID
): LayerMap {
    if (!tilesByFloor || Object.keys(tilesByFloor).length === 0) {
        return createEmptyLayerMap(size, emptyId);
    }
    const sparse: Array<[number, number, number, number]> = [];
    for (const [zKey, entries] of Object.entries(tilesByFloor)) {
        const z = Number(zKey);
        for (const { x, y, id } of entries) {
            sparse.push([x, y, z, id]);
        }
    }
    return sparseTilesToWorldMap(sparse, size);
}

export function deserializeLayerMaps(
    doc: MapDocument,
    size: number,
    tileRegistry?: TileRegistry
): { grass: LayerMap; border: LayerMap; items: LayerMap } {
    const emptyId = EMPTY_TILE_ID;
    let grassTiles = doc.layers?.grass;
    let borderTiles = doc.layers?.border;
    let itemsTiles = doc.layers?.items;

    if (tileRegistry && doc.tileRefs) {
        if (grassTiles) {
            grassTiles = resolveLayerTilesByFloor(grassTiles, doc.tileRefs, tileRegistry);
        }
        if (borderTiles) {
            borderTiles = resolveLayerTilesByFloor(borderTiles, doc.tileRefs, tileRegistry);
        }
        if (itemsTiles) {
            itemsTiles = resolveLayerTilesByFloor(itemsTiles, doc.tileRefs, tileRegistry);
        }
    }

    return {
        grass: layerFromTilesByFloor(grassTiles, size, emptyId),
        border: layerFromTilesByFloor(borderTiles, size, emptyId),
        items: layerFromTilesByFloor(itemsTiles, size, emptyId),
    };
}

function resolveLayerTilesByFloor(
    tilesByFloor: Record<string, MapTileEntry[]>,
    tileRefs: MapDocument['tileRefs'],
    registry: TileRegistry
): Record<string, MapTileEntry[]> {
    const out: Record<string, MapTileEntry[]> = {};
    for (const [zKey, entries] of Object.entries(tilesByFloor)) {
        out[zKey] = entries.map((entry) => {
            if (entry.ref && registry) {
                for (const tile of Object.values(registry)) {
                    if (tile.fileKey === entry.ref || `${tile.fileKey}` === entry.ref) {
                        return { ...entry, id: tile.id };
                    }
                }
            }
            const refEntry = tileRefs?.[String(entry.id)];
            if (refEntry?.ref) {
                for (const tile of Object.values(registry)) {
                    if (tile.fileKey === refEntry.ref) {
                        return { ...entry, id: tile.id, ref: refEntry.ref };
                    }
                }
            }
            return entry;
        });
    }
    return out;
}
