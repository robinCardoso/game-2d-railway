/**
 * API pública da engine — usar no editor ADM e, no futuro, no cliente jogador.
 */

export {
    ENGINE_CONFIG,
    clampFloorZ,
    collisionHitboxSize,
    formatFloorLabel,
    getAllFloorZs,
    tileAssetSizeSuffix,
} from './config';
export type {
    CollisionQueryContext,
    CreatureSpawn,
    HouseData,
    MapCoordSystem,
    MapDocument,
    MapTileEntry,
    PortalData,
    RegistryTile,
    SparseTileEntry,
    TileCatalogEntry,
    SpawnPoint,
    TileMetadata,
    TileRegistry,
    WalkProbeResult,
    WorldMap,
} from './types';
export {
    cloneWorldMap,
    collectSparseTiles,
    createDefaultStarterMap,
    createEmptyWorldMap,
    deserializeMapDocument,
    ensureAllFloors,
    loadMapFromJson,
    serializeMapDocument,
    sparseTilesToWorldMap,
    tilesByFloorToSparseEntries,
} from './worldMap';
export {
    buildFullTileCatalog,
    buildTileRefsForMap,
    enrichTilesWithRefs,
    getMapCoordSystem,
    MAP_FORMAT_ID,
    MAP_SCHEMA_PATH,
    TILE_CATALOG_PATH,
    tileToCatalogEntry,
} from './tileCatalog';
export {
    buildMapDocumentExportView,
    formatMapDocumentJson,
    groupSparseEntriesByFloor,
} from './mapDocumentFormat';
export {
    buildTileRegistry,
    buildTileRegistryAsync,
    getTileFromRegistry,
    mergeRuntimeTileProperties,
    takeVariantStripMismatches,
} from './tileRegistry';
export {
    attachVariantBrushes,
    buildVariantGroupIndex,
    findVariantBrushForTileId,
    formatVariantGroupLabel,
    getVariantSelectionSummary,
    isVariantBrush,
    loadVariantGroupManifest,
    resolvePaintTileId,
} from './tileVariants';
export { isStairHoleAtTile, queryWalkable } from './collision';
export { getTerrainSpeedModifierAt } from './terrain';
export {
    MAP_REGISTRY,
    BUILTIN_MAP_IDS,
    getKnownMapIds,
    getMapEntry,
    registerMap,
    unregisterMap,
} from './mapRegistry';
export type { MapEntry } from './mapRegistry';
export { loadMapFile, loadMapFromObject } from './worldLoader';
export type { LoadedMapResult } from './worldLoader';
export {
    cloneLoadedMapResult,
    createMapInstanceFromTemplate,
    disposeActiveMapInstance,
    captureOverworldReturnIfNeeded,
    clearOverworldReturnContext,
    getOverworldReturnContext,
    getActiveMapInstanceId,
    getActiveInstanceShortLabel,
    isInsideMapInstance,
} from './mapInstance';
export type { OverworldReturnContext } from './mapInstance';

