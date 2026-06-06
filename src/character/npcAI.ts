import type { GameEntity } from './entity';
import type { Direction } from './spriteAnimation';
import type { CollisionQueryContext } from '../engine/types';
import { getCreaturePreset } from '../editor/creaturePresets';
import { resolveMobChaseConfig } from '../game-data/mobPresetTypes';
import {
    MONSTER_AGGRO_RADIUS,
    MONSTER_STEP_MS,
    isMonsterWakePaused,
    manhattanDist,
    isRangedInComfortZone,
    tickMonsterChaseStep,
    type CardinalDirection,
} from '../../shared/creatureChase';

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

const RANDOM_WANDER_INTERVAL_MS = 3000;

const CARDINAL_DIRS = [
    { dx: 1, dy: 0, dir: 'right' as const },
    { dx: -1, dy: 0, dir: 'left' as const },
    { dx: 0, dy: 1, dir: 'down' as const },
    { dx: 0, dy: -1, dir: 'up' as const },
];

const CHASE_DIR_TO_SPRITE: Record<CardinalDirection, Direction> = {
    east: 'right',
    west: 'left',
    south: 'down',
    north: 'up',
};

let lastNpcMoveTime = 0;

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

function isMobInCombatPosition(
    distToPlayer: number,
    chaseConfig: ReturnType<typeof resolveMobChaseConfig>
): boolean {
    if (chaseConfig.chaseBehavior === 'melee') {
        return distToPlayer <= chaseConfig.attackRange;
    }
    return isRangedInComfortZone(distToPlayer, chaseConfig);
}

function tickMonsterChase(
    npc: GameEntity,
    player: { tileX: number; tileY: number; worldZ: number },
    nowMs: number,
    tileSize: number,
    mapSize: number,
    canStepTo: (tx: number, ty: number) => boolean,
    canGoalTile: (tx: number, ty: number) => boolean,
    reservedGoals: Set<string>
): void {
    if (isMonsterWakePaused(npc, nowMs)) {
        npc.isChasing = false;
        return;
    }

    const chaseConfig = resolveMobChaseConfig(getCreaturePreset(npc.name));
    const distToPlayer = manhattanDist(npc.tileX, npc.tileY, player.tileX, player.tileY);
    const isAggroed = distToPlayer <= MONSTER_AGGRO_RADIUS && player.worldZ === npc.worldZ;
    const inCombatPosition = isMobInCombatPosition(distToPlayer, chaseConfig);

    npc.isChasing = isAggroed && !inCombatPosition;

    if (!isAggroed) return;

    if (inCombatPosition) {
        faceTowardTile(npc, player.tileX, player.tileY);
        return;
    }

    if (!isAtTileCenter(npc, tileSize)) {
        faceSlideDirection(npc, tileSize);
        return;
    }

    const mobState = {
        tileX: npc.tileX,
        tileY: npc.tileY,
        z: npc.worldZ,
        lastAggroMoveTime: npc.lastAggroMoveTime,
        lastSeenPlayerTileX: npc.lastSeenPlayerTileX,
        lastSeenPlayerTileY: npc.lastSeenPlayerTileY,
        reactAfterMs: npc.reactAfterMs,
    };

    const step = tickMonsterChaseStep(
        mobState,
        { tileX: player.tileX, tileY: player.tileY, z: player.worldZ },
        nowMs,
        canStepTo,
        reservedGoals,
        chaseConfig,
        canGoalTile
    );

    npc.lastSeenPlayerTileX = mobState.lastSeenPlayerTileX;
    npc.lastSeenPlayerTileY = mobState.lastSeenPlayerTileY;
    npc.reactAfterMs = mobState.reactAfterMs;

    if (!step) {
        faceTowardTile(npc, player.tileX, player.tileY);
        return;
    }

    const nx = npc.tileX + step.dx;
    const ny = npc.tileY + step.dy;
    if (nx < 0 || nx >= mapSize || ny < 0 || ny >= mapSize) return;

    npc.tileX = nx;
    npc.tileY = ny;
    npc.setState('walk');
    npc.setDirection(CHASE_DIR_TO_SPRITE[step.dir]);
    npc.lastAggroMoveTime = mobState.lastAggroMoveTime;
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
        const reservedChaseGoals = new Set<string>();

        npcs.forEach((npc) => {
            if (npc.isDead) return;

            if (npc.type === 'monster' && isMonsterWakePaused(npc, nowMs)) {
                npc.isChasing = false;
                if (npc.animController.currentState === 'walk') {
                    npc.setState('idle');
                }
                return;
            }

            const canWalkTerrain = (tx: number, ty: number) => {
                if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) return false;
                return queryWalkable(
                    createCollisionContext(),
                    tx * TILE_SIZE_SCREEN,
                    ty * TILE_SIZE_SCREEN,
                    npc.worldZ
                ).walkable;
            };

            const canStepTo = (tx: number, ty: number) => {
                if (!canWalkTerrain(tx, ty)) return false;
                const occupiedByEntity = isEntityAtTile(tx, ty, npc.worldZ, npc.id);
                const occupiedByPlayer = isEntityAtTile(tx, ty, npc.worldZ, 'player');
                return !occupiedByEntity && !occupiedByPlayer;
            };

            const canGoalTile = (tx: number, ty: number) => {
                if (!canWalkTerrain(tx, ty)) return false;
                return !isEntityAtTile(tx, ty, npc.worldZ, 'player');
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
                    canStepTo,
                    canGoalTile,
                    reservedChaseGoals
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

                if (isWithinRadius && canStepTo(newTileX, newTileY)) {
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
