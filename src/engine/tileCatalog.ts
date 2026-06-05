import { ENGINE_CONFIG } from './config';
import { isVariantBrush } from './tileVariants';
import type { MapCoordSystem, MapTileEntry, TileCatalogEntry, TileRegistry } from './types';

/** Identificador estável do formato de mapa esparso (IA + ferramentas). */
export const MAP_FORMAT_ID = 'game-2d/map-sparse-v1';

export const MAP_SCHEMA_PATH = './map.schema.json';

export const TILE_CATALOG_PATH = '/tile_catalog.json';

export function getMapCoordSystem(): MapCoordSystem {
    return {
        origin: 'top-left',
        axisX: 'columna — aumenta para leste (direita)',
        axisY: 'linha — aumenta para sul (baixo no canvas)',
        axisZ: 'andar — -7 (subsolo) … 0 (térreo) … +7 (céu)',
        validZ: { min: ENGINE_CONFIG.MIN_FLOOR_Z, max: ENGINE_CONFIG.MAX_FLOOR_Z },
        emptyTileId: ENGINE_CONFIG.EMPTY_TILE_ID,
        tileUnit: 'cell',
    };
}

export function tileToCatalogEntry(tile: TileRegistry[number]): TileCatalogEntry {
    const entry: TileCatalogEntry = {
        id: tile.id,
        name: tile.name,
    };

    if (tile.fileKey) entry.ref = tile.fileKey;
    if (tile.paletteCategory) entry.category = tile.paletteCategory;
    if (tile.variantGroup) entry.variantGroup = tile.variantGroup;
    if (tile.isVariantBrush) entry.isVariantBrush = true;
    if (tile.walkable !== undefined) entry.walkable = tile.walkable;
    if (tile.variantStripIndex !== undefined) entry.variantIndex = tile.variantStripIndex;

    return entry;
}

/** Catálogo completo da paleta — referência para IA gerar mapas. */
export function buildFullTileCatalog(registry: TileRegistry): {
    version: 1;
    generatedAt: string;
    tileSize: number;
    format: string;
    coordSystem: ReturnType<typeof getMapCoordSystem>;
    variantBrushes: Record<string, { brushId: number; label: string; memberIds: number[] }>;
    tiles: TileCatalogEntry[];
} {
    const tiles: TileCatalogEntry[] = [];
    const variantBrushes: Record<
        string,
        { brushId: number; label: string; memberIds: number[] }
    > = {};

    for (const tile of Object.values(registry)) {
        if (tile.id < 0) continue;
        if (tile.assetType === 'character') continue;

        if (tile.isVariantBrush && tile.variantGroup) {
            variantBrushes[tile.variantGroup] = {
                brushId: tile.id,
                label: tile.name,
                memberIds: [...(tile.variantMemberIds ?? [])],
            };
            continue;
        }

        tiles.push(tileToCatalogEntry(tile));
    }

    tiles.sort((a, b) => a.id - b.id);

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        tileSize: ENGINE_CONFIG.TILE_SIZE,
        format: MAP_FORMAT_ID,
        coordSystem: getMapCoordSystem(),
        variantBrushes,
        tiles,
    };
}

export function collectTileIdsFromTilesByFloor(
    tilesByFloor: Record<string, MapTileEntry[]>
): Set<number> {
    const ids = new Set<number>();
    for (const entries of Object.values(tilesByFloor)) {
        for (const { id } of entries) {
            if (Number.isFinite(id)) ids.add(id);
        }
    }
    return ids;
}

/** Legenda dos tile IDs usados neste mapa (subset do catálogo global). */
export function buildTileRefsForMap(
    registry: TileRegistry,
    usedIds: Iterable<number>
): Record<string, TileCatalogEntry> {
    const refs: Record<string, TileCatalogEntry> = {};

    for (const id of usedIds) {
        const tile = registry[id];
        if (!tile || tile.id < 0 || isVariantBrush(id)) continue;
        refs[String(id)] = tileToCatalogEntry(tile);
    }

    return refs;
}

export function enrichTilesWithRefs(
    tilesByFloor: Record<string, MapTileEntry[]>,
    registry: TileRegistry
): Record<string, MapTileEntry[]> {
    const out: Record<string, MapTileEntry[]> = {};

    for (const [zKey, entries] of Object.entries(tilesByFloor)) {
        out[zKey] = entries.map(({ x, y, id }) => {
            const tile = registry[id];
            const entry: MapTileEntry = { x, y, id };
            if (tile?.fileKey) entry.ref = tile.fileKey;
            return entry;
        });
    }

    return out;
}
