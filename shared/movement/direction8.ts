/**
 * Direções 8 vias — protocolo WS e validação servidor.
 * Mapeamento com `GridDirection` do cliente em `toProtocolDirection8` / `fromProtocolDirection8`.
 */

import type { TilePos } from '../tileWalkable.js';

export type Direction8 =
    | 'north'
    | 'south'
    | 'east'
    | 'west'
    | 'north_west'
    | 'north_east'
    | 'south_west'
    | 'south_east';

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

/** Alias usado em `gridMovement.ts` (sem underscore). */
export type GridDirectionAlias =
    | CardinalDirection
    | 'northwest'
    | 'northeast'
    | 'southwest'
    | 'southeast';

export interface DirectionVector {
    dx: -1 | 0 | 1;
    dy: -1 | 0 | 1;
}

export const DIRECTION_VECTORS: Record<Direction8, DirectionVector> = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    east: { dx: 1, dy: 0 },
    west: { dx: -1, dy: 0 },
    north_east: { dx: 1, dy: -1 },
    north_west: { dx: -1, dy: -1 },
    south_east: { dx: 1, dy: 1 },
    south_west: { dx: -1, dy: 1 },
};

const ALL_DIRECTIONS8: Direction8[] = [
    'north',
    'south',
    'east',
    'west',
    'north_west',
    'north_east',
    'south_west',
    'south_east',
];

export function isDirection8(value: unknown): value is Direction8 {
    return typeof value === 'string' && (ALL_DIRECTIONS8 as string[]).includes(value);
}

export function isDiagonalDirection8(direction: Direction8): boolean {
    const v = DIRECTION_VECTORS[direction];
    return v.dx !== 0 && v.dy !== 0;
}

export function directionFromDelta(dx: number, dy: number): Direction8 | null {
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
        return null;
    }
    for (const dir of ALL_DIRECTIONS8) {
        const v = DIRECTION_VECTORS[dir];
        if (v.dx === dx && v.dy === dy) return dir;
    }
    return null;
}

export function applyDirection(tile: TilePos, direction: Direction8): TilePos {
    const v = DIRECTION_VECTORS[direction];
    return {
        tileX: tile.tileX + v.dx,
        tileY: tile.tileY + v.dy,
        z: tile.z,
    };
}

export function toProtocolDirection8(dir: GridDirectionAlias): Direction8 {
    switch (dir) {
        case 'northwest':
            return 'north_west';
        case 'northeast':
            return 'north_east';
        case 'southwest':
            return 'south_west';
        case 'southeast':
            return 'south_east';
        default:
            return dir;
    }
}

export function fromProtocolDirection8(dir: Direction8): GridDirectionAlias {
    switch (dir) {
        case 'north_west':
            return 'northwest';
        case 'north_east':
            return 'northeast';
        case 'south_west':
            return 'southwest';
        case 'south_east':
            return 'southeast';
        default:
            return dir;
    }
}

/** Sprite 4 vias a partir de Direction8 (Opção B do doc Zezenia). */
export function getVisualFacing(direction: Direction8): CardinalDirection {
    switch (direction) {
        case 'north':
            return 'north';
        case 'south':
            return 'south';
        case 'east':
        case 'north_east':
        case 'south_east':
            return 'east';
        case 'west':
        case 'north_west':
        case 'south_west':
            return 'west';
    }
}

/** Direção cardinal de visualização com preferência por última tecla WASD. */
export function getVisualFacingWithKey(
    direction: Direction8,
    lastKey: 'w' | 's' | 'a' | 'd' | null
): CardinalDirection {
    if (!isDiagonalDirection8(direction) || !lastKey) {
        return getVisualFacing(direction);
    }
    switch (direction) {
        case 'north_west':
            return lastKey === 'a' ? 'west' : 'north';
        case 'north_east':
            return lastKey === 'd' ? 'east' : 'north';
        case 'south_west':
            return lastKey === 'a' ? 'west' : 'south';
        case 'south_east':
            return lastKey === 'd' ? 'east' : 'south';
        default:
            return getVisualFacing(direction);
    }
}

export function direction8FromTiles(from: TilePos, to: TilePos): Direction8 | null {
    return directionFromDelta(to.tileX - from.tileX, to.tileY - from.tileY);
}
