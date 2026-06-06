/** Lógica pura de chase de monstros — compartilhada cliente/servidor. */

export const MONSTER_AGGRO_RADIUS = 7;
export const MONSTER_STEP_MS = 360;

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export const CARDINAL_STEPS: ReadonlyArray<{
    dx: number;
    dy: number;
    dir: CardinalDirection;
}> = [
    { dx: 1, dy: 0, dir: 'east' },
    { dx: -1, dy: 0, dir: 'west' },
    { dx: 0, dy: 1, dir: 'south' },
    { dx: 0, dy: -1, dir: 'north' },
];

export function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

function tileKey(tx: number, ty: number): string {
    return `${tx},${ty}`;
}

export function findMeleeGoalTiles(
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): Array<{ tx: number; ty: number }> {
    const goals: Array<{ tx: number; ty: number }> = [];
    for (const { dx, dy } of CARDINAL_STEPS) {
        const tx = playerTileX + dx;
        const ty = playerTileY + dy;
        if (canWalkTo(tx, ty)) {
            goals.push({ tx, ty });
        }
    }
    return goals;
}

export function pickMeleeGoalTile(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>
): { tx: number; ty: number } {
    const goals = findMeleeGoalTiles(playerTileX, playerTileY, canWalkTo);
    let best: { tx: number; ty: number } | null = null;
    let bestDist = Infinity;

    for (const goal of goals) {
        const key = tileKey(goal.tx, goal.ty);
        if (reservedGoals.has(key)) continue;
        const d = manhattanDist(mobTileX, mobTileY, goal.tx, goal.ty);
        if (d < bestDist) {
            bestDist = d;
            best = goal;
        }
    }

    if (best) {
        reservedGoals.add(tileKey(best.tx, best.ty));
        return best;
    }

    return { tx: playerTileX, ty: playerTileY };
}

export function pickMonsterChaseStep(
    mobTileX: number,
    mobTileY: number,
    goalX: number,
    goalY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): (typeof CARDINAL_STEPS)[number] | null {
    const currentGoalDist = manhattanDist(mobTileX, mobTileY, goalX, goalY);

    let bestCloser: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestCloserDist = currentGoalDist;

    let bestSidestep: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestSidestepDist = Infinity;

    let bestAny: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestAnyDist = Infinity;

    for (const step of CARDINAL_STEPS) {
        const nx = mobTileX + step.dx;
        const ny = mobTileY + step.dy;
        if (!canWalkTo(nx, ny)) continue;

        const d = manhattanDist(nx, ny, goalX, goalY);

        if (d < bestCloserDist) {
            bestCloserDist = d;
            bestCloser = step;
        }

        if (d >= currentGoalDist && d <= currentGoalDist + 1 && d < bestSidestepDist) {
            bestSidestepDist = d;
            bestSidestep = step;
        }

        if (d < bestAnyDist) {
            bestAnyDist = d;
            bestAny = step;
        }
    }

    if (bestCloser) return bestCloser;
    if (bestSidestep) return bestSidestep;
    return bestAny;
}

export interface ChaseMobState {
    tileX: number;
    tileY: number;
    z: number;
    lastAggroMoveTime: number;
}

export interface ChasePlayerTarget {
    tileX: number;
    tileY: number;
    z: number;
}

/** @returns passo escolhido ou null se parado/adjacente/bloqueado. */
export function tickMonsterChaseStep(
    mob: ChaseMobState,
    player: ChasePlayerTarget,
    nowMs: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>
): (typeof CARDINAL_STEPS)[number] | null {
    const distToPlayer = manhattanDist(mob.tileX, mob.tileY, player.tileX, player.tileY);
    if (distToPlayer > MONSTER_AGGRO_RADIUS || player.z !== mob.z) return null;
    if (distToPlayer <= 1) return null;
    if (nowMs - mob.lastAggroMoveTime < MONSTER_STEP_MS) return null;

    const goal = pickMeleeGoalTile(
        mob.tileX,
        mob.tileY,
        player.tileX,
        player.tileY,
        canWalkTo,
        reservedGoals
    );
    const step = pickMonsterChaseStep(mob.tileX, mob.tileY, goal.tx, goal.ty, canWalkTo);
    if (!step) return null;

    mob.tileX += step.dx;
    mob.tileY += step.dy;
    mob.lastAggroMoveTime = nowMs;
    return step;
}
