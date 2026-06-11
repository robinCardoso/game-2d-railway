/**
 * Auto-walk cliente — preview de caminho A* 8-dir; servidor valida cada passo.
 */

import { findPath8, findPath8FirstDirection } from '../../shared/movement/pathfinding8';
import { fromProtocolDirection8 } from '../../shared/movement/direction8';
import type { TilePos } from '../../shared/tileWalkable';
import type { GridDirection } from './gridMovement';

export interface AutoWalkState {
    active: boolean;
    goal: TilePos | null;
    previewPath: TilePos[];
}

export function createAutoWalkState(): AutoWalkState {
    return { active: false, goal: null, previewPath: [] };
}

export function setAutoWalkGoal(
    state: AutoWalkState,
    from: TilePos,
    goal: TilePos,
    isWalkableAt: (x: number, y: number, z: number) => boolean
): void {
    state.goal = goal;
    state.previewPath = findPath8(from, goal, isWalkableAt) ?? [];
    state.active = state.previewPath.length > 1;
}

export function clearAutoWalk(state: AutoWalkState): void {
    state.active = false;
    state.goal = null;
    state.previewPath = [];
}

/** Próxima direção sugerida (consumir um passo por tick de movimento). */
export function tickAutoWalkDirection(
    state: AutoWalkState,
    from: TilePos,
    isWalkableAt: (x: number, y: number, z: number) => boolean
): GridDirection | null {
    if (!state.active || !state.goal) return null;

    if (from.tileX === state.goal.tileX && from.tileY === state.goal.tileY) {
        clearAutoWalk(state);
        return null;
    }

    const dir8 = findPath8FirstDirection(from, state.goal, isWalkableAt);
    if (!dir8) {
        clearAutoWalk(state);
        return null;
    }

    state.previewPath = findPath8(from, state.goal, isWalkableAt) ?? [];
    return fromProtocolDirection8(dir8);
}
