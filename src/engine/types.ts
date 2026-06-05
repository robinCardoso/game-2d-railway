import type { TileProperties } from '../functions/tileConfig';

/** Grade de ids por andar: `floors[z][y][x]`. */
export type WorldMap = Record<number, number[][]>;

export interface SpawnPoint {
    x: number;
    y: number;
    z: number;
}

export interface TileMetadata {
    actionId?: number;
    uniqueId?: number;
    zoneId?: number;
    houseId?: number;
}

export interface HouseData {
    id: number;
    name: string;
    rent: number;
    entryX: number;
    entryY: number;
    entryZ: number;
    owner?: string;
}

export interface CreatureSpawn {
    id: string;          // ID único gerado automaticamente
    name: string;        // Nome da criatura (ex: "Wolf", "Demon", "Guard Knight")
    x: number;           // Coordenada X
    y: number;           // Coordenada Y
    z: number;           // Coordenada Z
    type: 'monster' | 'npc';
}

export interface PortalData {
    /** ID único do portal neste mapa. */
    id: string;
    /** ID do mapa de destino, conforme registrado no MAP_REGISTRY. */
    targetMapId: string;
    /** Coordenada X de chegada no mapa destino. */
    targetX: number;
    /** Coordenada Y de chegada no mapa destino. */
    targetY: number;
    /** Coordenada Z de chegada no mapa destino. */
    targetZ: number;
    /** Coordenada X do portal neste mapa (tile que o ativa). */
    tileX: number;
    /** Coordenada Y do portal neste mapa. */
    tileY: number;
    /** Coordenada Z do portal neste mapa. */
    tileZ: number;
}

/** Entrada esparso: [x, y, z, tileId] — só células pintadas. */
export type SparseTileEntry = [number, number, number, number];

/** Célula pintada no formato legível (andar fica na chave do objeto `tiles`). */
export interface MapTileEntry {
    x: number;
    y: number;
    /** ID numérico do tile no registro da engine (`tileRefs` / `tile_catalog.json`). */
    id: number;
    /** Chave estável do sprite (ex. `grama_variants#2`) — informativo para IA; a engine usa `id`. */
    ref?: string;
}

/** Entrada do catálogo / legenda de tiles. */
export interface TileCatalogEntry {
    id: number;
    name: string;
    ref?: string;
    category?: string;
    variantGroup?: string;
    variantIndex?: number;
    isVariantBrush?: boolean;
    walkable?: boolean;
}

/** Descreve o sistema de coordenadas do mapa (para humanos e IA). */
export interface MapCoordSystem {
    origin: 'top-left';
    axisX: string;
    axisY: string;
    axisZ: string;
    validZ: { min: number; max: number };
    emptyTileId: number;
    tileUnit: 'cell';
}

/** Formato exportável / carregável (cliente e ADM usam o mesmo). */
export interface MapDocument {
    version: 1;
    /** Identificador do layout do arquivo (ex. game-2d/map-sparse-v1). */
    format?: string;
    /** Caminho relativo ao JSON Schema. */
    schema?: string;
    /** Explica eixos X/Y/Z e tile vazio — leitura humana e por IA. */
    coordSystem?: MapCoordSystem;
    name: string;
    size: number;
    /** ID que referencia este mapa no MAP_REGISTRY. */
    mapId?: string;
    /** Tamanho do tile em pixels (64). Mapas antigos sem campo assumem o da engine. */
    tileSize?: number;
    /** Legenda dos tile IDs presentes em `tiles` neste arquivo. */
    tileRefs?: Record<string, TileCatalogEntry>;
    /** Grade densa legada: `floors[z][y][x]`. */
    floors?: Record<string, number[][]>;
    /** Legado compacto: `[x, y, z, id][]` (ainda aceito na importação). */
    sparseTiles?: SparseTileEntry[];
    /** Formato preferido: `tiles["0"]` = lista de células pintadas no andar 0. */
    tiles?: Record<string, MapTileEntry[]>;
    /** Metadados esparsos indexados por "z_y_x". Ex: "0_50_50" -> { actionId: 2001 } */
    metadata?: Record<string, TileMetadata>;
    houses?: Record<number, HouseData>;
    spawns?: CreatureSpawn[];
    /** Portais que conectam este mapa a outros mapas do registry. */
    portals?: PortalData[];
    /** Camadas de overlay (grama sobre chão, bordas auto). */
    layers?: {
        grass?: Record<string, MapTileEntry[]>;
        border?: Record<string, MapTileEntry[]>;
        items?: Record<string, MapTileEntry[]>;
    };
    spawn: SpawnPoint;
}

export type PaletteCategory = 'ground' | 'nature' | 'walls' | 'items' | 'border';

export interface RegistryTile extends TileProperties {
    id: number;
    name: string;
    image?: HTMLImageElement;
    /** Pasta imediata do PNG (ex. grass, grass_water) */
    category: string;
    /** Categoria da aba Tile no editor: ground | nature | walls | items */
    paletteCategory?: PaletteCategory | string;
    /** Nome do arquivo PNG (sem extensão) */
    fileKey?: string;
    /** Grupo de variação aleatória (ex.: grass) */
    variantGroup?: string;
    /** Pincel virtual: sorteia entre variantMemberIds ao pintar */
    isVariantBrush?: boolean;
    variantMemberIds?: number[];
    assetType?: string;
    borderMask?: number;
    borderSetId?: string;
    tileRole?: string;
    /** Recorte dentro de `image` (variant strip) */
    sourceRect?: { x: number; y: number; w: number; h: number };
    /** Índice do frame dentro do strip (0 … N-1) */
    variantStripIndex?: number;
    variantStripFrames?: number;
}

export type TileRegistry = Record<number, RegistryTile>;

export interface WalkProbeResult {
    walkable: boolean;
    speed: number;
    isStair: boolean;
    stairDir?: 'up' | 'down';
}

/** Contexto injetado — engine não conhece DOM nem cargo GM. */
export interface CollisionQueryContext {
    worldMap: WorldMap;
    tileRegistry: TileRegistry;
    mapSize: number;
    tileSize: number;
    minFloorZ: number;
    maxFloorZ: number;
    /** `false` = noclip (só quando o caller permitir, ex. GM). */
    collisionEnabled: boolean;
    hasBoatEquipped: boolean;
    /** Overlay de grama — afeta velocidade; colisão continua na base. */
    grassOverlay?: import('./mapPaintLayers').LayerMap;
    /** Overlay de itens/decorações — afeta colisão e velocidade. */
    itemsOverlay?: import('./mapPaintLayers').LayerMap;
}
