import type {
    CreatureDamagedMessage,
    CreatureDiedMessage,
    CreatureMovedMessage,
    CreatureRespawnedMessage,
    CreatureSnapshot,
    ServerMessage,
} from '../../../shared/protocol.js';
import {
    MONSTER_STEP_MS,
    armMonsterWakeDelay,
    chaseFaceDirectionWhenEngaged,
    isMonsterWakePaused,
    isRangedInComfortZone,
    resolveChaseIdleDirection,
    tickMonsterChaseStep,
    type CardinalDirection,
} from '../../../shared/creatureChase.js';
import { PROTOCOL_VERSION } from '../../../shared/protocol.js';
import { MONSTER_RESPAWN_MS } from '../../../shared/creatureDeath.js';
import type { VocationId } from '../../../shared/types/character.js';
import { processAttack } from '../combat/combat.js';
import { isPlayerInAttackRange, resolvePlayerAttackProfile } from '../../../shared/playerAttack.js';
import type { MapCollisionStore } from '../MapCollisionStore.js';
import type { CreaturePresetStore } from './CreaturePresetStore.js';
import type { VocationStore } from './VocationStore.js';

interface RoomPlayerRef {
    tileX: number;
    tileY: number;
    z: number;
    steppingDestTileX?: number;
    steppingDestTileY?: number;
}

interface ServerCreature {
    id: string;
    name: string;
    creatureType: 'monster' | 'npc';
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    spawnX: number;
    spawnY: number;
    maxRadius: number;
    direction: CardinalDirection;
    lastAggroMoveTime: number;
    lastSeenPlayerTileX?: number;
    lastSeenPlayerTileY?: number;
    reactAfterMs?: number;
    wakeUntilMs?: number;
    maxHealth: number;
    health: number;
    defense: number;
    xpReward: number;
    isDead: boolean;
    respawnAtMs?: number;
}

interface RoomCreatureState {
    mapId: string;
    instanceId?: string;
    creatures: ServerCreature[];
}

export interface CombatAttackContext {
    playerId: string;
    tileX: number;
    tileY: number;
    z: number;
    level: number;
    vocationId: VocationId;
    lastAttackAtMs: number;
    attackBonus?: number;
}

export interface CombatAttackOutcome {
    ok: boolean;
    code?: string;
    newLastAttackAtMs?: number;
    damaged?: CreatureDamagedMessage;
    died?: CreatureDiedMessage;
    respawned?: CreatureRespawnedMessage;
}

export class RoomCreatureManager {
    private rooms = new Map<string, RoomCreatureState>();
    private tickTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly collision: MapCollisionStore,
        private readonly presets: CreaturePresetStore,
        private readonly vocations: VocationStore,
        private readonly broadcastToRoom: (room: string, message: ServerMessage) => void,
        private readonly getPlayersInRoom: (room: string) => RoomPlayerRef[]
    ) {}

    start(): void {
        if (this.tickTimer) return;
        this.tickTimer = setInterval(() => this.tick(Date.now()), 50);
    }

    stop(): void {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }

    ensureRoom(room: string, mapId: string, instanceId?: string): CreatureSnapshot[] {
        let state = this.rooms.get(room);
        if (!state) {
            const spawns = this.collision.getSpawns(mapId);
            const creatures: ServerCreature[] = spawns.map((spawn) => {
                const stats = this.presets.getStats(spawn.name);
                return {
                    id: spawn.id,
                    name: spawn.name,
                    creatureType: spawn.type,
                    mapId,
                    instanceId,
                    tileX: spawn.x,
                    tileY: spawn.y,
                    z: spawn.z,
                    spawnX: spawn.x,
                    spawnY: spawn.y,
                    maxRadius: spawn.type === 'monster' ? 5 : 3,
                    direction: 'south' as CardinalDirection,
                    lastAggroMoveTime: 0,
                    maxHealth: stats.maxHealth,
                    health: stats.maxHealth,
                    defense: stats.defense,
                    xpReward: stats.xpReward,
                    isDead: false,
                };
            });
            state = { mapId, instanceId, creatures };
            this.rooms.set(room, state);
            console.log(
                `[RoomCreatureManager] sala ${room}: ${creatures.length} criatura(s) de ${mapId}`
            );
        }
        return state.creatures.map((c) => this.toSnapshot(c));
    }

    /** Pausa IA de todos os monstros da sala (jogador acabou de entrar no mapa). */
    armRoomWakeDelay(room: string, nowMs: number): void {
        const state = this.rooms.get(room);
        if (!state) return;
        for (const creature of state.creatures) {
            if (creature.creatureType !== 'monster' || creature.isDead) continue;
            armMonsterWakeDelay(creature, nowMs);
        }
    }

    processAttack(
        room: string,
        attacker: CombatAttackContext,
        creatureId: string,
        nowMs: number,
        attackCooldownMs: number
    ): CombatAttackOutcome {
        const state = this.rooms.get(room);
        if (!state) {
            return { ok: false, code: 'ROOM_NOT_FOUND' };
        }

        if (nowMs - attacker.lastAttackAtMs < attackCooldownMs) {
            return { ok: false, code: 'ATTACK_COOLDOWN' };
        }

        const creature = state.creatures.find((c) => c.id === creatureId);
        if (!creature || creature.creatureType !== 'monster') {
            return { ok: false, code: 'CREATURE_NOT_FOUND' };
        }
        if (creature.isDead) {
            return { ok: false, code: 'CREATURE_DEAD' };
        }

        const vocationConfig = this.vocations.get(attacker.vocationId);
        const attackProfile = resolvePlayerAttackProfile(attacker.vocationId, vocationConfig);
        if (
            creature.z !== attacker.z ||
            !isPlayerInAttackRange(
                { tileX: attacker.tileX, tileY: attacker.tileY, z: attacker.z },
                { tileX: creature.tileX, tileY: creature.tileY, z: creature.z },
                attackProfile
            )
        ) {
            return { ok: false, code: 'NOT_ADJACENT' };
        }

        if (!vocationConfig) {
            return { ok: false, code: 'INVALID_VOCATION' };
        }

        const result = processAttack(
            {
                id: attacker.playerId,
                name: '',
                vocation: attacker.vocationId,
                level: attacker.level,
            },
            {
                id: creature.id,
                name: creature.name,
                health: creature.health,
                maxHealth: creature.maxHealth,
                defense: creature.defense,
            },
            attackProfile.attackType,
            vocationConfig,
            1.0,
            { attackerAttackBonus: attacker.attackBonus ?? 0 }
        );

        creature.health = Math.max(0, creature.health - result.finalDamage);

        const damaged: CreatureDamagedMessage = {
            type: 'creature_damaged',
            v: PROTOCOL_VERSION,
            creatureId: creature.id,
            mapId: state.mapId,
            instanceId: state.instanceId,
            health: creature.health,
            maxHealth: creature.maxHealth,
            damage: result.finalDamage,
            attackerPlayerId: attacker.playerId,
        };

        if (!result.isDead) {
            return {
                ok: true,
                newLastAttackAtMs: nowMs,
                damaged,
            };
        }

        creature.isDead = true;
        creature.health = 0;
        creature.respawnAtMs = nowMs + MONSTER_RESPAWN_MS;
        return {
            ok: true,
            newLastAttackAtMs: nowMs,
            damaged,
            died: {
                type: 'creature_died',
                v: PROTOCOL_VERSION,
                creatureId: creature.id,
                mapId: state.mapId,
                instanceId: state.instanceId,
                tileX: creature.tileX,
                tileY: creature.tileY,
                z: creature.z,
                xpReward: creature.xpReward,
                killerPlayerId: attacker.playerId,
            },
        };
    }

    private toSnapshot(c: ServerCreature): CreatureSnapshot {
        return {
            creatureId: c.id,
            name: c.name,
            mapId: c.mapId,
            instanceId: c.instanceId,
            tileX: c.tileX,
            tileY: c.tileY,
            z: c.z,
            direction: c.direction,
            stepDurationMs: MONSTER_STEP_MS,
            creatureType: c.creatureType,
            health: c.health,
            maxHealth: c.maxHealth,
            isDead: c.isDead,
        };
    }

    sendSyncToRoom(room: string): CreatureSnapshot[] {
        const state = this.rooms.get(room);
        if (!state) return [];
        return state.creatures.map((c) => this.toSnapshot(c));
    }

    private tick(nowMs: number): void {
        for (const [room, state] of this.rooms.entries()) {
            const respawns: CreatureRespawnedMessage[] = [];
            for (const creature of state.creatures) {
                if (!creature.isDead || !creature.respawnAtMs || nowMs < creature.respawnAtMs) {
                    continue;
                }
                creature.isDead = false;
                creature.health = creature.maxHealth;
                creature.tileX = creature.spawnX;
                creature.tileY = creature.spawnY;
                creature.direction = 'south';
                creature.lastAggroMoveTime = 0;
                creature.lastSeenPlayerTileX = undefined;
                creature.lastSeenPlayerTileY = undefined;
                creature.reactAfterMs = undefined;
                creature.wakeUntilMs = undefined;
                creature.respawnAtMs = undefined;
                armMonsterWakeDelay(creature, nowMs);
                respawns.push({
                    type: 'creature_respawned',
                    v: PROTOCOL_VERSION,
                    creatureId: creature.id,
                    mapId: state.mapId,
                    instanceId: state.instanceId,
                    tileX: creature.tileX,
                    tileY: creature.tileY,
                    z: creature.z,
                    health: creature.health,
                    maxHealth: creature.maxHealth,
                });
            }
            for (const msg of respawns) {
                this.broadcastToRoom(room, msg);
            }

            const players = this.getPlayersInRoom(room);
            if (players.length === 0) continue;

            const mapSize = this.collision.getMapSize(state.mapId);
            const reservedGoals = new Set<string>();
            const moves: CreatureMovedMessage[] = [];

            for (const creature of state.creatures) {
                if (creature.creatureType !== 'monster' || creature.isDead) continue;
                if (isMonsterWakePaused(creature, nowMs)) continue;

                const target = this.pickChaseTarget(creature, players);
                if (!target) continue;

                const canWalkTerrain = (tx: number, ty: number) => {
                    if (tx < 0 || tx >= mapSize || ty < 0 || ty >= mapSize) return false;
                    return this.collision.isWalkable(state.mapId, tx, ty, creature.z);
                };

                const canStepTo = (tx: number, ty: number) =>
                    canWalkTerrain(tx, ty) &&
                    !this.isPlayerAt(players, tx, ty, creature.z) &&
                    !this.isCreatureAt(state.creatures, tx, ty, creature.z, creature.id);

                const canGoalTile = (tx: number, ty: number) => {
                    if (!canWalkTerrain(tx, ty)) return false;
                    return !this.isPlayerAt(players, tx, ty, creature.z);
                };

                const mobState = {
                    tileX: creature.tileX,
                    tileY: creature.tileY,
                    z: creature.z,
                    lastAggroMoveTime: creature.lastAggroMoveTime,
                    lastSeenPlayerTileX: creature.lastSeenPlayerTileX,
                    lastSeenPlayerTileY: creature.lastSeenPlayerTileY,
                    reactAfterMs: creature.reactAfterMs,
                    wakeUntilMs: creature.wakeUntilMs,
                };

                const chaseConfig = this.presets.getChaseConfig(creature.name);

                const step = tickMonsterChaseStep(
                    mobState,
                    target,
                    nowMs,
                    canStepTo,
                    reservedGoals,
                    chaseConfig,
                    canGoalTile
                );

                creature.lastSeenPlayerTileX = mobState.lastSeenPlayerTileX;
                creature.lastSeenPlayerTileY = mobState.lastSeenPlayerTileY;
                creature.reactAfterMs = mobState.reactAfterMs;

                if (step) {
                    creature.tileX = mobState.tileX;
                    creature.tileY = mobState.tileY;
                    creature.lastAggroMoveTime = mobState.lastAggroMoveTime;
                    creature.direction = step.dir;

                    moves.push({
                        type: 'creature_moved',
                        v: PROTOCOL_VERSION,
                        creatureId: creature.id,
                        mapId: state.mapId,
                        instanceId: state.instanceId,
                        tileX: creature.tileX,
                        tileY: creature.tileY,
                        z: creature.z,
                        direction: creature.direction,
                        stepDurationMs: MONSTER_STEP_MS,
                    });
                    continue;
                }

                const distToPlayer =
                    Math.abs(target.tileX - creature.tileX) +
                    Math.abs(target.tileY - creature.tileY);
                const inCombatPosition =
                    chaseConfig.chaseBehavior === 'melee'
                        ? distToPlayer <= chaseConfig.attackRange
                        : isRangedInComfortZone(distToPlayer, chaseConfig);

                const faceDir = inCombatPosition
                    ? chaseFaceDirectionWhenEngaged(
                          creature.tileX,
                          creature.tileY,
                          target.tileX,
                          target.tileY,
                          chaseConfig
                      )
                    : resolveChaseIdleDirection(
                          creature.tileX,
                          creature.tileY,
                          target.tileX,
                          target.tileY,
                          target.z,
                          creature.z
                      );
                if (faceDir && faceDir !== creature.direction) {
                    creature.direction = faceDir;
                    moves.push({
                        type: 'creature_moved',
                        v: PROTOCOL_VERSION,
                        creatureId: creature.id,
                        mapId: state.mapId,
                        instanceId: state.instanceId,
                        tileX: creature.tileX,
                        tileY: creature.tileY,
                        z: creature.z,
                        direction: creature.direction,
                        stepDurationMs: MONSTER_STEP_MS,
                    });
                }
            }

            for (const move of moves) {
                this.broadcastToRoom(room, move);
            }
        }
    }

    private pickChaseTarget(
        creature: ServerCreature,
        players: RoomPlayerRef[]
    ): RoomPlayerRef | null {
        let best: RoomPlayerRef | null = null;
        let bestDist = Infinity;
        for (const p of players) {
            if (p.z !== creature.z) continue;
            const d =
                Math.abs(p.tileX - creature.tileX) + Math.abs(p.tileY - creature.tileY);
            if (d < bestDist) {
                bestDist = d;
                best = p;
            }
        }
        return best;
    }

    private isPlayerAt(
        players: RoomPlayerRef[],
        tx: number,
        ty: number,
        z: number
    ): boolean {
        for (const p of players) {
            if (p.z !== z) continue;
            if (p.tileX === tx && p.tileY === ty) return true;
            if (p.steppingDestTileX === tx && p.steppingDestTileY === ty) return true;
        }
        return false;
    }

    private isCreatureAt(
        creatures: ServerCreature[],
        tx: number,
        ty: number,
        z: number,
        excludeId: string
    ): boolean {
        return creatures.some(
            (c) =>
                !c.isDead &&
                c.id !== excludeId &&
                c.tileX === tx &&
                c.tileY === ty &&
                c.z === z
        );
    }
}
