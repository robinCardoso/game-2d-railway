/** Lógica pura de chase de monstros — compartilhada cliente/servidor. */

export const MONSTER_AGGRO_RADIUS = 7;
export const MONSTER_STEP_MS = 360;
/** Pausa após o jogador mudar de tile antes do mob reagir (estilo Tibia / think time). */
export const MONSTER_REACTION_DELAY_MS = 200;

export type MobChaseBehavior = 'melee' | 'ranged';

export interface ChaseMobConfig {
    chaseBehavior: MobChaseBehavior;
    /** Distância Manhattan ideal para combate. */
    attackRange: number;
}

export const DEFAULT_MELEE_CHASE_CONFIG: ChaseMobConfig = {
    chaseBehavior: 'melee',
    attackRange: 1,
};

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

/** Caminho cardinal reto mob→meta passa por tile bloqueado (ex.: árvore na mesma coluna). */
function isCardinalPathBlocked(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): boolean {
    if (fromX === toX) {
        const dy = Math.sign(toY - fromY);
        if (dy === 0) return false;
        for (let y = fromY + dy; y !== toY; y += dy) {
            if (!canWalkTo(fromX, y)) return true;
        }
    } else if (fromY === toY) {
        const dx = Math.sign(toX - fromX);
        if (dx === 0) return false;
        for (let x = fromX + dx; x !== toX; x += dx) {
            if (!canWalkTo(x, fromY)) return true;
        }
    }
    return false;
}

function isBetterChaseGoal(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    candidate: { tx: number; ty: number },
    current: { tx: number; ty: number },
    dist: number,
    bestDist: number,
    canWalkTo: (tx: number, ty: number) => boolean
): boolean {
    if (dist < bestDist) return true;
    if (dist > bestDist) return false;

    const candidateBlocked = isCardinalPathBlocked(
        mobTileX,
        mobTileY,
        candidate.tx,
        candidate.ty,
        canWalkTo
    );
    const currentBlocked = isCardinalPathBlocked(
        mobTileX,
        mobTileY,
        current.tx,
        current.ty,
        canWalkTo
    );
    if (candidateBlocked !== currentBlocked) {
        return !candidateBlocked;
    }

    const candidatePlayerDist = manhattanDist(candidate.tx, candidate.ty, playerTileX, playerTileY);
    const currentPlayerDist = manhattanDist(current.tx, current.ty, playerTileX, playerTileY);
    return candidatePlayerDist < currentPlayerDist;
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
        if (
            !best ||
            isBetterChaseGoal(mobTileX, mobTileY, playerTileX, playerTileY, goal, best, d, bestDist, canWalkTo)
        ) {
            bestDist = d;
            best = goal;
        }
    }

    if (best) {
        reservedGoals.add(tileKey(best.tx, best.ty));
        return best;
    }

    // Sem slot melee livre — aproximar do jogador (canWalkTo impede pisar no tile do player).
    return { tx: playerTileX, ty: playerTileY };
}

/** Ping-pong na mesma linha/coluna do alvo — não bloqueia contorno perpendicular. */
function isPingPongRetreat(
    step: { dx: number; dy: number },
    mobTileX: number,
    mobTileY: number,
    goalX: number,
    goalY: number
): boolean {
    if (
        mobTileY === goalY &&
        step.dy === 0 &&
        step.dx !== 0 &&
        goalX !== mobTileX
    ) {
        return Math.sign(step.dx) !== Math.sign(goalX - mobTileX);
    }
    if (
        mobTileX === goalX &&
        step.dx === 0 &&
        step.dy !== 0 &&
        goalY !== mobTileY
    ) {
        return Math.sign(step.dy) !== Math.sign(goalY - mobTileY);
    }
    return false;
}

export function pickMonsterChaseStep(
    mobTileX: number,
    mobTileY: number,
    goalX: number,
    goalY: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    /** Desempate quando vários passos empatam (ex.: distância ao jogador). */
    playerTileX?: number,
    playerTileY?: number
): (typeof CARDINAL_STEPS)[number] | null {
    const currentGoalDist = manhattanDist(mobTileX, mobTileY, goalX, goalY);
    const hasPlayerTieBreak = playerTileX !== undefined && playerTileY !== undefined;

    let bestCloser: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestCloserDist = currentGoalDist;
    let bestCloserPlayerDist = Infinity;

    let bestSidestep: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestSidestepDist = Infinity;
    let bestSidestepPlayerDist = Infinity;

    let bestAny: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestAnyDist = Infinity;
    let bestAnyPlayerDist = Infinity;

    for (const step of CARDINAL_STEPS) {
        const nx = mobTileX + step.dx;
        const ny = mobTileY + step.dy;
        if (!canWalkTo(nx, ny)) continue;

        const d = manhattanDist(nx, ny, goalX, goalY);
        const pingPong = isPingPongRetreat(step, mobTileX, mobTileY, goalX, goalY);
        const playerDist = hasPlayerTieBreak
            ? manhattanDist(nx, ny, playerTileX!, playerTileY!)
            : Infinity;

        if (d < bestCloserDist || (d === bestCloserDist && playerDist < bestCloserPlayerDist)) {
            bestCloserDist = d;
            bestCloserPlayerDist = playerDist;
            bestCloser = step;
        }

        if (
            !pingPong &&
            d >= currentGoalDist &&
            d <= currentGoalDist + 1 &&
            (d < bestSidestepDist || (d === bestSidestepDist && playerDist < bestSidestepPlayerDist))
        ) {
            bestSidestepDist = d;
            bestSidestepPlayerDist = playerDist;
            bestSidestep = step;
        }

        if (
            !pingPong &&
            (d < bestAnyDist || (d === bestAnyDist && playerDist < bestAnyPlayerDist))
        ) {
            bestAnyDist = d;
            bestAnyPlayerDist = playerDist;
            bestAny = step;
        }
    }

    if (bestCloser) return bestCloser;
    if (bestSidestep) return bestSidestep;
    return bestAny;
}

/** Tiles em anel Manhattan a N SQM do jogador (posição ideal de mago/arqueiro). */
export function findRangedGoalTiles(
    playerTileX: number,
    playerTileY: number,
    attackRange: number,
    canWalkTo: (tx: number, ty: number) => boolean
): Array<{ tx: number; ty: number }> {
    const goals: Array<{ tx: number; ty: number }> = [];
    for (let dx = -attackRange; dx <= attackRange; dx++) {
        for (let dy = -attackRange; dy <= attackRange; dy++) {
            if (Math.abs(dx) + Math.abs(dy) !== attackRange) continue;
            const tx = playerTileX + dx;
            const ty = playerTileY + dy;
            if (canWalkTo(tx, ty)) {
                goals.push({ tx, ty });
            }
        }
    }
    return goals;
}

export function pickRangedGoalTile(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    attackRange: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>
): { tx: number; ty: number } {
    const goals = findRangedGoalTiles(playerTileX, playerTileY, attackRange, canWalkTo);
    let best: { tx: number; ty: number } | null = null;
    let bestDist = Infinity;

    for (const goal of goals) {
        const key = tileKey(goal.tx, goal.ty);
        if (reservedGoals.has(key)) continue;
        const d = manhattanDist(mobTileX, mobTileY, goal.tx, goal.ty);
        if (
            !best ||
            isBetterChaseGoal(mobTileX, mobTileY, playerTileX, playerTileY, goal, best, d, bestDist, canWalkTo)
        ) {
            bestDist = d;
            best = goal;
        }
    }

    if (best) {
        reservedGoals.add(tileKey(best.tx, best.ty));
        return best;
    }

    // Sem tile livre no anel — aproximar sem entrar no alcance melee.
    return { tx: playerTileX, ty: playerTileY };
}

/** Afasta-se do jogador quando ele entra dentro do alcance desejado. */
export function pickFleeStep(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): (typeof CARDINAL_STEPS)[number] | null {
    const currentDist = manhattanDist(mobTileX, mobTileY, playerTileX, playerTileY);

    let bestStep: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestDist = currentDist;

    for (const step of CARDINAL_STEPS) {
        const nx = mobTileX + step.dx;
        const ny = mobTileY + step.dy;
        if (!canWalkTo(nx, ny)) continue;
        const d = manhattanDist(nx, ny, playerTileX, playerTileY);
        if (d > bestDist) {
            bestDist = d;
            bestStep = step;
        }
    }
    if (bestStep) return bestStep;

    for (const step of CARDINAL_STEPS) {
        const nx = mobTileX + step.dx;
        const ny = mobTileY + step.dy;
        if (!canWalkTo(nx, ny)) continue;
        const d = manhattanDist(nx, ny, playerTileX, playerTileY);
        if (d >= currentDist) {
            return step;
        }
    }

    return null;
}

export interface ChaseReactionState {
    lastSeenPlayerTileX?: number;
    lastSeenPlayerTileY?: number;
    reactAfterMs?: number;
}

export interface ChaseMobState extends ChaseReactionState {
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

/** Posição em tile do alvo (ex.: jogador). */
export function applyPlayerMoveReactionDelay(
    mob: ChaseReactionState,
    player: Pick<ChasePlayerTarget, 'tileX' | 'tileY'>,
    nowMs: number
): void {
    if (mob.lastSeenPlayerTileX === undefined || mob.lastSeenPlayerTileY === undefined) {
        mob.lastSeenPlayerTileX = player.tileX;
        mob.lastSeenPlayerTileY = player.tileY;
        return;
    }
    if (
        mob.lastSeenPlayerTileX !== player.tileX ||
        mob.lastSeenPlayerTileY !== player.tileY
    ) {
        mob.lastSeenPlayerTileX = player.tileX;
        mob.lastSeenPlayerTileY = player.tileY;
        mob.reactAfterMs = nowMs + MONSTER_REACTION_DELAY_MS;
    }
}

export function isMonsterReactionPaused(mob: ChaseReactionState, nowMs: number): boolean {
    return mob.reactAfterMs !== undefined && nowMs < mob.reactAfterMs;
}

/** @returns passo escolhido ou null se parado/no alcance/bloqueado. */
export function tickMonsterChaseStep(
    mob: ChaseMobState,
    player: ChasePlayerTarget,
    nowMs: number,
    canStepTo: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>,
    config: ChaseMobConfig = DEFAULT_MELEE_CHASE_CONFIG,
    /** Tiles candidatos a meta (terreno + não-pisar no jogador). Outros mobs não bloqueiam a meta. */
    canGoalTile: (tx: number, ty: number) => boolean = canStepTo
): (typeof CARDINAL_STEPS)[number] | null {
    const distToPlayer = manhattanDist(mob.tileX, mob.tileY, player.tileX, player.tileY);
    if (distToPlayer > MONSTER_AGGRO_RADIUS || player.z !== mob.z) return null;

    applyPlayerMoveReactionDelay(mob, player, nowMs);

    const { chaseBehavior, attackRange } = config;

    if (chaseBehavior === 'melee') {
        if (distToPlayer <= attackRange) return null;
    } else if (distToPlayer === attackRange) {
        return null;
    }

    if (isMonsterReactionPaused(mob, nowMs)) return null;

    if (nowMs - mob.lastAggroMoveTime < MONSTER_STEP_MS) return null;

    let step: (typeof CARDINAL_STEPS)[number] | null = null;

    if (chaseBehavior === 'melee') {
        const goal = pickMeleeGoalTile(
            mob.tileX,
            mob.tileY,
            player.tileX,
            player.tileY,
            canGoalTile,
            reservedGoals
        );
        step = pickMonsterChaseStep(
            mob.tileX,
            mob.tileY,
            goal.tx,
            goal.ty,
            canStepTo,
            player.tileX,
            player.tileY
        );
    } else if (distToPlayer < attackRange) {
        step = pickFleeStep(mob.tileX, mob.tileY, player.tileX, player.tileY, canStepTo);
    } else {
        const goal = pickRangedGoalTile(
            mob.tileX,
            mob.tileY,
            player.tileX,
            player.tileY,
            attackRange,
            canGoalTile,
            reservedGoals
        );
        step = pickMonsterChaseStep(
            mob.tileX,
            mob.tileY,
            goal.tx,
            goal.ty,
            canStepTo,
            player.tileX,
            player.tileY
        );
    }

    if (!step) return null;

    mob.tileX += step.dx;
    mob.tileY += step.dy;
    mob.lastAggroMoveTime = nowMs;
    return step;
}
