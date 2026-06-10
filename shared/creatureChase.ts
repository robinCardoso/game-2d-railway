/** Lógica pura de chase de monstros — compartilhada cliente/servidor. */

export const MONSTER_AGGRO_RADIUS = 7;
/** Máximo de mobs com IA de chase ativa por jogador-alvo (surround 8 + fila no anel). */
export const MONSTER_MAX_ACTIVE_CHASERS_PER_TARGET = 10;

/** Mobs já no alcance de combate sempre pensam; fora dele respeitam o cap de aproximação. */
export function shouldMonsterApproachChase(
    combatDist: number,
    attackRange: number,
    activeApproachersForTarget: number,
    cap = MONSTER_MAX_ACTIVE_CHASERS_PER_TARGET
): boolean {
    if (combatDist <= attackRange) return true;
    return activeApproachersForTarget < cap;
}

/** Distância Manhattan do anel de espera quando slots melee adjacentes estão cheios. */
export const MELEE_WAIT_RING_DIST = 2;
export const MONSTER_STEP_MS = 300;
export const WALK_STEP_MS_MIN = 150;
export const WALK_STEP_MS_MAX = 2000;
/** Pausa após spawn/respawn ou quando o jogador entra no mapa (estático estilo Tibia). */
export const MONSTER_WAKE_DELAY_MS = 2000;
/** Pausa após o jogador mudar de tile (think time). 0 = desligado — evita travar perseguição contínua. */
export const MONSTER_REACTION_DELAY_MS = 0;
/** Limite de nós no BFS de pathfinding (paridade OTC MAX_NODES). */
export const CHASE_PATH_MAX_NODES = 512;
/** Raio Manhattan máximo de busca a partir do mob (paridade OTC maxSearchDist). */
export const CHASE_PATH_SEARCH_RADIUS = 12;

export type MobChaseBehavior = 'melee' | 'ranged';

export interface ChaseMobConfig {
    chaseBehavior: MobChaseBehavior;
    /** Distância Manhattan ideal para combate. */
    attackRange: number;
    /** Ranged: distância mínima confortável — abaixo disso foge. */
    minRange: number;
    /** Ranged: distância máxima confortável — acima disso aproxima. */
    maxRange: number;
    /** Ms por tile cardinal (velocidade de caminhada). */
    walkStepMs: number;
}

export const DEFAULT_MELEE_CHASE_CONFIG: ChaseMobConfig = {
    chaseBehavior: 'melee',
    attackRange: 1,
    minRange: 1,
    maxRange: 1,
    walkStepMs: MONSTER_STEP_MS,
};

/** Faixa de conforto efetiva para mobs ranged (defaults derivados de attackRange). */
export function resolveRangedComfortBand(config: ChaseMobConfig): {
    minRange: number;
    maxRange: number;
} {
    if (config.chaseBehavior === 'melee') {
        return { minRange: 1, maxRange: 1 };
    }
    const minRange = config.minRange ?? Math.max(1, config.attackRange - 1);
    const maxRange = config.maxRange ?? config.attackRange + 1;
    return {
        minRange: Math.min(minRange, config.attackRange),
        maxRange: Math.max(maxRange, config.attackRange),
    };
}

export function isRangedInComfortZone(distToPlayer: number, config: ChaseMobConfig): boolean {
    if (config.chaseBehavior !== 'ranged') return false;
    const { minRange, maxRange } = resolveRangedComfortBand(config);
    return distToPlayer >= minRange && distToPlayer <= maxRange;
}

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

/** Distância Chebyshev (1 = adjacente inclusive diagonal — surround Tibia). */
export function chebyshevDist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

/** Alcance efetivo mob→jogador: melee usa Chebyshev; ranged mantém Manhattan. */
export function chaseDistanceToPlayer(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    config: ChaseMobConfig
): number {
    if (config.chaseBehavior === 'melee') {
        return chebyshevDist(mobTileX, mobTileY, playerTileX, playerTileY);
    }
    return manhattanDist(mobTileX, mobTileY, playerTileX, playerTileY);
}

/** Direção cardinal dominante de um tile em direção a outro (sem movimento). */
export function directionTowardTile(
    fromTileX: number,
    fromTileY: number,
    toTileX: number,
    toTileY: number,
    currentDirection?: CardinalDirection
): CardinalDirection {
    const dx = toTileX - fromTileX;
    const dy = toTileY - fromTileY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx > absDy) {
        return dx > 0 ? 'east' : 'west';
    }
    if (absDy > absDx) {
        return dy > 0 ? 'south' : 'north';
    }
    // Empate diagonal — histerese para não oscilar norte/sul vs leste/oeste
    if (absDx > 0 && currentDirection) {
        if (
            (currentDirection === 'east' || currentDirection === 'west') &&
            absDx >= absDy
        ) {
            return dx > 0 ? 'east' : 'west';
        }
        if (
            (currentDirection === 'north' || currentDirection === 'south') &&
            absDy >= absDx
        ) {
            return dy > 0 ? 'south' : 'north';
        }
    }
    if (dy !== 0) {
        return dy > 0 ? 'south' : 'north';
    }
    if (dx !== 0) {
        return dx > 0 ? 'east' : 'west';
    }
    return currentDirection ?? 'south';
}

/** Olhar para o jogador durante aggro (unifica engaged + idle). */
export function resolveAggroFaceDirection(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    playerZ: number,
    mobZ: number,
    currentDirection?: CardinalDirection
): CardinalDirection | null {
    const distToPlayer = manhattanDist(mobTileX, mobTileY, playerTileX, playerTileY);
    if (distToPlayer > MONSTER_AGGRO_RADIUS || playerZ !== mobZ) return null;
    if (distToPlayer === 0) return null;
    return directionTowardTile(
        mobTileX,
        mobTileY,
        playerTileX,
        playerTileY,
        currentDirection
    );
}

/** Direção para olhar ao jogador quando parado no alcance de combate. */
export function chaseFaceDirectionWhenEngaged(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    config: ChaseMobConfig
): CardinalDirection | null {
    const distToPlayer = chaseDistanceToPlayer(
        mobTileX,
        mobTileY,
        playerTileX,
        playerTileY,
        config
    );
    const { chaseBehavior, attackRange } = config;
    const engaged =
        chaseBehavior === 'melee'
            ? distToPlayer > 0 && distToPlayer <= attackRange
            : isRangedInComfortZone(distToPlayer, config);

    if (!engaged) return null;
    return directionTowardTile(mobTileX, mobTileY, playerTileX, playerTileY);
}

/** Direção quando aggroed mas sem passo (paridade npcAI faceTowardTile / !step). */
export function resolveChaseIdleDirection(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    playerZ: number,
    mobZ: number
): CardinalDirection | null {
    return resolveAggroFaceDirection(
        mobTileX,
        mobTileY,
        playerTileX,
        playerTileY,
        playerZ,
        mobZ
    );
}

function tileKey(tx: number, ty: number): string {
    return `${tx},${ty}`;
}

/**
 * BFS cardinal — primeiro passo em direção ao tile-livre mais próximo (qualquer meta).
 * Contorna mobs/obstáculos que o greedy de 1 passo não resolve.
 */
export function findCardinalPathFirstStep(
    startTileX: number,
    startTileY: number,
    goals: ReadonlyArray<{ tx: number; ty: number }>,
    canStepTo: (tx: number, ty: number) => boolean
): (typeof CARDINAL_STEPS)[number] | null {
    if (goals.length === 0) return null;

    const goalKeys = new Set<string>();
    for (const goal of goals) {
        goalKeys.add(tileKey(goal.tx, goal.ty));
    }

    if (goalKeys.has(tileKey(startTileX, startTileY))) {
        return null;
    }

    type QueueNode = { x: number; y: number; firstStep: (typeof CARDINAL_STEPS)[number] };
    const visited = new Set<string>();
    const queue: QueueNode[] = [];

    const withinSearch = (tx: number, ty: number) =>
        manhattanDist(tx, ty, startTileX, startTileY) <= CHASE_PATH_SEARCH_RADIUS;

    for (const step of CARDINAL_STEPS) {
        const nx = startTileX + step.dx;
        const ny = startTileY + step.dy;
        if (!canStepTo(nx, ny) || !withinSearch(nx, ny)) continue;
        const key = tileKey(nx, ny);
        if (goalKeys.has(key)) return step;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, firstStep: step });
    }

    let expanded = 0;
    while (queue.length > 0 && expanded < CHASE_PATH_MAX_NODES) {
        const cur = queue.shift()!;
        expanded += 1;

        for (const step of CARDINAL_STEPS) {
            const nx = cur.x + step.dx;
            const ny = cur.y + step.dy;
            if (!canStepTo(nx, ny) || !withinSearch(nx, ny)) continue;
            const key = tileKey(nx, ny);
            if (goalKeys.has(key)) return cur.firstStep;
            if (visited.has(key)) continue;
            visited.add(key);
            queue.push({ x: nx, y: ny, firstStep: cur.firstStep });
        }
    }

    return null;
}

/** Metas de surround livres ou, se cheio, tiles livres no anel de espera. */
export function collectMeleeChaseGoals(
    playerTileX: number,
    playerTileY: number,
    canGoalTile: (tx: number, ty: number) => boolean,
    canStepTo: (tx: number, ty: number) => boolean
): Array<{ tx: number; ty: number }> {
    const surround = findMeleeGoalTiles(playerTileX, playerTileY, canGoalTile);
    if (surround.length > 0) return surround;
    return findMeleeRingTiles(
        playerTileX,
        playerTileY,
        MELEE_WAIT_RING_DIST,
        canStepTo
    );
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
        const stepY = toY - fromY;
        if (stepY === 0) return false;
        const dy = Math.sign(stepY);
        for (let y = fromY + dy; y !== toY; y += dy) {
            if (!canWalkTo(fromX, y)) return true;
        }
        return false;
    }
    if (fromY !== toY) return false;

    const stepX = toX - fromX;
    if (stepX === 0) return false;
    const dx = Math.sign(stepX);
    for (let x = fromX + dx; x !== toX; x += dx) {
        if (!canWalkTo(x, fromY)) return true;
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

    const candidatePlayerDist = chebyshevDist(candidate.tx, candidate.ty, playerTileX, playerTileY);
    const currentPlayerDist = chebyshevDist(current.tx, current.ty, playerTileX, playerTileY);
    return candidatePlayerDist < currentPlayerDist;
}

/** Tiles adjacentes ao jogador (8 direções — surround estilo Tibia). */
export function findMeleeGoalTiles(
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): Array<{ tx: number; ty: number }> {
    const goals: Array<{ tx: number; ty: number }> = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const tx = playerTileX + dx;
            const ty = playerTileY + dy;
            if (canWalkTo(tx, ty)) {
                goals.push({ tx, ty });
            }
        }
    }
    return goals;
}

export function pickMeleeGoalTile(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    /** Slots adjacentes livres (terreno + sem jogador/outro mob). */
    canWalkTo: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>,
    /** Quando informado, ignora metas sem passo cardinal alcançável neste tick. */
    canStepTo?: (tx: number, ty: number) => boolean,
    /** Metas já tentadas neste tick — tenta o próximo slot livre (estilo OTC, sem reserva global). */
    excludeGoals?: Set<string>
): { tx: number; ty: number } | null {
    const goals = findMeleeGoalTiles(playerTileX, playerTileY, canWalkTo);
    let best: { tx: number; ty: number } | null = null;
    let bestDist = Infinity;

    for (const goal of goals) {
        const key = tileKey(goal.tx, goal.ty);
        if (reservedGoals.has(key)) continue;
        if (excludeGoals?.has(key)) continue;
        if (
            canStepTo &&
            pickMonsterChaseStep(mobTileX, mobTileY, goal.tx, goal.ty, canStepTo) === null
        ) {
            continue;
        }
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
        return best;
    }

    return null;
}

/** Tiles em anel Manhattan a N SQM do jogador (fila de espera melee). */
export function findMeleeRingTiles(
    playerTileX: number,
    playerTileY: number,
    ringDist: number,
    canWalkTo: (tx: number, ty: number) => boolean
): Array<{ tx: number; ty: number }> {
    const goals: Array<{ tx: number; ty: number }> = [];
    for (let dx = -ringDist; dx <= ringDist; dx++) {
        const dyMag = ringDist - Math.abs(dx);
        const dyValues = dyMag === 0 ? [0] : [dyMag, -dyMag];
        for (const dy of dyValues) {
            const tx = playerTileX + dx;
            const ty = playerTileY + dy;
            if (canWalkTo(tx, ty)) {
                goals.push({ tx, ty });
            }
        }
    }
    return goals;
}

/** Meta no anel de espera (tile livre) — nunca o tile do jogador. */
export function pickMeleeRingGoalTile(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    excludeGoals?: Set<string>
): { tx: number; ty: number } | null {
    const goals = findMeleeRingTiles(
        playerTileX,
        playerTileY,
        MELEE_WAIT_RING_DIST,
        canWalkTo
    );
    let best: { tx: number; ty: number } | null = null;
    let bestDist = Infinity;

    for (const goal of goals) {
        const key = tileKey(goal.tx, goal.ty);
        if (excludeGoals?.has(key)) continue;
        const d = manhattanDist(mobTileX, mobTileY, goal.tx, goal.ty);
        if (d < bestDist) {
            bestDist = d;
            best = goal;
        }
    }

    return best;
}

/**
 * Orbita no anel de espera (estilo dance step OTC) — mantém distância ao jogador.
 */
export function pickDanceStep(
    mobTileX: number,
    mobTileY: number,
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    holdDist = MELEE_WAIT_RING_DIST
): (typeof CARDINAL_STEPS)[number] | null {
    const currentDist = manhattanDist(mobTileX, mobTileY, playerTileX, playerTileY);
    if (currentDist < holdDist) return null;

    let best: (typeof CARDINAL_STEPS)[number] | null = null;
    let bestScore = -Infinity;

    for (const step of CARDINAL_STEPS) {
        const nx = mobTileX + step.dx;
        const ny = mobTileY + step.dy;
        if (!canWalkTo(nx, ny)) continue;
        const d = manhattanDist(nx, ny, playerTileX, playerTileY);
        if (d !== holdDist) continue;

        const onSameRow = mobTileY === playerTileY && step.dy === 0;
        const onSameCol = mobTileX === playerTileX && step.dx === 0;
        const score = onSameRow || onSameCol ? 2 : 1;
        if (score > bestScore) {
            bestScore = score;
            best = step;
        }
    }

    return best;
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
    wakeUntilMs?: number;
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
        if (
            MONSTER_REACTION_DELAY_MS > 0 &&
            !isMonsterReactionPaused(mob, nowMs)
        ) {
            mob.reactAfterMs = nowMs + MONSTER_REACTION_DELAY_MS;
        }
    }
}

export function isMonsterReactionPaused(mob: ChaseReactionState, nowMs: number): boolean {
    return mob.reactAfterMs !== undefined && nowMs < mob.reactAfterMs;
}

export function armMonsterWakeDelay(mob: ChaseReactionState, nowMs: number): void {
    mob.wakeUntilMs = nowMs + MONSTER_WAKE_DELAY_MS;
}

export function isMonsterWakePaused(mob: ChaseReactionState, nowMs: number): boolean {
    return mob.wakeUntilMs !== undefined && nowMs < mob.wakeUntilMs;
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
    const aggroDist = manhattanDist(mob.tileX, mob.tileY, player.tileX, player.tileY);
    if (aggroDist > MONSTER_AGGRO_RADIUS || player.z !== mob.z) return null;

    if (isMonsterWakePaused(mob, nowMs)) return null;

    applyPlayerMoveReactionDelay(mob, player, nowMs);

    const { chaseBehavior, attackRange } = config;
    const combatDist = chaseDistanceToPlayer(
        mob.tileX,
        mob.tileY,
        player.tileX,
        player.tileY,
        config
    );

    if (chaseBehavior === 'melee') {
        if (combatDist <= attackRange) return null;
    } else if (isRangedInComfortZone(combatDist, config)) {
        return null;
    }

    if (isMonsterReactionPaused(mob, nowMs)) return null;

    const walkStepMs = config.walkStepMs ?? MONSTER_STEP_MS;
    if (nowMs - mob.lastAggroMoveTime < walkStepMs) return null;

    let step: (typeof CARDINAL_STEPS)[number] | null = null;

    if (chaseBehavior === 'melee') {
        const goals = collectMeleeChaseGoals(
            player.tileX,
            player.tileY,
            canGoalTile,
            canStepTo
        );
        step = findCardinalPathFirstStep(
            mob.tileX,
            mob.tileY,
            goals,
            canStepTo
        );

        if (
            !step &&
            aggroDist >= MELEE_WAIT_RING_DIST &&
            aggroDist <= MONSTER_AGGRO_RADIUS
        ) {
            step = pickDanceStep(
                mob.tileX,
                mob.tileY,
                player.tileX,
                player.tileY,
                canStepTo
            );
        }
    } else {
        const { minRange, maxRange } = resolveRangedComfortBand(config);
        if (combatDist < minRange) {
            step = pickFleeStep(mob.tileX, mob.tileY, player.tileX, player.tileY, canStepTo);
        } else if (combatDist > maxRange) {
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
    }

    if (!step) return null;

    mob.tileX += step.dx;
    mob.tileY += step.dy;
    
    // Accumulate to prevent drift and stuttering, resync if fell too far behind
    if (mob.lastAggroMoveTime === 0 || nowMs - mob.lastAggroMoveTime > walkStepMs * 2) {
        mob.lastAggroMoveTime = nowMs;
    } else {
        mob.lastAggroMoveTime += walkStepMs;
    }
    
    return step;
}
