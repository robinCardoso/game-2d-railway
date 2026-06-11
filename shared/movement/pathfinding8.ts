/**
 * A* 8 direções — custo ortogonal 1, diagonal 1.15.
 * Cada expansão diagonal usa `canAdjacentStep` (regra OR de canto).
 */

import { applyDirection, type Direction8 } from './direction8.js';
import { chebyshevDistance } from './distance.js';
import type { TilePos } from '../tileWalkable.js';
import { canAdjacentStep } from '../tileWalkable.js';

export const PATHFIND_CARDINAL_COST = 1;
export const PATHFIND_DIAGONAL_COST = 1.15;

const NEIGHBOR_DIRS: Direction8[] = [
    'north',
    'south',
    'east',
    'west',
    'north_west',
    'north_east',
    'south_west',
    'south_east',
];

export interface Pathfind8Options {
    maxNodes?: number;
    heuristic?: (from: TilePos, to: TilePos) => number;
}

function stepCost(dir: Direction8): number {
    return dir.includes('_') ? PATHFIND_DIAGONAL_COST : PATHFIND_CARDINAL_COST;
}

function tileKey(p: TilePos): string {
    return `${p.tileX},${p.tileY},${p.z}`;
}

function parseTileKey(key: string): TilePos {
    const [tx, ty, tz] = key.split(',').map(Number);
    return { tileX: tx!, tileY: ty!, z: tz! };
}

/** Caminho de tiles (origem → destino) ou `null`. */
export function findPath8(
    start: TilePos,
    goal: TilePos,
    isWalkableAt: (tileX: number, tileY: number, z: number) => boolean,
    options: Pathfind8Options = {}
): TilePos[] | null {
    if (start.z !== goal.z) return null;
    if (start.tileX === goal.tileX && start.tileY === goal.tileY) {
        return [start];
    }

    const maxNodes = options.maxNodes ?? 512;
    const heuristic =
        options.heuristic ??
        ((a: TilePos, b: TilePos) =>
            chebyshevDistance(a.tileX, a.tileY, b.tileX, b.tileY));

    type QNode = { key: string; pos: TilePos; g: number; f: number };
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const open: QNode[] = [];
    const startKey = tileKey(start);

    gScore.set(startKey, 0);
    open.push({ key: startKey, pos: start, g: 0, f: heuristic(start, goal) });

    let expanded = 0;
    while (open.length > 0 && expanded < maxNodes) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift()!;
        expanded += 1;

        if (current.pos.tileX === goal.tileX && current.pos.tileY === goal.tileY) {
            const path: TilePos[] = [current.pos];
            let ck: string = current.key;
            while (cameFrom.has(ck)) {
                const pk: string = cameFrom.get(ck)!;
                path.unshift(parseTileKey(pk));
                ck = pk;
            }
            return path;
        }

        for (const dir of NEIGHBOR_DIRS) {
            const next = applyDirection(current.pos, dir);
            if (!isWalkableAt(next.tileX, next.tileY, next.z)) continue;
            if (!canAdjacentStep(current.pos, next, isWalkableAt)) continue;

            const nk = tileKey(next);
            const tentative = (gScore.get(current.key) ?? Infinity) + stepCost(dir);
            if (tentative >= (gScore.get(nk) ?? Infinity)) continue;

            cameFrom.set(nk, current.key);
            gScore.set(nk, tentative);
            const f = tentative + heuristic(next, goal);
            if (!open.some((n) => n.key === nk)) {
                open.push({ key: nk, pos: next, g: tentative, f });
            }
        }
    }

    return null;
}

/** Primeiro passo Direction8 do caminho (exclui origem). */
export function findPath8FirstDirection(
    start: TilePos,
    goal: TilePos,
    isWalkableAt: (tileX: number, tileY: number, z: number) => boolean,
    options?: Pathfind8Options
): Direction8 | null {
    const path = findPath8(start, goal, isWalkableAt, options);
    if (!path || path.length < 2) return null;
    const next = path[1]!;
    for (const dir of NEIGHBOR_DIRS) {
        const p = applyDirection(start, dir);
        if (p.tileX === next.tileX && p.tileY === next.tileY) return dir;
    }
    return null;
}
