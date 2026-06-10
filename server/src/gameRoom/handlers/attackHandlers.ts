import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import { isPlayerInAttackRange, resolvePlayerAttackProfile } from '../../../../shared/playerAttack.js';
import type { VocationId } from '../../../../shared/types/character.js';
import type { SpectatorTile } from '../../../../shared/creatureSpectatorRange.js';
import type { BroadcastCreatureEvent } from '../contextTypes.js';
import { getLevelFromExp, calculateStatsForLevel } from '../../../../src/engine/character/calculateStats.js';
import { applyExperienceGain } from '../../../../src/game/experience.js';
import { ZoneType } from '../../../../src/engine/zones.js';
import { processAttack } from '../../combat/combat.js';
import type { MapCollisionStore } from '../../MapCollisionStore.js';
import { getServerMapEntry, isInstancedMap } from '../../mapRegistry.js';
import type { ProgressPersistence } from '../../game/ProgressPersistence.js';
import type { RoomCreatureManager } from '../../game/RoomCreatureManager.js';
import type { VocationStore } from '../../game/VocationStore.js';
import { resolvePlayerEquipmentBonuses, syncPlayerLearnedSpells } from '../playerLoadout.js';
import { recalcPlayerMaxStats } from '../playerVitals.js';
import type { ConnectedPlayer } from '../types.js';

const DEFAULT_ATTACK_COOLDOWN_MS = 550;

export interface AttackHandlerContext {
    getPlayerBySocket: (socket: WebSocket) => ConnectedPlayer | undefined;
    getPlayerById: (playerId: string) => ConnectedPlayer | undefined;
    roomKey: (player: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>) => string;
    send: (socket: WebSocket, message: ServerMessage) => void;
    broadcastToRoom: (room: string, message: ServerMessage) => void;
    broadcastToPlayerSpectators: (
        room: string,
        message: ServerMessage,
        event: SpectatorTile
    ) => void;
    broadcastCreatureEvent: BroadcastCreatureEvent;
    sendPlayerResources: (player: ConnectedPlayer, force?: boolean) => void;
    sendPositionCorrection: (player: ConnectedPlayer) => void;
    persistPlayerPosition: (player: ConnectedPlayer, immediate?: boolean) => void;
    recalcPlayerMaxHealth: (player: ConnectedPlayer) => void;
    collision: MapCollisionStore;
    creatures: RoomCreatureManager;
    vocations: VocationStore;
    progressPersistence: ProgressPersistence;
}

export function resolveAttackCooldownMs(
    vocations: VocationStore,
    vocationId: VocationId,
    level: number
): number {
    const vocationConfig = vocations.get(vocationId);
    if (!vocationConfig) return DEFAULT_ATTACK_COOLDOWN_MS;
    const stats = calculateStatsForLevel(vocationConfig, level);
    return Math.max(200, stats.attackSpeed || DEFAULT_ATTACK_COOLDOWN_MS);
}

export function handleAttack(
    ctx: AttackHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'attack' }>
): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    let { instanceId } = msg;
    if (isInstancedMap(msg.mapId)) {
        instanceId = player.instanceId ?? instanceId;
    } else {
        instanceId = undefined;
    }

    if (
        player.mapId !== msg.mapId ||
        (player.instanceId ?? undefined) !== (instanceId ?? undefined)
    ) {
        return;
    }

    const room = ctx.roomKey(player);
    const vocationId = (player.appearance.vocationId || 'knight') as VocationId;

    if (msg.creatureId.startsWith('p_')) {
        handlePvpAttack(ctx, player, msg.creatureId, room, vocationId);
        return;
    }

    handlePveAttack(ctx, player, msg, room, vocationId, instanceId);
}

function handlePvpAttack(
    ctx: AttackHandlerContext,
    player: ConnectedPlayer,
    targetPlayerId: string,
    room: string,
    vocationId: VocationId
): void {
    const targetPlayer = ctx.getPlayerById(targetPlayerId);
    if (!targetPlayer) return;

    if (
        targetPlayer.mapId !== player.mapId ||
        targetPlayer.instanceId !== player.instanceId
    ) {
        return;
    }

    const mapEntry = getServerMapEntry(player.mapId);
    if (mapEntry && mapEntry.pvpEnabled === false) {
        ctx.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'NO_PVP_MAP',
            message: 'Combate PvP não é permitido neste mapa.',
        });
        return;
    }

    const attackerZone = ctx.collision.getZoneIdAt(
        player.mapId,
        player.tileX,
        player.tileY,
        player.z
    );
    if (attackerZone === ZoneType.PROTECTION_ZONE) {
        ctx.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'ATTACKER_IN_PZ',
            message: 'Você não pode atacar dentro de uma Protection Zone (PZ).',
        });
        return;
    }

    const targetZone = ctx.collision.getZoneIdAt(
        targetPlayer.mapId,
        targetPlayer.tileX,
        targetPlayer.tileY,
        targetPlayer.z
    );
    if (targetZone === ZoneType.PROTECTION_ZONE) {
        ctx.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'TARGET_IN_PZ',
            message: 'O alvo está dentro de uma Protection Zone (PZ).',
        });
        return;
    }

    const now = Date.now();
    const cooldownMs = resolveAttackCooldownMs(ctx.vocations, vocationId, player.level);
    if (now - player.lastAttackAtMs < cooldownMs) {
        return;
    }

    const vocationConfig = ctx.vocations.get(vocationId);
    if (!vocationConfig) return;

    const attackProfile = resolvePlayerAttackProfile(vocationId, vocationConfig);
    if (
        !isPlayerInAttackRange(
            { tileX: player.tileX, tileY: player.tileY, z: player.z },
            {
                tileX: targetPlayer.tileX,
                tileY: targetPlayer.tileY,
                z: targetPlayer.z,
            },
            attackProfile
        )
    ) {
        return;
    }

    const targetVocationId = (targetPlayer.appearance.vocationId || 'knight') as VocationId;
    const targetVocationConfig = ctx.vocations.get(targetVocationId);
    const targetStats = targetVocationConfig
        ? calculateStatsForLevel(targetVocationConfig, targetPlayer.level)
        : { defense: 5 };

    const attackerBonuses = resolvePlayerEquipmentBonuses(player);
    const targetBonuses = resolvePlayerEquipmentBonuses(targetPlayer);

    const damageResult = processAttack(
        {
            id: player.id,
            name: player.name,
            vocation: vocationId,
            level: player.level,
        },
        {
            id: targetPlayer.id,
            name: targetPlayer.name,
            health: targetPlayer.health,
            maxHealth: targetPlayer.maxHealth,
            defense: targetStats.defense || 5,
        },
        attackProfile.attackType,
        vocationConfig,
        1.0,
        {
            attackerAttackBonus: attackerBonuses.attackBonus,
            targetDefenseBonus: targetBonuses.defenseBonus,
        }
    );

    player.lastAttackAtMs = now;
    targetPlayer.health = Math.max(0, targetPlayer.health - damageResult.finalDamage);

    ctx.broadcastToPlayerSpectators(
        room,
        {
            type: 'player_damaged',
            v: PROTOCOL_VERSION,
            playerId: targetPlayer.id,
            health: targetPlayer.health,
            maxHealth: targetPlayer.maxHealth,
            damage: damageResult.finalDamage,
            attackerPlayerId: player.id,
        },
        {
            tileX: targetPlayer.tileX,
            tileY: targetPlayer.tileY,
            z: targetPlayer.z,
        }
    );
    ctx.sendPlayerResources(targetPlayer);
    ctx.persistPlayerPosition(targetPlayer);

    if (targetPlayer.health <= 0) {
        handlePvpDeath(ctx, player, targetPlayer, room);
    }
}

function handlePvpDeath(
    ctx: AttackHandlerContext,
    killer: ConnectedPlayer,
    targetPlayer: ConnectedPlayer,
    room: string
): void {
    ctx.broadcastToPlayerSpectators(
        room,
        {
            type: 'player_died',
            v: PROTOCOL_VERSION,
            playerId: targetPlayer.id,
            killerPlayerId: killer.id,
        },
        {
            tileX: targetPlayer.tileX,
            tileY: targetPlayer.tileY,
            z: targetPlayer.z,
        }
    );

    const deathZone = ctx.collision.getZoneIdAt(
        targetPlayer.mapId,
        targetPlayer.tileX,
        targetPlayer.tileY,
        targetPlayer.z
    );
    if (deathZone !== ZoneType.PVP_ARENA) {
        const lostXp = Math.floor(targetPlayer.experience * 0.1);
        targetPlayer.experience = Math.max(0, targetPlayer.experience - lostXp);
        targetPlayer.level = getLevelFromExp(targetPlayer.experience);
        ctx.recalcPlayerMaxHealth(targetPlayer);
    }

    const deathTile = {
        tileX: targetPlayer.tileX,
        tileY: targetPlayer.tileY,
        z: targetPlayer.z,
    };

    const spawn = ctx.collision.getMapSpawn(targetPlayer.mapId) ?? { x: 50, y: 50, z: 0 };
    targetPlayer.tileX = spawn.x;
    targetPlayer.tileY = spawn.y;
    targetPlayer.z = spawn.z;
    targetPlayer.health = targetPlayer.maxHealth;
    targetPlayer.mana = targetPlayer.maxMana;

    if (deathZone !== ZoneType.PVP_ARENA) {
        ctx.send(targetPlayer.socket, {
            type: 'player_progress',
            v: PROTOCOL_VERSION,
            playerId: targetPlayer.id,
            level: targetPlayer.level,
            experience: targetPlayer.experience,
            leveledUp: false,
            health: targetPlayer.health,
            maxHealth: targetPlayer.maxHealth,
        });

        if (targetPlayer.characterId && targetPlayer.accountId) {
            void ctx.progressPersistence.saveNow({
                characterId: targetPlayer.characterId,
                accountId: targetPlayer.accountId,
                level: targetPlayer.level,
                experience: targetPlayer.experience,
            });
        }
    }

    ctx.broadcastToPlayerSpectators(
        room,
        {
            type: 'player_respawned',
            v: PROTOCOL_VERSION,
            playerId: targetPlayer.id,
            mapId: targetPlayer.mapId,
            instanceId: targetPlayer.instanceId,
            tileX: spawn.x,
            tileY: spawn.y,
            z: spawn.z,
            health: targetPlayer.health,
            maxHealth: targetPlayer.maxHealth,
            mana: targetPlayer.mana,
            maxMana: targetPlayer.maxMana,
        },
        deathTile
    );

    ctx.sendPositionCorrection(targetPlayer);
    ctx.persistPlayerPosition(targetPlayer, true);
    ctx.sendPlayerResources(targetPlayer);
}

function handlePveAttack(
    ctx: AttackHandlerContext,
    player: ConnectedPlayer,
    msg: Extract<ClientMessage, { type: 'attack' }>,
    room: string,
    vocationId: VocationId,
    instanceId: string | undefined
): void {
    const attackerBonuses = resolvePlayerEquipmentBonuses(player);

    const outcome = ctx.creatures.processAttack(
        room,
        {
            playerId: player.id,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
            level: player.level,
            vocationId,
            lastAttackAtMs: player.lastAttackAtMs,
            attackBonus: attackerBonuses.attackBonus,
        },
        msg.creatureId,
        Date.now(),
        resolveAttackCooldownMs(ctx.vocations, vocationId, player.level)
    );

    if (!outcome.ok) {
        ctx.send(player.socket, {
            type: 'attack_miss',
            v: PROTOCOL_VERSION,
            creatureId: msg.creatureId,
            mapId: msg.mapId,
            instanceId: instanceId ?? player.instanceId,
            code: outcome.code,
        });
        return;
    }

    if (outcome.newLastAttackAtMs !== undefined) {
        player.lastAttackAtMs = outcome.newLastAttackAtMs;
    }

    if (outcome.damaged) {
        ctx.broadcastCreatureEvent(room, msg.creatureId, outcome.damaged);
    }

    if (outcome.died) {
        ctx.broadcastCreatureEvent(room, msg.creatureId, outcome.died, {
            tileX: outcome.died.tileX,
            tileY: outcome.died.tileY,
            z: outcome.died.z,
        });

        const gain = applyExperienceGain(player.experience, outcome.died.xpReward);
        player.experience = gain.experience;
        player.level = gain.level;
        void syncPlayerLearnedSpells(player);

        ctx.send(player.socket, {
            type: 'player_progress',
            v: PROTOCOL_VERSION,
            playerId: player.id,
            level: gain.level,
            experience: gain.experience,
            leveledUp: gain.leveledUp,
        });

        if (player.characterId && player.accountId) {
            void ctx.progressPersistence.saveNow({
                characterId: player.characterId,
                accountId: player.accountId,
                level: gain.level,
                experience: gain.experience,
            });
        }
    }
}
