import type { GameEntity } from './entity';
import type { CollisionQueryContext } from '../engine/types';

export interface NpcAIController {
    tickNpcAI(options: {
        nowMs: number;
        npcs: GameEntity[];
        player: {
            tileX: number;
            tileY: number;
            worldZ: number;
        };
        TILE_SIZE_SCREEN: number;
        MAP_SIZE: number;
        isEntityAtTile: (tx: number, ty: number, z: number, excludeId?: string) => boolean;
        queryWalkable: (context: CollisionQueryContext, x: number, y: number, z: number) => { walkable: boolean };
        createCollisionContext: () => CollisionQueryContext;
    }): void;
}

const MONSTER_AGGRO_RADIUS = 7;
/** Intervalo entre passos lógicos do monstro (ms) — alinhado à interpolação visual. */
const MONSTER_STEP_MS = 360;
const RANDOM_WANDER_INTERVAL_MS = 3000;

const CARDINAL_DIRS = [
    { dx: 1, dy: 0, dir: 'right' as const },
    { dx: -1, dy: 0, dir: 'left' as const },
    { dx: 0, dy: 1, dir: 'down' as const },
    { dx: 0, dy: -1, dir: 'up' as const },
];

let lastNpcMoveTime = 0;

function tileKey(tx: number, ty: number): string {
    return `${tx},${ty}`;
}

function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

function isAtTileCenter(npc: GameEntity, tileSize: number): boolean {
    const targetX = npc.tileX * tileSize;
    const targetY = npc.tileY * tileSize;
    return Math.abs(npc.worldX - targetX) < 0.5 && Math.abs(npc.worldY - targetY) < 0.5;
}

function faceTowardTile(npc: GameEntity, targetX: number, targetY: number): void {
    const dx = targetX - npc.tileX;
    const dy = targetY - npc.tileY;
    if (Math.abs(dx) > Math.abs(dy)) {
        npc.setDirection(dx > 0 ? 'right' : 'left');
    } else if (dy !== 0) {
        npc.setDirection(dy > 0 ? 'down' : 'up');
    }
}

/** Direção do deslize visual (não olhar fixo no jogador enquanto contorna). */
function faceSlideDirection(npc: GameEntity, tileSize: number): void {
    const targetX = npc.tileX * tileSize;
    const targetY = npc.tileY * tileSize;
    const dx = targetX - npc.worldX;
    const dy = targetY - npc.worldY;
    if (Math.abs(dx) > Math.abs(dy)) {
        npc.setDirection(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > 0.5) {
        npc.setDirection(dy > 0 ? 'down' : 'up');
    }
}

/** Tiles ortogonais ao jogador onde o mob pode ficar para melee (exclui tile do player). */
function findMeleeGoalTiles(
    playerTileX: number,
    playerTileY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): Array<{ tx: number; ty: number }> {
    const goals: Array<{ tx: number; ty: number }> = [];
    for (const { dx, dy } of CARDINAL_DIRS) {
        const tx = playerTileX + dx;
        const ty = playerTileY + dy;
        if (canWalkTo(tx, ty)) {
            goals.push({ tx, ty });
        }
    }
    return goals;
}

function pickMeleeGoalTile(
    npc: GameEntity,
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
        const d = manhattanDist(npc.tileX, npc.tileY, goal.tx, goal.ty);
        if (d < bestDist) {
            bestDist = d;
            best = goal;
        }
    }

    if (best) {
        reservedGoals.add(tileKey(best.tx, best.ty));
        return best;
    }

    // Todos os slots adjacentes ocupados/reservados — aproximar do jogador sem pisar nele
    return { tx: playerTileX, ty: playerTileY };
}

function pickMonsterChaseStep(
    npc: GameEntity,
    goalX: number,
    goalY: number,
    canWalkTo: (tx: number, ty: number) => boolean
): (typeof CARDINAL_DIRS)[number] | null {
    const currentGoalDist = manhattanDist(npc.tileX, npc.tileY, goalX, goalY);

    let bestCloser: (typeof CARDINAL_DIRS)[number] | null = null;
    let bestCloserDist = currentGoalDist;

    let bestSidestep: (typeof CARDINAL_DIRS)[number] | null = null;
    let bestSidestepDist = Infinity;

    let bestAny: (typeof CARDINAL_DIRS)[number] | null = null;
    let bestAnyDist = Infinity;

    for (const step of CARDINAL_DIRS) {
        const nx = npc.tileX + step.dx;
        const ny = npc.tileY + step.dy;
        if (!canWalkTo(nx, ny)) continue;

        const d = manhattanDist(nx, ny, goalX, goalY);

        if (d < bestCloserDist) {
            bestCloserDist = d;
            bestCloser = step;
        }

        // Contorno: passo lateral (distância igual ou +1) quando o caminho direto está bloqueado
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

function tickMonsterChase(
    npc: GameEntity,
    player: { tileX: number; tileY: number; worldZ: number },
    nowMs: number,
    tileSize: number,
    mapSize: number,
    canWalkTo: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>
): void {
    const distToPlayer = manhattanDist(npc.tileX, npc.tileY, player.tileX, player.tileY);

    const isAggroed = distToPlayer <= MONSTER_AGGRO_RADIUS && player.worldZ === npc.worldZ;
    npc.isChasing = isAggroed && distToPlayer > 1;

    if (!npc.isChasing) return;

    if (!isAtTileCenter(npc, tileSize)) {
        faceSlideDirection(npc, tileSize);
        return;
    }

    if (distToPlayer <= 1) {
        faceTowardTile(npc, player.tileX, player.tileY);
        return;
    }

    if (nowMs - npc.lastAggroMoveTime < MONSTER_STEP_MS) {
        faceTowardTile(npc, player.tileX, player.tileY);
        return;
    }

    const goal = pickMeleeGoalTile(npc, player.tileX, player.tileY, canWalkTo, reservedGoals);
    const step = pickMonsterChaseStep(npc, goal.tx, goal.ty, canWalkTo);
    if (!step) {
        npc.setState('idle');
        faceTowardTile(npc, player.tileX, player.tileY);
        return;
    }

    const nx = npc.tileX + step.dx;
    const ny = npc.tileY + step.dy;
    if (nx < 0 || nx >= mapSize || ny < 0 || ny >= mapSize) return;

    npc.tileX = nx;
    npc.tileY = ny;
    npc.setState('walk');
    npc.setDirection(step.dir);
    npc.lastAggroMoveTime = nowMs;
}

export const NpcAI: NpcAIController = {
    tickNpcAI(options) {
        const {
            nowMs,
            npcs,
            player,
            TILE_SIZE_SCREEN,
            MAP_SIZE,
            isEntityAtTile,
            queryWalkable,
            createCollisionContext,
        } = options;

        const moveSpeedPx = TILE_SIZE_SCREEN / (MONSTER_STEP_MS / (1000 / 60));
        const reservedMeleeGoals = new Set<string>();

        npcs.forEach((npc) => {
            if (npc.isDead) return;

            const canWalkTo = (tx: number, ty: number) => {
                if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) return false;
                const scenarioWalkable = queryWalkable(
                    createCollisionContext(),
                    tx * TILE_SIZE_SCREEN,
                    ty * TILE_SIZE_SCREEN,
                    npc.worldZ
                ).walkable;
                const occupiedByEntity = isEntityAtTile(tx, ty, npc.worldZ, npc.id);
                const occupiedByPlayer = isEntityAtTile(tx, ty, npc.worldZ, 'player');
                return scenarioWalkable && !occupiedByEntity && !occupiedByPlayer;
            };

            if (npc.type === 'npc') {
                const distToPlayer = manhattanDist(npc.tileX, npc.tileY, player.tileX, player.tileY);
                const isNearPlayer = distToPlayer <= 1.5 && player.worldZ === npc.worldZ;

                if (isNearPlayer) {
                    if (npc.animController.currentState === 'walk') {
                        npc.setState('idle');
                    }
                    faceTowardTile(npc, player.tileX, player.tileY);

                    if (!npc.dialogueText && Math.random() < 0.005) {
                        const phrases = [
                            'Olá, aventureiro!',
                            'Belo dia para explorar!',
                            'Precisa de ajuda?',
                            'Aperte Espaço para atacar!',
                            'Aperte X para sentar!',
                            'Aperte H para morrer!',
                        ];
                        npc.speak(phrases[Math.floor(Math.random() * phrases.length)]);
                    }
                    return;
                }
            } else if (npc.type === 'monster') {
                tickMonsterChase(
                    npc,
                    player,
                    nowMs,
                    TILE_SIZE_SCREEN,
                    MAP_SIZE,
                    canWalkTo,
                    reservedMeleeGoals
                );
                if (npc.isChasing) return;
            }

            npc.isChasing = false;

            if (nowMs - lastNpcMoveTime > RANDOM_WANDER_INTERVAL_MS && Math.random() < 0.4) {
                const randomDir = CARDINAL_DIRS[Math.floor(Math.random() * CARDINAL_DIRS.length)];
                npc.setDirection(randomDir.dir);

                const newTileX = npc.tileX + randomDir.dx;
                const newTileY = npc.tileY + randomDir.dy;

                const isWithinRadius =
                    Math.abs(newTileX - npc.spawnX) <= npc.maxRadius &&
                    Math.abs(newTileY - npc.spawnY) <= npc.maxRadius;

                if (isWithinRadius && canWalkTo(newTileX, newTileY)) {
                    npc.tileX = newTileX;
                    npc.tileY = newTileY;
                    npc.setState('walk');
                }
            }
        });

        if (nowMs - lastNpcMoveTime > RANDOM_WANDER_INTERVAL_MS) {
            lastNpcMoveTime = nowMs;
        }

        npcs.forEach((npc) => {
            if (npc.isDead) {
                npc.update(nowMs);
                return;
            }

            const targetWorldX = npc.tileX * TILE_SIZE_SCREEN;
            const targetWorldY = npc.tileY * TILE_SIZE_SCREEN;

            if (npc.worldX < targetWorldX) npc.worldX = Math.min(targetWorldX, npc.worldX + moveSpeedPx);
            else if (npc.worldX > targetWorldX) npc.worldX = Math.max(targetWorldX, npc.worldX - moveSpeedPx);

            if (npc.worldY < targetWorldY) npc.worldY = Math.min(targetWorldY, npc.worldY + moveSpeedPx);
            else if (npc.worldY > targetWorldY) npc.worldY = Math.max(targetWorldY, npc.worldY - moveSpeedPx);

            const arrived =
                Math.abs(npc.worldX - targetWorldX) < 0.5 && Math.abs(npc.worldY - targetWorldY) < 0.5;

            if (arrived) {
                npc.worldX = targetWorldX;
                npc.worldY = targetWorldY;
                if (npc.animController.currentState === 'walk' && !npc.isChasing) {
                    npc.setState('idle');
                }
            } else {
                npc.setState('walk');
            }

            npc.update(nowMs);
        });
    },
};
