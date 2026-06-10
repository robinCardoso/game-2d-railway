import type { WebSocket } from 'ws';
import type {
    ClientMessage,
    PlayerSnapshot,
    ServerMessage,
} from '../../shared/protocol.js';
import {
    parseClientMessage,
    PROTOCOL_VERSION,
} from '../../shared/protocol.js';
import {
    filterCreatureSnapshotsForViewer,
    filterPlayerSnapshotsForViewer,
    isTileInSpectatorRange,
    type SpectatorTile,
} from '../../shared/creatureSpectatorRange.js';
import { buildRoomKey } from '../../shared/roomKey.js';
import type { MapCollisionStore } from './MapCollisionStore.js';
import type { MapInstanceStore } from './MapInstanceStore.js';
import type { BroadcastCreatureEvent } from './gameRoom/contextTypes.js';
import { handleChatSend, type ChatHandlerContext } from './gameRoom/handlers/chatHandlers.js';
import {
    handleAttack,
    type AttackHandlerContext,
} from './gameRoom/handlers/attackHandlers.js';
import {
    handleJoin,
    type JoinHandlerContext,
} from './gameRoom/handlers/joinHandlers.js';
import {
    handleMove,
    MOVE_REJECTION_THROTTLE_MS,
    type MoveHandlerContext,
} from './gameRoom/handlers/moveHandlers.js';
import {
    handleProgressSync,
    type ProgressHandlerContext,
} from './gameRoom/handlers/progressHandlers.js';
import {
    handleResyncRequest,
    RESYNC_MIN_INTERVAL_MS,
    type ResyncHandlerContext,
} from './gameRoom/handlers/resyncHandlers.js';
import {
    handleCastSpell,
    handleSpellBarSync,
    type SpellHandlerContext,
} from './gameRoom/handlers/spellHandlers.js';
import {
    playerResourcesChanged,
    recalcPlayerMaxStats,
    snapshotPlayerResources,
} from './gameRoom/playerVitals.js';
import {
    startPeriodicSnapshots,
    stopPeriodicSnapshots,
    type PeriodicSnapshotContext,
} from './gameRoom/periodicSnapshots.js';
import { ConnectedPlayer, type PlayerResourcesSnapshot } from './gameRoom/types.js';
import {
    expireStaleSteppingDest,
} from '../../shared/steppingDestReserve.js';
import { PositionPersistence } from './game/PositionPersistence.js';
import { ProgressPersistence } from './game/ProgressPersistence.js';
import { RoomCreatureManager } from './game/RoomCreatureManager.js';
import type { CreaturePresetStore } from './game/CreaturePresetStore.js';
import type { SpellCatalogStore } from './game/SpellCatalogStore.js';
import type { VocationStore } from './game/VocationStore.js';
import { env } from './config/env.js';
import { shouldAcceptClientProgressSync } from '../../shared/progressSyncPolicy.js';
import {
    buildServerChatBroadcast,
    sendChatToPlayers,
} from './chat/chatService.js';

export interface GameRoomOptions {
    requireWsTicket?: boolean;
    positionSaveIntervalMs?: number;
    creaturePresets: CreaturePresetStore;
    spellCatalog: SpellCatalogStore;
    vocations: VocationStore;
}

export class GameRoom {
    private players = new Map<string, ConnectedPlayer>();
    private socketToPlayerId = new Map<WebSocket, string>();
    private lastSentResources = new Map<string, PlayerResourcesSnapshot>();
    private readonly requireWsTicket: boolean;
    private readonly positionPersistence: PositionPersistence;
    private readonly progressPersistence: ProgressPersistence;
    private readonly creatures: RoomCreatureManager;
    private readonly spellCatalog: SpellCatalogStore;
    private readonly vocations: VocationStore;
    private readonly lastResyncRequestAtMs = new Map<string, number>();
    private snapshotTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly collision: MapCollisionStore,
        private readonly instances: MapInstanceStore,
        options: GameRoomOptions
    ) {
        this.requireWsTicket = options.requireWsTicket ?? false;
        this.spellCatalog = options.spellCatalog;
        this.vocations = options.vocations;
        this.positionPersistence = new PositionPersistence(options.positionSaveIntervalMs ?? 20_000);
        this.progressPersistence = new ProgressPersistence();
        this.creatures = new RoomCreatureManager(
            this.collision,
            options.creaturePresets,
            options.vocations,
            (room, message, event) => this.broadcastToSpectators(room, message, event),
            (room) => this.playersInRoomAsRefs(room)
        );
        this.creatures.start();
        this.snapshotTimer = startPeriodicSnapshots(this.periodicSnapshotContext());
    }

    private playersInRoomAsRefs(room: string): Array<{
        tileX: number;
        tileY: number;
        z: number;
        steppingDestTileX?: number;
        steppingDestTileY?: number;
    }> {
        const out: Array<{
            tileX: number;
            tileY: number;
            z: number;
            steppingDestTileX?: number;
            steppingDestTileY?: number;
        }> = [];
        for (const p of this.players.values()) {
            if (this.roomKey(p) !== room) continue;
            expireStaleSteppingDest(p);
            out.push({
                tileX: p.tileX,
                tileY: p.tileY,
                z: p.z,
                steppingDestTileX: p.steppingDestTileX,
                steppingDestTileY: p.steppingDestTileY,
            });
        }
        return out;
    }

    private sendCreatureSync(socket: WebSocket, room: string, mapId: string, instanceId?: string): void {
        const player = this.getPlayerBySocket(socket);
        const snapshots = this.creatures.ensureRoom(room, mapId, instanceId);
        const creatures = player
            ? filterCreatureSnapshotsForViewer(
                  { tileX: player.tileX, tileY: player.tileY, z: player.z },
                  snapshots
              )
            : snapshots;
        this.send(socket, {
            type: 'creature_sync',
            v: PROTOCOL_VERSION,
            mapId,
            instanceId,
            creatures,
        });
    }

    private generatePlayerId(): string {
        return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private roomKey(p: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>): string {
        return buildRoomKey(p.mapId, p.instanceId);
    }

    private send(socket: WebSocket, message: ServerMessage): void {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(JSON.stringify(message));
    }

    private broadcastToRoom(room: string, message: ServerMessage, exceptId?: string): void {
        const payload = JSON.stringify(message);
        for (const p of this.players.values()) {
            if (exceptId && p.id === exceptId) {
                continue;
            } else if (this.roomKey(p) !== room) {
                continue;
            } else if (p.socket.readyState === p.socket.OPEN) {
                p.socket.send(payload);
            }
        }
    }

    private broadcastToSpectators(
        room: string,
        message: ServerMessage,
        event: SpectatorTile,
        exceptId?: string
    ): void {
        const payload = JSON.stringify(message);
        for (const p of this.players.values()) {
            if (exceptId && p.id === exceptId) {
                continue;
            } else if (this.roomKey(p) !== room) {
                continue;
            } else if (
                !isTileInSpectatorRange(
                    { tileX: p.tileX, tileY: p.tileY, z: p.z },
                    event
                )
            ) {
                continue;
            } else if (p.socket.readyState === p.socket.OPEN) {
                p.socket.send(payload);
            }
        }
    }

    private broadcastCreatureEvent(
        room: string,
        creatureId: string,
        message: ServerMessage,
        eventTile?: SpectatorTile
    ): void {
        const tile = eventTile ?? this.creatures.getCreatureTile(room, creatureId);
        if (tile) {
            this.broadcastToSpectators(room, message, tile);
        } else {
            this.broadcastToRoom(room, message);
        }
    }

    private bindBroadcastCreatureEvent(): BroadcastCreatureEvent {
        return (room, creatureId, message, eventTile) =>
            this.broadcastCreatureEvent(room, creatureId, message, eventTile);
    }

    private broadcastToPlayerSpectators(
        room: string,
        message: ServerMessage,
        event: SpectatorTile,
        exceptId?: string
    ): void {
        this.broadcastToSpectators(room, message, event, exceptId);
    }

    private playersVisibleToViewer(
        viewer: Pick<ConnectedPlayer, 'tileX' | 'tileY' | 'z'>,
        room: string
    ): PlayerSnapshot[] {
        const viewerTile = { tileX: viewer.tileX, tileY: viewer.tileY, z: viewer.z };
        const all = this.playersInRoom(room);
        return filterPlayerSnapshotsForViewer(viewerTile, all);
    }

    private playersInRoom(room: string, exceptId?: string): PlayerSnapshot[] {
        const out: PlayerSnapshot[] = [];
        for (const p of this.players.values()) {
            if (this.roomKey(p) !== room) continue;
            if (exceptId && p.id === exceptId) continue;
            out.push(this.toSnapshot(p));
        }
        return out;
    }

    private toSnapshot(p: ConnectedPlayer): PlayerSnapshot {
        return {
            playerId: p.id,
            name: p.name,
            mapId: p.mapId,
            instanceId: p.instanceId,
            tileX: p.tileX,
            tileY: p.tileY,
            z: p.z,
            direction: p.direction,
            appearance: p.appearance,
            health: p.health,
            maxHealth: p.maxHealth,
            mana: p.mana,
            maxMana: p.maxMana,
        };
    }

    private recalcPlayerMaxHealth(player: ConnectedPlayer): void {
        recalcPlayerMaxStats(player, this.vocations);
        this.sendPlayerResources(player);
    }

    private sendPlayerResources(player: ConnectedPlayer, force = false): void {
        const payload = snapshotPlayerResources(player);
        const prev = this.lastSentResources.get(player.id);
        if (!force && !playerResourcesChanged(prev, payload)) return;
        this.lastSentResources.set(player.id, payload);
        this.send(player.socket, {
            type: 'player_resources',
            v: PROTOCOL_VERSION,
            playerId: player.id,
            ...payload,
        });
    }

    private getPlayerBySocket(socket: WebSocket): ConnectedPlayer | undefined {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return undefined;
        return this.players.get(playerId);
    }

    private spellHandlerContext(): SpellHandlerContext {
        return {
            getPlayerBySocket: (socket) => this.getPlayerBySocket(socket),
            roomKey: (player) => this.roomKey(player),
            send: (socket, message) => this.send(socket, message),
            broadcastToRoom: (room, message) => this.broadcastToRoom(room, message),
            broadcastCreatureEvent: this.bindBroadcastCreatureEvent(),
            sendPlayerResources: (player: ConnectedPlayer, force?: boolean) =>
                this.sendPlayerResources(player, force),
            creatures: this.creatures,
            spellCatalog: this.spellCatalog,
            vocations: this.vocations,
            progressPersistence: this.progressPersistence,
        };
    }

    private chatHandlerContext(): ChatHandlerContext {
        return {
            getPlayerBySocket: (socket) => this.getPlayerBySocket(socket),
            getAllPlayers: () => [...this.players.values()],
            send: (socket, message) => this.send(socket, message),
        };
    }

    private moveHandlerContext(): MoveHandlerContext {
        return {
            getPlayerBySocket: (socket) => this.getPlayerBySocket(socket),
            send: (socket, message) => this.send(socket, message),
            broadcastToRoom: (room, message, exceptId) =>
                this.broadcastToRoom(room, message, exceptId),
            broadcastToPlayerSpectators: (room, message, event, exceptId) =>
                this.broadcastToPlayerSpectators(room, message, event, exceptId),
            roomKey: (player) => this.roomKey(player),
            isWalkable: (mapId, tileX, tileY, z) => this.isWalkable(mapId, tileX, tileY, z),
            rejectMove: (player, code, message, logDetail) =>
                this.rejectMove(player, code, message, logDetail),
            persistPlayerPosition: (player, immediate) =>
                this.persistPlayerPosition(player, immediate),
            sendCreatureSync: (socket, room, mapId, instanceId) =>
                this.sendCreatureSync(socket, room, mapId, instanceId),
            toSnapshot: (player) => this.toSnapshot(player),
            instances: this.instances,
        };
    }

    private attackHandlerContext(): AttackHandlerContext {
        return {
            getPlayerBySocket: (socket) => this.getPlayerBySocket(socket),
            getPlayerById: (playerId) => this.players.get(playerId),
            roomKey: (player) => this.roomKey(player),
            send: (socket, message) => this.send(socket, message),
            broadcastToRoom: (room, message) => this.broadcastToRoom(room, message),
            broadcastToPlayerSpectators: (room, message, event) =>
                this.broadcastToPlayerSpectators(room, message, event),
            broadcastCreatureEvent: this.bindBroadcastCreatureEvent(),
            sendPlayerResources: (player: ConnectedPlayer, force?: boolean) =>
                this.sendPlayerResources(player, force),
            sendPositionCorrection: (player) => this.sendPositionCorrection(player),
            persistPlayerPosition: (player, immediate) =>
                this.persistPlayerPosition(player, immediate),
            recalcPlayerMaxHealth: (player) => this.recalcPlayerMaxHealth(player),
            collision: this.collision,
            creatures: this.creatures,
            vocations: this.vocations,
            progressPersistence: this.progressPersistence,
        };
    }

    private joinHandlerContext(): JoinHandlerContext {
        return {
            requireWsTicket: this.requireWsTicket,
            hasSocketMapping: (socket) => this.socketToPlayerId.has(socket),
            disconnectSocket: (socket) => this.handleDisconnect(socket),
            kickDuplicateCharacter: (characterId, exceptSocket) => {
                for (const existing of this.players.values()) {
                    if (existing.characterId === characterId && existing.socket !== exceptSocket) {
                        existing.socket.close();
                        this.handleDisconnect(existing.socket);
                    }
                }
            },
            playerIdExists: (id) => this.players.has(id),
            generatePlayerId: () => this.generatePlayerId(),
            registerPlayer: (id, player, socket) => {
                this.players.set(id, player);
                this.socketToPlayerId.set(socket, id);
                this.instances.trackPlayer(player.instanceId, id);
            },
            isWalkable: (mapId, tileX, tileY, z) => this.isWalkable(mapId, tileX, tileY, z),
            playersInRoom: (room, exceptId) => this.playersInRoom(room, exceptId),
            toSnapshot: (player) => this.toSnapshot(player),
            send: (socket, message) => this.send(socket, message),
            broadcastToRoom: (room, message, exceptId) =>
                this.broadcastToRoom(room, message, exceptId),
            broadcastToPlayerSpectators: (room, message, event, exceptId) =>
                this.broadcastToPlayerSpectators(room, message, event, exceptId),
            sendPlayerResources: (player: ConnectedPlayer, force?: boolean) =>
                this.sendPlayerResources(player, force),
            sendPositionCorrection: (player) => this.sendPositionCorrection(player),
            collision: this.collision,
            instances: this.instances,
            creatures: this.creatures,
            vocations: this.vocations,
            positionPersistence: this.positionPersistence,
            getOnlineCount: () => this.players.size,
        };
    }

    private progressHandlerContext(): ProgressHandlerContext {
        return {
            shouldAcceptClientProgress: () =>
                shouldAcceptClientProgressSync({
                    isProduction: env.isProduction,
                    allowClientProgressSync: env.allowClientProgressSync,
                    requireWsTicket: this.requireWsTicket,
                }),
            getPlayerBySocket: (socket) => this.getPlayerBySocket(socket),
            recalcPlayerMaxHealth: (player) => this.recalcPlayerMaxHealth(player),
            send: (socket, message) => this.send(socket, message),
        };
    }

    private resyncHandlerContext(): ResyncHandlerContext {
        return {
            getPlayerBySocket: (socket) => this.getPlayerBySocket(socket),
            tryAcquireResyncSlot: (playerId, nowMs) => {
                const last = this.lastResyncRequestAtMs.get(playerId) ?? 0;
                if (nowMs - last < RESYNC_MIN_INTERVAL_MS) return false;
                this.lastResyncRequestAtMs.set(playerId, nowMs);
                return true;
            },
            roomKey: (player) => this.roomKey(player),
            playersVisibleToViewer: (viewer, room) =>
                this.playersVisibleToViewer(viewer, room),
            sendCreatureSync: (socket, room, mapId, instanceId) =>
                this.sendCreatureSync(socket, room, mapId, instanceId),
            sendPositionCorrection: (player) => this.sendPositionCorrection(player),
            send: (socket, message) => this.send(socket, message),
        };
    }

    private periodicSnapshotContext(): PeriodicSnapshotContext {
        return {
            getOnlineCount: () => this.players.size,
            getPlayers: () => this.players.values(),
            getPlayerById: (playerId) => this.players.get(playerId),
            roomKey: (player) => this.roomKey(player),
            playersVisibleToViewer: (viewer, room) =>
                this.playersVisibleToViewer(viewer, room),
            creatures: this.creatures,
        };
    }

    private isWalkable(mapId: string, tileX: number, tileY: number, z: number): boolean {
        if (!this.collision.hasTemplate(mapId)) {
            return true;
        }
        return this.collision.isWalkable(mapId, tileX, tileY, z);
    }

    private sendPositionCorrection(player: ConnectedPlayer): void {
        this.send(player.socket, {
            type: 'position_correction',
            v: PROTOCOL_VERSION,
            mapId: player.mapId,
            instanceId: player.instanceId,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
        });
    }

    /**
     * Rejeita movimento com `error` + `position_correction`.
     * Throttle é **por jogador**, não por código — ex.: `MOVEMENT_TOO_FAST` seguido de
     * `NOT_WALKABLE` em <400ms também é ignorado. Intencional: anti-spam de rejeições.
     * Debug granular futuro: `lastMoveRejectionCode` ou contador por código.
     */
    private rejectMove(
        player: ConnectedPlayer,
        code: string,
        message: string,
        logDetail?: string
    ): void {
        const now = Date.now();
        if (
            player.lastMoveRejectionSentAtMs > 0 &&
            now - player.lastMoveRejectionSentAtMs < MOVE_REJECTION_THROTTLE_MS
        ) {
            return;
        }
        player.lastMoveRejectionSentAtMs = now;
        if (logDetail) {
            console.warn(`[GameRoom] ${logDetail}`);
        }
        this.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code,
            message,
        });
        this.sendPositionCorrection(player);
    }

    private persistPlayerPosition(player: ConnectedPlayer, immediate = false): void {
        if (!player.characterId || !player.accountId) return;
        const loc = {
            characterId: player.characterId,
            accountId: player.accountId,
            mapId: player.mapId,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
            direction: player.direction,
            health: player.health,
        };
        if (immediate) {
            void this.positionPersistence.saveNow(loc);
            return;
        }
        this.positionPersistence.queue(loc);
    }

    handleMessage(socket: WebSocket, raw: unknown): void {
        const msg = parseClientMessage(raw);
        if (!msg) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'INVALID_MESSAGE',
                message: 'Mensagem JSON inválida ou versão incompatível.',
            });
            return;
        }

        switch (msg.type) {
            case 'join':
                this.handleJoin(socket, msg);
                break;
            case 'move':
                this.handleMove(socket, msg, false);
                break;
            case 'map_change':
                this.handleMove(socket, msg, true);
                break;
            case 'attack':
                this.handleAttack(socket, msg);
                break;
            case 'cast_spell':
                this.handleCastSpell(socket, msg);
                break;
            case 'spell_bar_sync':
                this.handleSpellBarSync(socket, msg);
                break;
            case 'progress_sync':
                this.handleProgressSync(socket, msg);
                break;
            case 'resync_request':
                this.handleResyncRequest(socket);
                break;
            case 'ping':
                this.send(socket, { type: 'pong', v: PROTOCOL_VERSION, t: msg.t });
                break;
            case 'leave':
                this.handleDisconnect(socket);
                break;
            case 'chat_send':
                this.handleChatSend(socket, msg);
                break;
        }
    }

    private handleChatSend(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'chat_send' }>
    ): void {
        handleChatSend(this.chatHandlerContext(), socket, msg);
    }

    /** Mensagens de loot/sistema geradas pelo servidor (fase futura: hooks de combate). */
    pushServerChat(
        channel: 'loot' | 'system',
        text: string,
        kind: 'loot' | 'system' | 'combat' = channel
    ): void {
        const broadcast = buildServerChatBroadcast(channel, text, kind, Date.now());
        sendChatToPlayers(this.players.values(), broadcast);
    }

    private handleJoin(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'join' }>
    ): void {
        handleJoin(this.joinHandlerContext(), socket, msg);
    }

    private handleMove(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'move' } | { type: 'map_change' }>,
        isMapChange: boolean
    ): void {
        handleMove(this.moveHandlerContext(), socket, msg, isMapChange);
    }

    private handleProgressSync(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'progress_sync' }>
    ): void {
        handleProgressSync(this.progressHandlerContext(), socket, msg);
    }

    private handleResyncRequest(socket: WebSocket): void {
        handleResyncRequest(this.resyncHandlerContext(), socket);
    }

    private handleAttack(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'attack' }>
    ): void {
        handleAttack(this.attackHandlerContext(), socket, msg);
    }

    private handleCastSpell(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'cast_spell' }>
    ): void {
        handleCastSpell(this.spellHandlerContext(), socket, msg);
    }

    private handleSpellBarSync(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'spell_bar_sync' }>
    ): void {
        handleSpellBarSync(this.spellHandlerContext(), socket, msg);
    }

    handleDisconnect(socket: WebSocket): void {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;

        const player = this.players.get(playerId);
        const room = player ? this.roomKey(player) : '';

        if (player?.characterId) {
            this.persistPlayerPosition(player, true);
        }

        this.players.delete(playerId);
        this.socketToPlayerId.delete(socket);
        this.lastResyncRequestAtMs.delete(playerId);
        this.lastSentResources.delete(playerId);

        if (player) {
            this.instances.untrackPlayer(player.instanceId, playerId);
            console.log(`[GameRoom] ${player.name} (${playerId}) saiu de ${room}`);
            this.broadcastToPlayerSpectators(
                room,
                {
                    type: 'player_left',
                    v: PROTOCOL_VERSION,
                    playerId,
                },
                { tileX: player.tileX, tileY: player.tileY, z: player.z }
            );
        }
    }

    getStats(): { online: number } {
        return { online: this.players.size };
    }

    dispose(): void {
        stopPeriodicSnapshots(this.snapshotTimer);
        this.snapshotTimer = null;
    }
}
