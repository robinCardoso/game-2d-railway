/**
 * Regras de walkable para o servidor (sem imagens / Vite).
 * Alinhado a `src/functions/tileConfig.ts` e IDs legados 0–6.
 */

export const EMPTY_TILE_ID = -1;

/** IDs fixos do mapa starter / tiles antigos. */
const LEGACY_TILE: Record<number, { walkable: boolean; isStair?: boolean }> = {
    0: { walkable: true },
    1: { walkable: true },
    2: { walkable: false },
    3: { walkable: true },
    4: { walkable: false },
    5: { walkable: false },
    6: { walkable: false },
    7: { walkable: true, isStair: true },
    8: { walkable: true, isStair: true },
    9: { walkable: true, isStair: true },
};

export type FloorGrid = number[][];
export type WorldMapGrids = Record<number, FloorGrid>;

export function tilePropsAt(tid: number): { walkable: boolean; isStair: boolean } {
    if (tid === EMPTY_TILE_ID) {
        return { walkable: false, isStair: false };
    }
    const leg = LEGACY_TILE[tid];
    if (leg) {
        return { walkable: leg.walkable, isStair: !!leg.isStair };
    }
    return { walkable: true, isStair: false };
}

export function isTileWalkable(
    worldMap: WorldMapGrids,
    mapSize: number,
    tileX: number,
    tileY: number,
    z: number,
    minFloorZ = -7,
    maxFloorZ = 7
): boolean {
    if (
        tileX < 0 ||
        tileY < 0 ||
        tileX >= mapSize ||
        tileY >= mapSize ||
        z < minFloorZ ||
        z > maxFloorZ
    ) {
        return false;
    }

    const floor = worldMap[z];
    if (!floor?.[tileY]) return false;

    const tid = floor[tileY][tileX];
    const props = tilePropsAt(tid);

    if (tid !== EMPTY_TILE_ID) {
        return props.walkable;
    }

    if (z > minFloorZ) {
        const below = worldMap[z - 1]?.[tileY]?.[tileX];
        if (below !== undefined && tilePropsAt(below).isStair) {
            return true;
        }
    }

    return false;
}

export interface TilePos {
    tileX: number;
    tileY: number;
    z: number;
}

/**
 * Passo adjacente no mesmo Z: ortogonal ou diagonal (distância Chebyshev 1).
 * Escadas: |dz| === 1 no mesmo tile.
 */
export function isAdjacentStep(from: TilePos, to: TilePos): boolean {
    const dx = Math.abs(to.tileX - from.tileX);
    const dy = Math.abs(to.tileY - from.tileY);
    const dz = to.z - from.z;

    if (dz === 0) {
        return dx <= 1 && dy <= 1 && dx + dy >= 1;
    }
    if (Math.abs(dz) === 1 && dx === 0 && dy === 0) {
        return true;
    }
    return false;
}

export function isDiagonalStep(from: TilePos, to: TilePos): boolean {
    return (
        from.z === to.z &&
        Math.abs(to.tileX - from.tileX) === 1 &&
        Math.abs(to.tileY - from.tileY) === 1
    );
}

/**
 * Valida passo adjacente + walkable no destino.
 * Diagonal: bloqueia canto só se **ambos** os cardinais laterais (terreno) estiverem fechados.
 */
export function canAdjacentStep(
    from: TilePos,
    to: TilePos,
    isWalkableAt: (tileX: number, tileY: number, z: number) => boolean
): boolean {
    if (!isAdjacentStep(from, to)) return false;
    if (!isWalkableAt(to.tileX, to.tileY, to.z)) return false;
    if (!isDiagonalStep(from, to)) return true;
    const sideXOk = isWalkableAt(to.tileX, from.tileY, from.z);
    const sideYOk = isWalkableAt(from.tileX, to.tileY, from.z);
    return sideXOk || sideYOk;
}
