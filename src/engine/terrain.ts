import { getLayerCell } from './mapPaintLayers';
import { createStairHoleTile, getTileFromRegistry } from './tileRegistry';
import type { CollisionQueryContext, RegistryTile } from './types';
import { ENGINE_CONFIG } from './config';

const { EMPTY_TILE_ID } = ENGINE_CONFIG;

function readBaseTileId(
    ctx: CollisionQueryContext,
    z: number,
    tileX: number,
    tileY: number
): number {
    const floor = ctx.worldMap[z];
    if (!floor?.[tileY]) return EMPTY_TILE_ID;
    return floor[tileY][tileX];
}

/** Tile da base (`worldMap`), incluindo buraco de escada. */
export function getBaseTerrainTileAt(
    ctx: CollisionQueryContext,
    tileX: number,
    tileY: number,
    z: number
): RegistryTile | undefined {
    const tid = readBaseTileId(ctx, z, tileX, tileY);
    let tile = getTileFromRegistry(ctx.tileRegistry, tid);

    if (tid === EMPTY_TILE_ID && z > ctx.minFloorZ) {
        const tidBelow = readBaseTileId(ctx, z - 1, tileX, tileY);
        const below =
            tidBelow !== EMPTY_TILE_ID
                ? getTileFromRegistry(ctx.tileRegistry, tidBelow)
                : undefined;
        if (below?.isStair) {
            tile = createStairHoleTile();
        }
    }

    return tile;
}

/** Tile usado para velocidade — overlay grama substitui a base quando presente. */
export function getSpeedTerrainTileAt(
    ctx: CollisionQueryContext,
    tileX: number,
    tileY: number,
    z: number
): RegistryTile | undefined {
    if (ctx.grassOverlay) {
        const grassId = getLayerCell(ctx.grassOverlay, z, tileX, tileY);
        if (grassId !== EMPTY_TILE_ID) {
            const grassTile = getTileFromRegistry(ctx.tileRegistry, grassId);
            if (grassTile) return grassTile;
        }
    }
    return getBaseTerrainTileAt(ctx, tileX, tileY, z);
}

export function getTerrainSpeedModifierAt(
    ctx: CollisionQueryContext,
    tileX: number,
    tileY: number,
    z: number
): number {
    const tile = getSpeedTerrainTileAt(ctx, tileX, tileY, z);
    return tile?.speedModifier ?? 1;
}
