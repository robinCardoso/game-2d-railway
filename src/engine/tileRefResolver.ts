import { isVariantBrush } from './tileVariants';
import type { MapDocument, MapTileEntry, TileCatalogEntry, TileRegistry, WorldMap } from './types';
import { ENGINE_CONFIG } from './config';

/** Índice fileKey → id numérico atual do registro. */
export function buildFileKeyToIdMap(registry: TileRegistry): Map<string, number> {
    const map = new Map<string, number>();
    for (const tile of Object.values(registry)) {
        if (tile.id < 0 || !tile.fileKey) continue;
        map.set(tile.fileKey, tile.id);
    }
    return map;
}

/**
 * Resolve o id numérico de uma célula do mapa para o registro de tiles atual.
 * Prioridade: ref da célula → ref em tileRefs[id] → id se ainda existir no registro.
 */
export function resolveMapTileId(
    storedId: number,
    ref: string | undefined,
    tileRefs: Record<string, TileCatalogEntry> | undefined,
    byFileKey: Map<string, number>,
    registry: TileRegistry
): number {
    const tryRef = (key: string | undefined): number | undefined => {
        if (!key) return undefined;
        const fromKey = byFileKey.get(key);
        if (fromKey !== undefined) return fromKey;
        return undefined;
    };

    const cellRef = ref?.trim();
    const catalogRef = tileRefs?.[String(storedId)]?.ref?.trim();

    const fromCellRef = tryRef(cellRef);
    if (fromCellRef !== undefined) return fromCellRef;

    const fromCatalogRef = tryRef(catalogRef);
    if (fromCatalogRef !== undefined) return fromCatalogRef;

    if (cellRef || catalogRef) {
        console.warn(
            `[Engine] Tile ref não encontrado no registro: id=${storedId}, ref=${cellRef ?? catalogRef ?? '?'}.`
        );
        return storedId;
    }

    if (isVariantBrush(storedId)) {
        console.warn(
            `[Engine] Mapa contém id de pincel aleatório (${storedId}) — use variantes fixas ao salvar.`
        );
        return storedId;
    }

    const current = registry[storedId];
    if (current) return storedId;

    return storedId;
}

/** Resolve ids em `tiles` por andar (usa ref da célula quando presente). */
export function resolveTilesByFloor(
    tilesByFloor: Record<string, MapTileEntry[]>,
    tileRefs: MapDocument['tileRefs'],
    registry: TileRegistry
): Record<string, MapTileEntry[]> {
    const byFileKey = buildFileKeyToIdMap(registry);
    const out: Record<string, MapTileEntry[]> = {};

    for (const [zKey, entries] of Object.entries(tilesByFloor)) {
        out[zKey] = entries.map(({ x, y, id, ref }) => ({
            x,
            y,
            id: resolveMapTileId(id, ref, tileRefs, byFileKey, registry),
            ref,
        }));
    }

    return out;
}

/** Reaplica tileRefs/refs sobre um WorldMap já materializado. */
export function remapWorldMapTileIds(
    worldMap: WorldMap,
    doc: Pick<MapDocument, 'tileRefs'>,
    registry: TileRegistry
): WorldMap {
    const byFileKey = buildFileKeyToIdMap(registry);
    const tileRefs = doc.tileRefs;
    const emptyId = ENGINE_CONFIG.EMPTY_TILE_ID;

    for (const zKey of Object.keys(worldMap)) {
        const z = Number(zKey);
        const floor = worldMap[z];
        if (!floor) continue;

        for (let y = 0; y < floor.length; y++) {
            const row = floor[y];
            if (!row) continue;

            for (let x = 0; x < row.length; x++) {
                const storedId = row[x];
                if (storedId === emptyId) continue;

                const catalogRef = tileRefs?.[String(storedId)]?.ref;
                row[x] = resolveMapTileId(
                    storedId,
                    catalogRef,
                    tileRefs,
                    byFileKey,
                    registry
                );
            }
        }
    }

    return worldMap;
}
