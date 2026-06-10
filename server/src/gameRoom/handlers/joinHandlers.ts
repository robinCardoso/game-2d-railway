import type { WebSocket } from 'ws';
import type { ClientMessage, PlayerAppearance, PlayerSnapshot, ServerMessage } from '../../../../shared/protocol.js';
import {
    isValidTile,
    PROTOCOL_VERSION,
    SERVER_MAP_SIZE,
} from '../../../../shared/protocol.js';
import { buildRoomKey } from '../../../../shared/roomKey.js';
import { createEmptyEquipment } from '../../../../shared/inventory.js';
import { resolveSpellBarOrDefaults } from '../../../../shared/spellSlots.js';
import type { VocationId } from '../../../../shared/types/character.js';
import { getLevelFromExp, calculateStatsForLevel } from '../../../../src/engine/character/calculateStats.js';
import { verifyEnterTicket } from '../../enterTicket.js';
import { isInstancedMap } from '../../mapRegistry.js';
import type { MapCollisionStore } from '../../MapCollisionStore.js';
import type { MapInstanceStore } from '../../MapInstanceStore.js';
import type { PositionPersistence } from '../../game/PositionPersistence.js';
import type { RoomCreatureManager } from '../../game/RoomCreatureManager.js';
import type { VocationStore } from '../../game/VocationStore.js';
import { createChatRateLimitState } from '../../chat/chatService.js';
import { hydratePlayerEquipment, hydratePlayerSpellBar } from '../playerLoadout.js';
import { ConnectedPlayer, DEFAULT_APPEARANCE } from '../types.js';

export interface JoinHandlerContext {
    requireWsTicket: boolean;
    hasSocketMapping: (socket: WebSocket) => boolean;
    disconnectSocket: (socket: WebSocket) => void;
    kickDuplicateCharacter: (characterId: string, exceptSocket: WebSocket) => void;
    playerIdExists: (id: string) => boolean;
    generatePlayerId: () => string;
    registerPlayer: (id: string, player: ConnectedPlayer, socket: WebSocket) => void;
    isWalkable: (mapId: string, tileX: number, tileY: number, z: number) => boolean;
    playersInRoom: (room: string, exceptId?: string) => PlayerSnapshot[];
    toSnapshot: (player: ConnectedPlayer) => PlayerSnapshot;
    send: (socket: WebSocket, message: ServerMessage) => void;
    broadcastToRoom: (room: string, message: ServerMessage, exceptId?: string) => void;
    sendPlayerResources: (player: ConnectedPlayer) => void;
    sendPositionCorrection: (player: ConnectedPlayer) => void;
    collision: MapCollisionStore;
    instances: MapInstanceStore;
    creatures: RoomCreatureManager;
    vocations: VocationStore;
    positionPersistence: PositionPersistence;
    getOnlineCount: () => number;
}

export function handleJoin(
    ctx: JoinHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'join' }>
): void {
    if (ctx.hasSocketMapping(socket)) {
        ctx.disconnectSocket(socket);
    }

    if (ctx.requireWsTicket && !msg.enterTicket) {
        ctx.send(socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'MISSING_TICKET',
            message: 'Ticket de entrada obrigatório. Use POST /api/ws-ticket.',
        });
        return;
    }

    let joinName = msg.name.slice(0, 32) || 'Jogador';
    let characterId: string | undefined;
    let accountId: string | undefined;
    let direction: ConnectedPlayer['direction'] = msg.direction ?? 'south';
    let appearance: PlayerAppearance = msg.appearance ?? DEFAULT_APPEARANCE;
    let joinMapId = msg.mapId;
    let joinTileX = msg.tileX;
    let joinTileY = msg.tileY;
    let joinZ = msg.z;
    let joinExperience = msg.experience ?? 0;

    if (msg.enterTicket) {
        const ticket = verifyEnterTicket(msg.enterTicket);
        if (!ticket) {
            ctx.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'INVALID_TICKET',
                message: 'Ticket de entrada inválido ou expirado.',
            });
            return;
        }
        joinName = ticket.name.slice(0, 32);
        characterId = ticket.characterId;
        accountId = ticket.accountId;
        direction = ticket.direction;
        joinMapId = ticket.mapId;
        joinTileX = ticket.tileX;
        joinTileY = ticket.tileY;
        joinZ = ticket.z;
        joinExperience = ticket.experience;
        if (ticket.appearance) {
            appearance = ticket.appearance;
        }
    }

    if (characterId) {
        ctx.kickDuplicateCharacter(characterId, socket);
    }

    if (!isValidTile(joinMapId, joinTileX, joinTileY, joinZ)) {
        ctx.send(socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'INVALID_TILE',
            message: `Tile inválido (${joinTileX},${joinTileY},${joinZ}) mapa ${SERVER_MAP_SIZE}×${SERVER_MAP_SIZE}.`,
        });
        return;
    }

    let { instanceId } = msg;
    if (isInstancedMap(joinMapId)) {
        instanceId = ctx.instances.resolveInstanceId(joinMapId, instanceId);
    } else {
        instanceId = undefined;
    }

    const resolvedJoin = ctx.collision.resolveJoinPosition(
        joinMapId,
        joinTileX,
        joinTileY,
        joinZ
    );
    joinTileX = resolvedJoin.tileX;
    joinTileY = resolvedJoin.tileY;
    joinZ = resolvedJoin.z;

    if (!ctx.isWalkable(joinMapId, joinTileX, joinTileY, joinZ)) {
        ctx.send(socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'NOT_WALKABLE',
            message: 'Posição inicial não é walkable no template do mapa.',
        });
        return;
    }

    const id = msg.playerId && !ctx.playerIdExists(msg.playerId)
        ? msg.playerId.slice(0, 64)
        : ctx.generatePlayerId();

    const room = buildRoomKey(joinMapId, instanceId);
    const roomWasEmpty = ctx.playersInRoom(room).length === 0;
    const joinExp = Math.max(0, Math.floor(joinExperience));
    const joinLevelFromExp = getLevelFromExp(joinExp);

    const player: ConnectedPlayer = {
        id,
        name: joinName,
        characterId,
        accountId,
        direction,
        appearance,
        mapId: joinMapId,
        instanceId,
        tileX: joinTileX,
        tileY: joinTileY,
        z: joinZ,
        lastMoveAcceptedAtMs: 0,
        lastObservedMoveIntervalMs: 0,
        lastMoveRejectionSentAtMs: 0,
        level: joinLevelFromExp,
        experience: joinExp,
        health: 100,
        maxHealth: 100,
        mana: 50,
        maxMana: 50,
        lastAttackAtMs: 0,
        spellCooldownUntil: {},
        groupCooldownUntil: {},
        equipment: createEmptyEquipment(),
        spellBar: resolveSpellBarOrDefaults({}, appearance.vocationId),
        learnedSpellIds: [],
        socket,
        chatRateLimit: createChatRateLimitState(),
    };

    const pVocationId = (appearance.vocationId || 'knight') as VocationId;
    const pVocationConfig = ctx.vocations.get(pVocationId);
    const pStats = pVocationConfig
        ? calculateStatsForLevel(pVocationConfig, joinLevelFromExp)
        : { health: 100, mana: 50 };
    player.maxHealth = pStats.health;
    player.maxMana = pStats.mana;
    player.mana = pStats.mana;

    if (msg.enterTicket) {
        const ticket = verifyEnterTicket(msg.enterTicket);
        if (ticket && ticket.health !== undefined && ticket.health !== null && ticket.health > 0) {
            player.health = Math.min(ticket.health, player.maxHealth);
        } else {
            player.health = player.maxHealth;
        }
    } else {
        player.health = player.maxHealth;
    }

    ctx.registerPlayer(id, player, socket);

    if (characterId && accountId) {
        void hydratePlayerEquipment(player);
        void hydratePlayerSpellBar(player);
    }

    const platformLog = msg.platform ? `[${msg.platform}]` : '[web/unknown]';
    const versionLog = msg.clientBuildVersion ? `v${msg.clientBuildVersion}` : 'v?';
    console.log(`[GameRoom] ${joinName} (${id}) entrou em ${room} ${platformLog} ${versionLog}`);

    const others = ctx.playersInRoom(room, id);
    const joinNowMs = Date.now();
    const creatureSnapshots = ctx.creatures.ensureRoom(room, joinMapId, instanceId);
    if (roomWasEmpty) {
        ctx.creatures.armRoomWakeDelay(room, joinNowMs);
    }

    ctx.send(socket, {
        type: 'welcome',
        v: PROTOCOL_VERSION,
        playerId: id,
        instanceId,
        health: player.health,
        maxHealth: player.maxHealth,
        players: others,
        creatures: creatureSnapshots,
    });
    ctx.sendPlayerResources(player);

    if (
        msg.tileX !== joinTileX ||
        msg.tileY !== joinTileY ||
        msg.z !== joinZ ||
        msg.mapId !== joinMapId
    ) {
        ctx.sendPositionCorrection(player);
    }

    if (resolvedJoin.corrected && characterId && accountId) {
        void ctx.positionPersistence.saveNow({
            characterId,
            accountId,
            mapId: joinMapId,
            tileX: joinTileX,
            tileY: joinTileY,
            z: joinZ,
            direction,
        });
    }

    ctx.broadcastToRoom(
        room,
        {
            type: 'player_joined',
            v: PROTOCOL_VERSION,
            player: ctx.toSnapshot(player),
        },
        id
    );

    console.log(
        `[GameRoom] ${player.name} (${id}) → sala ${room} @ ${joinTileX},${joinTileY},${joinZ} — ${ctx.getOnlineCount()} online`
    );
}
