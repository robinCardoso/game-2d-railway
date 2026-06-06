import { ENGINE_CONFIG } from './config';
import {
    clampImportMapSize,
    repairWorldMapGrids,
    sanitizeCreatureSpawns,
    sanitizeHouses,
    sanitizeMapDocumentName,
    sanitizeMetadata,
    sanitizePortals,
    sanitizeSparseTiles,
    sanitizeTilesByFloor,
    sanitizeSpawnPoint,
} from './mapImportSanitizer';
import { groupSparseEntriesByFloor } from './mapDocumentFormat';
import {
    enrichTilesWithRefs,
    buildTileRefsForMap,
    collectTileIdsFromTilesByFloor,
    getMapCoordSystem,
    MAP_FORMAT_ID,
    MAP_SCHEMA_PATH,
} from './tileCatalog';
import { remapWorldMapTileIds, resolveTilesByFloor } from './tileRefResolver';
import { deserializeLayerMaps, serializeLayerMaps, type LayerMap } from './mapPaintLayers';
import type { MapDocument, MapTileEntry, SparseTileEntry, SpawnPoint, TileRegistry, WorldMap } from './types';

const { MAP_SIZE, MIN_FLOOR_Z, MAX_FLOOR_Z, EMPTY_TILE_ID } = ENGINE_CONFIG;

export function createEmptyWorldMap(size: number = MAP_SIZE): WorldMap {
    const map: WorldMap = {};
    for (let z = MIN_FLOOR_Z; z <= MAX_FLOOR_Z; z++) {
        map[z] = Array(size)
            .fill(0)
            .map(() => Array(size).fill(EMPTY_TILE_ID));
    }
    return map;
}

/**
 * Mapa inicial do editor: sala de pedra no centro do andar 0.
 *
 * OBSERVAÇÃO: Esta função gerava o mapa padrão de testes (sala de pedra cercada de grama).
 * Caso seja necessário usá-la novamente para fins de testes ou reset de demonstração,
 * basta importar e chamar esta função em `src/main.ts` na inicialização da variável `worldMap`.
 */
export function createDefaultStarterMap(
    size: number = MAP_SIZE
): WorldMap {
    const map = createEmptyWorldMap(size);
    const floor0 = map[0];

    for (let x = 45; x < 55; x++) {
        for (let y = 45; y < 55; y++) {
            floor0[y][x] = 1;
            if (x === 45 || x === 54 || y === 45 || y === 54) {
                floor0[y][x] = 4;
            }
        }
    }

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (floor0[y][x] === EMPTY_TILE_ID) {
                floor0[y][x] = 0;
            }
        }
    }

    return map;
}

export function cloneWorldMap(source: WorldMap): WorldMap {
    const clone: WorldMap = {};
    for (const z of Object.keys(source).map(Number)) {
        clone[z] = source[z].map((row) => row.slice());
    }
    return clone;
}

export function collectSparseTiles(
    worldMap: WorldMap,
    size: number = MAP_SIZE,
    emptyId: number = EMPTY_TILE_ID
): SparseTileEntry[] {
    const tiles: SparseTileEntry[] = [];
    for (const zKey of Object.keys(worldMap)) {
        const z = Number(zKey);
        const floor = worldMap[z];
        if (!floor) continue;
        const rows = Math.min(floor.length, size);
        for (let y = 0; y < rows; y++) {
            const row = floor[y];
            if (!row) continue;
            const cols = Math.min(row.length, size);
            for (let x = 0; x < cols; x++) {
                const id = row[x];
                if (id !== emptyId) {
                    tiles.push([x, y, z, id]);
                }
            }
        }
    }
    return tiles;
}

export function sparseTilesToWorldMap(
    tiles: SparseTileEntry[],
    size: number = MAP_SIZE
): WorldMap {
    const map = createEmptyWorldMap(size);
    for (const [x, y, z, id] of tiles) {
        if (map[z]?.[y]?.[x] !== undefined) {
            map[z][y][x] = id;
        }
    }
    return map;
}

export function tilesByFloorToSparseEntries(
    tilesByFloor: Record<string, MapTileEntry[]>
): SparseTileEntry[] {
    const sparse: SparseTileEntry[] = [];
    for (const [zKey, entries] of Object.entries(tilesByFloor)) {
        const z = Number(zKey);
        for (const { x, y, id } of entries) {
            sparse.push([x, y, z, id]);
        }
    }
    return sparse;
}

export function serializeMapDocument(
    worldMap: WorldMap,
    options: {
        name?: string;
        mapId?: string;
        spawn?: SpawnPoint;
        size?: number;
        metadata?: Record<string, import('./types').TileMetadata>;
        houses?: Record<number, import('./types').HouseData>;
        spawns?: import('./types').CreatureSpawn[];
        portals?: import('./types').PortalData[];
        tileRegistry?: TileRegistry;
        grassOverlay?: LayerMap;
        borderOverlay?: LayerMap;
        itemsOverlay?: LayerMap;
    } = {}
): MapDocument {
    const size = options.size ?? MAP_SIZE;
    const tilesRaw = groupSparseEntriesByFloor(collectSparseTiles(worldMap, size));
    const doc: MapDocument = {
        version: 1,
        format: MAP_FORMAT_ID,
        schema: MAP_SCHEMA_PATH,
        coordSystem: getMapCoordSystem(),
        name: options.name ?? 'sem_nome',
        mapId: options.mapId,
        size,
        tileSize: ENGINE_CONFIG.TILE_SIZE,
        metadata: options.metadata ?? {},
        houses: options.houses ?? {},
        spawns: options.spawns ?? [],
        portals: options.portals ?? [],
        spawn: options.spawn ?? { x: 50, y: 50, z: 0 },
    };

    if (Object.keys(tilesRaw).length > 0) {
        doc.tiles = options.tileRegistry
            ? enrichTilesWithRefs(tilesRaw, options.tileRegistry)
            : tilesRaw;

        if (options.tileRegistry) {
            const usedIds = collectTileIdsFromTilesByFloor(doc.tiles);
            const refs = buildTileRefsForMap(options.tileRegistry, usedIds);
            if (Object.keys(refs).length > 0) {
                doc.tileRefs = refs;
            }
        }
    }

    const layerDoc = serializeLayerMaps(
        options.grassOverlay ?? {},
        options.borderOverlay ?? {},
        options.itemsOverlay ?? {},
        size
    );
    if (layerDoc) {
        doc.layers = layerDoc;
        if (options.tileRegistry && doc.layers) {
            if (doc.layers.grass) {
                doc.layers.grass = enrichTilesWithRefs(doc.layers.grass, options.tileRegistry);
            }
            if (doc.layers.border) {
                doc.layers.border = enrichTilesWithRefs(doc.layers.border, options.tileRegistry);
            }
            if (doc.layers.items) {
                doc.layers.items = enrichTilesWithRefs(doc.layers.items, options.tileRegistry);
            }
            const layerIds = new Set<number>();
            for (const floor of Object.values(doc.layers.grass ?? {})) {
                for (const e of floor) layerIds.add(e.id);
            }
            for (const floor of Object.values(doc.layers.border ?? {})) {
                for (const e of floor) layerIds.add(e.id);
            }
            for (const floor of Object.values(doc.layers.items ?? {})) {
                for (const e of floor) layerIds.add(e.id);
            }
            if (layerIds.size > 0 && options.tileRegistry) {
                const refs = buildTileRefsForMap(options.tileRegistry, layerIds);
                doc.tileRefs = { ...(doc.tileRefs ?? {}), ...refs };
            }
        }
    }

    return doc;
}

export function deserializeMapDocument(
    doc: MapDocument,
    tileRegistry?: TileRegistry
): WorldMap {
    if (doc.version !== 1) {
        throw new Error(`Versão de mapa não suportada: ${doc.version}`);
    }

    let map: WorldMap;
    /** Células já resolvidas por ref no sparse `tiles` — segundo remap corromperia ids. */
    let resolvedSparseTileRefs = false;

    if (doc.tiles && typeof doc.tiles === 'object') {
        let tiles = sanitizeTilesByFloor(doc.tiles, doc.size);
        if (Object.keys(tiles).length > 0) {
            if (tileRegistry) {
                tiles = resolveTilesByFloor(tiles, doc.tileRefs, tileRegistry);
                resolvedSparseTileRefs = true;
            }
            map = sparseTilesToWorldMap(tilesByFloorToSparseEntries(tiles), doc.size);
        } else {
            map = createEmptyWorldMap(doc.size);
        }
    } else if (Array.isArray(doc.sparseTiles)) {
        const tiles = sanitizeSparseTiles(doc.sparseTiles, doc.size);
        map = sparseTilesToWorldMap(tiles, doc.size);
    } else if (!doc.floors) {
        map = createEmptyWorldMap(doc.size);
    } else {
        map = {};
        for (const [zKey, grid] of Object.entries(doc.floors)) {
            map[Number(zKey)] = grid;
        }
        map = ensureAllFloors(map, doc.size);
    }

    if (
        tileRegistry &&
        doc.tileRefs &&
        Object.keys(doc.tileRefs).length > 0 &&
        !resolvedSparseTileRefs
    ) {
        map = remapWorldMapTileIds(map, doc, tileRegistry);
    }

    return map;
}

/**
 * Garante que todos os andares MIN…MAX existem (tiles vazios onde faltarem).
 * Mapas antigos só com -1/0/1 continuam válidos após import.
 */
export function ensureAllFloors(
    worldMap: WorldMap,
    size: number = MAP_SIZE
): WorldMap {
    for (let z = MIN_FLOOR_Z; z <= MAX_FLOOR_Z; z++) {
        if (!worldMap[z]) {
            worldMap[z] = Array(size)
                .fill(0)
                .map(() => Array(size).fill(EMPTY_TILE_ID));
        }
    }
    return worldMap;
}

/** Aceita JSON legado (só floors) ou MapDocument v1. */
export function loadMapFromJson(
    raw: unknown,
    fallbackSpawn?: SpawnPoint,
    tileRegistry?: TileRegistry
): {
    worldMap: WorldMap;
    grassOverlay?: LayerMap;
    borderOverlay?: LayerMap;
    itemsOverlay?: LayerMap;
    spawn: SpawnPoint;
    name: string;
    mapId?: string;
    size: number;
    metadata: Record<string, import('./types').TileMetadata>;
    houses: Record<number, import('./types').HouseData>;
    spawns: import('./types').CreatureSpawn[];
    portals: import('./types').PortalData[];
} {
    if (!raw || typeof raw !== 'object') {
        throw new Error('JSON de mapa inválido');
    }

    const obj = raw as Record<string, unknown>;

    if (obj.version === 1) {
        const doc = obj as unknown as MapDocument;

        const mapSize = clampImportMapSize(doc.size);
        const docForParse: MapDocument = { ...doc, size: mapSize };

        if (
            doc.tileSize !== undefined &&
            doc.tileSize !== ENGINE_CONFIG.TILE_SIZE
        ) {
            console.warn(
                `[Engine] Mapa exportado com tileSize=${doc.tileSize}, engine usa ${ENGINE_CONFIG.TILE_SIZE}.`
            );
        }

        const worldMap = deserializeMapDocument(docForParse, tileRegistry);
        repairWorldMapGrids(worldMap, mapSize);
        const { grass, border, items } = deserializeLayerMaps(docForParse, mapSize, tileRegistry);

        return {
            worldMap,
            grassOverlay: grass,
            borderOverlay: border,
            itemsOverlay: items,
            spawn: sanitizeSpawnPoint(
                doc.spawn,
                fallbackSpawn ?? { x: 50, y: 50, z: 0 },
                mapSize
            ),
            name: sanitizeMapDocumentName(doc.name),
            mapId: typeof doc.mapId === 'string' ? doc.mapId.trim().slice(0, 64) : undefined,
            size: mapSize,
            metadata: sanitizeMetadata(doc.metadata, mapSize),
            houses: sanitizeHouses(doc.houses, mapSize),
            spawns: sanitizeCreatureSpawns(doc.spawns, mapSize),
            portals: sanitizePortals(doc.portals, mapSize),
        };
    }

    const legacy = raw as WorldMap;
    if (!Object.keys(legacy).some((k) => Number.isFinite(Number(k)))) {
        throw new Error(
            'JSON de mapa inválido: esperado version 1 (MapDocument) ou floors numéricos legados.'
        );
    }
    const legacySize = MAP_SIZE;
    return {
        worldMap: ensureAllFloors(cloneWorldMap(legacy), legacySize),
        grassOverlay: {},
        borderOverlay: {},
        spawn: fallbackSpawn ?? { x: 50, y: 50, z: 0 },
        name: 'importado',
        size: legacySize,
        metadata: {},
        houses: {},
        spawns: [],
        portals: [],
    };
}
