import type { LayerMap } from './mapPaintLayers';
import { clearLayerCell, getLayerCell, setLayerCell } from './mapPaintLayers';
import {
    computeBorderMaskFromGrassNeighbors as computeMaskBits,
    BORDER_INNER_CORNER_MASKS,
    BORDER_MASK_E,
    BORDER_MASK_N,
    BORDER_MASK_NE,
    BORDER_MASK_NW,
    BORDER_MASK_S,
    BORDER_MASK_SE,
    BORDER_MASK_SW,
    BORDER_MASK_W,
    isSupportedBorderMask,
    resolveBorderMaskForRegistry,
} from './borderMaskBits';
import type { RegistryTile, TileRegistry, WorldMap } from './types';
import { ENGINE_CONFIG } from './config';

const { EMPTY_TILE_ID } = ENGINE_CONFIG;

export interface AutoBorderContext {
    worldMap: WorldMap;
    grassOverlay: LayerMap;
    borderOverlay: LayerMap;
    registry: TileRegistry;
    mapSize: number;
    borderSetId: string;
    fillTerrain: string;
}

function isGrassTile(tile: RegistryTile | undefined, fillTerrain: string): boolean {
    if (!tile) return false;
    const group = tile.variantGroup?.toLowerCase();
    if (!group) return false;
    const terrain = fillTerrain.toLowerCase();
    if (group === terrain) return true;
    if (group === 'grass' || group === 'grama') return true;
    if (terrain && (group.includes(terrain) || terrain.includes(group))) return true;
    return group.includes('grass') || group.includes('grama');
}

export function cellHasGrass(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): boolean {
    const overlay = getLayerCell(ctx.grassOverlay, z, x, y);
    if (overlay !== EMPTY_TILE_ID) {
        // Qualquer tile presente no overlay "grass" conta como grama.
        // Isso evita desenhar borda por cima caso metadados do tile estejam inconsistentes.
        return true;
    }
    const baseId = ctx.worldMap[z]?.[y]?.[x] ?? EMPTY_TILE_ID;
    if (baseId === EMPTY_TILE_ID) return false;
    return isGrassTile(ctx.registry[baseId], ctx.fillTerrain);
}

function isGroundBaseTile(tile: RegistryTile | undefined): boolean {
    if (!tile) return false;
    if (isGrassTile(tile, 'grass')) return false;
    const paletteCat = String(tile.paletteCategory ?? tile.category ?? '').toLowerCase();
    return paletteCat === 'ground' && tile.walkable !== false;
}

export function isEligibleBorderFloorCell(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): boolean {
    if (cellHasGrass(ctx, z, x, y)) return false;
    const baseId = ctx.worldMap[z]?.[y]?.[x] ?? EMPTY_TILE_ID;
    // Permite borda em vazio quando a grama foi pintada sem base (estilo Tibia).
    if (baseId === EMPTY_TILE_ID) return true;
    return isGroundBaseTile(ctx.registry[baseId]);
}

/** Cardinais (1–15) com prioridade; diagonais (16–128) se só canto encosta na grama. */
export function computeBorderMaskFromGrassNeighbors(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): number {
    return computeMaskBits(
        {
            hasGrass: (floor, tx, ty) => cellHasGrass(ctx, floor, tx, ty),
        },
        z,
        x,
        y
    );
}

export function buildBorderMaskTileIndex(
    registry: TileRegistry,
    borderSetId: string
): Map<number, number> {
    const index = new Map<number, number>();
    for (const tile of Object.values(registry)) {
        if (tile.assetType !== 'border') continue;
        const setId = (tile as RegistryTile & { borderSetId?: string }).borderSetId;
        if (setId !== borderSetId) continue;
        const mask = (tile as RegistryTile & { borderMask?: number }).borderMask;
        if (typeof mask === 'number' && isSupportedBorderMask(mask)) {
            index.set(mask, tile.id);
        }
    }
    return index;
}

interface GrassNeighbors {
    n: boolean;
    e: boolean;
    s: boolean;
    w: boolean;
    ne: boolean;
    se: boolean;
    sw: boolean;
    nw: boolean;
}

function readGrassNeighbors(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): GrassNeighbors {
    return {
        n: cellHasGrass(ctx, z, x, y - 1),
        e: cellHasGrass(ctx, z, x + 1, y),
        s: cellHasGrass(ctx, z, x, y + 1),
        w: cellHasGrass(ctx, z, x - 1, y),
        ne: cellHasGrass(ctx, z, x + 1, y - 1),
        se: cellHasGrass(ctx, z, x + 1, y + 1),
        sw: cellHasGrass(ctx, z, x - 1, y + 1),
        nw: cellHasGrass(ctx, z, x - 1, y - 1),
    };
}

function cardinalFromNeighbors(g: GrassNeighbors): number {
    let cardinal = 0;
    if (g.n) cardinal |= BORDER_MASK_N;
    if (g.e) cardinal |= BORDER_MASK_E;
    if (g.s) cardinal |= BORDER_MASK_S;
    if (g.w) cardinal |= BORDER_MASK_W;
    return cardinal;
}

const INNER_DECOMPOSE_ORDER = [6, 12, 3, 9] as const;
const ALL_CARDINALS = BORDER_MASK_N | BORDER_MASK_E | BORDER_MASK_S | BORDER_MASK_W;

/** Decompõe bits cardinais em sprites desenháveis (quinas L, filetes, cruz central). */
function decomposeCardinalDrawMasks(cardinal: number): number[] {
    if (cardinal === 0) return [];

    if (cardinal === ALL_CARDINALS) {
        return [...BORDER_INNER_CORNER_MASKS];
    }
    if (cardinal === (BORDER_MASK_W | BORDER_MASK_E)) {
        return [BORDER_MASK_W, BORDER_MASK_E];
    }
    if (cardinal === (BORDER_MASK_N | BORDER_MASK_S)) {
        return [BORDER_MASK_N, BORDER_MASK_S];
    }
    if (BORDER_INNER_CORNER_MASKS.includes(cardinal as (typeof BORDER_INNER_CORNER_MASKS)[number])) {
        return [cardinal];
    }

    const masks: number[] = [];
    let remaining = cardinal;
    for (const inner of INNER_DECOMPOSE_ORDER) {
        if ((remaining & inner) === inner) {
            masks.push(inner);
            remaining &= ~inner;
        }
    }
    for (const bit of [BORDER_MASK_N, BORDER_MASK_E, BORDER_MASK_S, BORDER_MASK_W]) {
        if (remaining & bit) masks.push(bit);
    }
    return masks;
}

/** Pontas diagonais quando não há vizinho cardinal de grama. */
function collectPureDiagonalDrawMasks(g: GrassNeighbors): number[] {
    if (g.n || g.e || g.s || g.w) return [];

    const masks: number[] = [];
    const push = (mask: number) => {
        if (!masks.includes(mask)) masks.push(mask);
    };

    if (g.sw && g.se) {
        push(BORDER_MASK_SW);
        push(BORDER_MASK_SE);
        return masks;
    }
    if (g.nw && g.ne) {
        push(BORDER_MASK_NW);
        push(BORDER_MASK_NE);
        return masks;
    }
    if (g.nw && g.sw) {
        push(BORDER_MASK_NW);
        push(BORDER_MASK_SW);
        return masks;
    }
    if (g.ne && g.se) {
        push(BORDER_MASK_NE);
        push(BORDER_MASK_SE);
        return masks;
    }

    if (g.ne) push(BORDER_MASK_NE);
    if (g.se) push(BORDER_MASK_SE);
    if (g.sw) push(BORDER_MASK_SW);
    if (g.nw) push(BORDER_MASK_NW);
    return masks;
}

/** Pontas diagonais extras quando já há filete cardinal (ex.: braço da cruz). */
function collectDiagonalTipMasksWithCardinals(g: GrassNeighbors): number[] {
    const masks: number[] = [];
    const push = (mask: number) => {
        if (!masks.includes(mask)) masks.push(mask);
    };
    if (!g.n && !g.e && g.ne) push(BORDER_MASK_NE);
    if (!g.s && !g.e && g.se) push(BORDER_MASK_SE);
    if (!g.s && !g.w && g.sw) push(BORDER_MASK_SW);
    if (!g.n && !g.w && g.nw) push(BORDER_MASK_NW);
    return masks;
}

/**
 * Máscaras de borda a desenhar numa célula vazia/chão.
 * Suporta multi-sprite: cruz (+), vãos, quinas L e cantos diagonais.
 */
export function collectBorderDrawMasks(
    ctx: Pick<AutoBorderContext, 'worldMap' | 'grassOverlay' | 'registry' | 'fillTerrain'>,
    z: number,
    x: number,
    y: number
): number[] {
    if (cellHasGrass(ctx, z, x, y)) return [];

    const g = readGrassNeighbors(ctx, z, x, y);
    const cardinal = cardinalFromNeighbors(g);

    if (cardinal === 0) {
        return collectPureDiagonalDrawMasks(g);
    }

    const masks: number[] = [];
    const pushAll = (list: number[]) => {
        for (const mask of list) {
            if (!masks.includes(mask)) masks.push(mask);
        }
    };

    pushAll(decomposeCardinalDrawMasks(cardinal));
    pushAll(collectDiagonalTipMasksWithCardinals(g));
    return masks;
}

function resolveDrawMaskForRegistry(
    mask: number,
    availableMasks: ReadonlySet<number>
): number {
    if (availableMasks.has(mask)) return mask;
    return resolveBorderMaskForRegistry(mask, availableMasks);
}

/** Tile ids de borda a desenhar (multi-sprite por célula quando necessário). */
export function collectBorderDrawTileIds(
    ctx: Pick<
        AutoBorderContext,
        'worldMap' | 'grassOverlay' | 'borderOverlay' | 'registry' | 'fillTerrain' | 'borderSetId'
    >,
    z: number,
    x: number,
    y: number,
    maskIndex?: Map<number, number>
): number[] {
    if (cellHasGrass(ctx, z, x, y)) return [];

    const index = maskIndex ?? buildBorderMaskTileIndex(ctx.registry, ctx.borderSetId);
    const availableMasks = new Set(index.keys());
    const ids: number[] = [];

    for (const rawMask of collectBorderDrawMasks(ctx, z, x, y)) {
        const resolved = resolveDrawMaskForRegistry(rawMask, availableMasks);
        if (resolved === 0) continue;
        const tid = index.get(resolved);
        if (tid !== undefined && !ids.includes(tid)) ids.push(tid);
    }

    if (ids.length === 0) {
        const stored = getLayerCell(ctx.borderOverlay, z, x, y);
        if (stored !== EMPTY_TILE_ID) ids.push(stored);
    }

    return ids;
}

const borderDrawTileIdsCache = new Map<string, readonly number[]>();

/** Limpa cache de render de bordas (mapa carregado, undo, reload de tiles). */
export function invalidateBorderDrawCache(): void {
    borderDrawTileIdsCache.clear();
}

/** Invalida células afetadas após recálculo regional (vizinhos incluídos via halo). */
export function invalidateBorderDrawCacheRegion(
    z: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    halo = 2
): void {
    const x0 = Math.max(0, minX - halo);
    const y0 = Math.max(0, minY - halo);
    const x1 = maxX + halo;
    const y1 = maxY + halo;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            borderDrawTileIdsCache.delete(`${z}:${x}:${y}`);
        }
    }
}

/** Mesmo que collectBorderDrawTileIds, mas cacheia por célula até invalidação. */
export function collectBorderDrawTileIdsCached(
    ctx: Pick<
        AutoBorderContext,
        'worldMap' | 'grassOverlay' | 'borderOverlay' | 'registry' | 'fillTerrain' | 'borderSetId'
    >,
    z: number,
    x: number,
    y: number,
    maskIndex?: Map<number, number>
): readonly number[] {
    const key = `${z}:${x}:${y}`;
    const hit = borderDrawTileIdsCache.get(key);
    if (hit !== undefined) return hit;
    const ids = collectBorderDrawTileIds(ctx, z, x, y, maskIndex);
    borderDrawTileIdsCache.set(key, ids);
    return ids;
}

export function recalculateAutoBorderCell(
    ctx: AutoBorderContext,
    z: number,
    x: number,
    y: number,
    maskIndex: Map<number, number>
): void {
    if (!isEligibleBorderFloorCell(ctx, z, x, y)) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }

    const availableMasks = new Set(maskIndex.keys());
    const drawMasks = collectBorderDrawMasks(ctx, z, x, y);
    if (drawMasks.length === 0) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }

    let tileId: number | undefined;
    for (const rawMask of drawMasks) {
        const resolved = resolveDrawMaskForRegistry(rawMask, availableMasks);
        if (resolved === 0) continue;
        const candidate = maskIndex.get(resolved);
        if (candidate !== undefined) {
            tileId = candidate;
            break;
        }
    }

    if (tileId === undefined) {
        clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
        return;
    }
    setLayerCell(ctx.borderOverlay, z, x, y, tileId, ctx.mapSize);
}

export function recalculateAutoBorderRegion(
    ctx: AutoBorderContext,
    z: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): void {
    const maskIndex = buildBorderMaskTileIndex(ctx.registry, ctx.borderSetId);
    if (maskIndex.size === 0) return;

    /** Halo 2: filetes a até 2 células da área alterada (perímetro externo). */
    const halo = 2;
    const x0 = Math.max(0, minX - halo);
    const y0 = Math.max(0, minY - halo);
    const x1 = Math.min(ctx.mapSize - 1, maxX + halo);
    const y1 = Math.min(ctx.mapSize - 1, maxY + halo);

    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (cellHasGrass(ctx, z, x, y)) {
                clearLayerCell(ctx.borderOverlay, z, x, y, ctx.mapSize);
                continue;
            }
            recalculateAutoBorderCell(ctx, z, x, y, maskIndex);
        }
    }

    invalidateBorderDrawCacheRegion(z, x0, y0, x1, y1, 1);
}

export function recalculateAutoBorderFloor(ctx: AutoBorderContext, z: number): void {
    recalculateAutoBorderRegion(ctx, z, 0, 0, ctx.mapSize - 1, ctx.mapSize - 1);
}

export function isGrassPaintSelection(
    selectedId: number,
    registry: TileRegistry,
    fillTerrain = 'grass'
): boolean {
    const tile = registry[selectedId];
    if (!tile) return false;
    if (tile.isVariantBrush) {
        return tile.variantGroup === fillTerrain || tile.variantGroup === 'grass';
    }
    return isGrassTile(tile, fillTerrain);
}

export function shouldUseGrassOverlayOnBase(
    baseId: number,
    registry: TileRegistry,
    fillTerrain: string
): boolean {
    if (baseId === EMPTY_TILE_ID) return false;
    const baseTile = registry[baseId];
    if (!baseTile) return false;
    if (isGrassTile(baseTile, fillTerrain)) return false;
    return isGroundBaseTile(baseTile);
}
