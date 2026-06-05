import type { WebSocket } from 'ws';
import type {
    ClientMessage,
    PlayerSnapshot,
    ServerMessage,
} from '../../shared/protocol.js';
import {
    isValidTile,
    parseClientMessage,
    PROTOCOL_VERSION,
    SERVER_MAP_SIZE,
} from '../../shared/protocol.js';
import { buildRoomKey } from '../../shared/roomKey.js';
import { isAdjacentStep } from '../../shared/tileWalkable.js';
import type { MapCollisionStore } from './MapCollisionStore.js';
import type { MapInstanceStore } from './MapInstanceStore.js';
import { isInstancedMap } from './mapRegistry.js';
import { verifyEnterTicket } from './enterTicket.js';
import { PositionPersistence } from './game/PositionPersistence.js';

interface ConnectedPlayer {
    id: string;
    name: string;
    characterId?: string;
    accountId?: string;
    direction: 'north' | 'south' | 'east' | 'west';
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    socket: WebSocket;
}

export interface GameRoomOptions {
    requireWsTicket?: boolean;
    positionSaveIntervalMs?: number;
}

export class GameRoom {
    private players = new Map<string, ConnectedPlayer>();
    private socketToPlayerId = new Map<WebSocket, string>();
    private readonly requireWsTicket: boolean;
    private readonly positionPersistence: PositionPersistence;

    constructor(
        private readonly collision: MapCollisionStore,
        private readonly instances: MapInstanceStore,
        options: GameRoomOptions = {}
    ) {
        this.requireWsTicket = options.requireWsTicket ?? false;
        this.positionPersistence = new PositionPersistence(options.positionSaveIntervalMs ?? 20_000);
    }

    private generatePlayerId(): string {
        return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private roomKey(p: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>): string {
        return buildRoomKey(p.mapId, p.instanceId);
    }

    private send(socket: WebSocket, message: ServerMessage): void {
        if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    private broadcastToRoom(room: string, message: ServerMessage, exceptId?: string): void {
        const payload = JSON.stringify(message);
        for (const p of this.players.values()) {
            if (exceptId && p.id === exceptId) continue;
            if (this.roomKey(p) !== room) continue;
            if (p.socket.readyState === p.socket.OPEN) {
                p.socket.send(payload);
            }
        }
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
            case 'ping':
                this.send(socket, { type: 'pong', v: PROTOCOL_VERSION, t: msg.t });
                break;
            case 'leave':
                this.handleDisconnect(socket);
                break;
        }
    }

    private handleJoin(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'join' }>
    ): void {
        if (this.socketToPlayerId.has(socket)) {
            this.handleDisconnect(socket);
        }

        if (this.requireWsTicket && !msg.enterTicket) {
            this.send(socket, {
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
        let joinMapId = msg.mapId;
        let joinTileX = msg.tileX;
        let joinTileY = msg.tileY;
        let joinZ = msg.z;

        if (msg.enterTicket) {
            const ticket = verifyEnterTicket(msg.enterTicket);
            if (!ticket) {
                this.send(socket, {
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
        }

        if (characterId) {
            for (const existing of this.players.values()) {
                if (existing.characterId === characterId && existing.socket !== socket) {
                    existing.socket.close();
                    this.handleDisconnect(existing.socket);
                }
            }
        }

        if (!isValidTile(joinMapId, joinTileX, joinTileY, joinZ)) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'INVALID_TILE',
                message: `Tile inválido (${joinTileX},${joinTileY},${joinZ}) mapa ${SERVER_MAP_SIZE}×${SERVER_MAP_SIZE}.`,
            });
            return;
        }

        let instanceId = msg.instanceId;
        if (isInstancedMap(joinMapId)) {
            instanceId = this.instances.resolveInstanceId(joinMapId, instanceId);
        } else {
            instanceId = undefined;
        }

        if (!this.isWalkable(joinMapId, joinTileX, joinTileY, joinZ)) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'NOT_WALKABLE',
                message: 'Posição inicial não é walkable no template do mapa.',
            });
            return;
        }

        const id = msg.playerId && !this.players.has(msg.playerId)
            ? msg.playerId.slice(0, 64)
            : this.generatePlayerId();

        const player: ConnectedPlayer = {
            id,
            name: joinName,
            characterId,
            accountId,
            direction,
            mapId: joinMapId,
            instanceId,
            tileX: joinTileX,
            tileY: joinTileY,
            z: joinZ,
            socket,
        };

        this.players.set(id, player);
        this.socketToPlayerId.set(socket, id);
        this.instances.trackPlayer(instanceId, id);

        const room = this.roomKey(player);
        const others = this.playersInRoom(room, id);

        this.send(socket, {
            type: 'welcome',
            v: PROTOCOL_VERSION,
            playerId: id,
            instanceId,
            players: others,
        });

        if (
            msg.tileX !== joinTileX ||
            msg.tileY !== joinTileY ||
            msg.z !== joinZ ||
            msg.mapId !== joinMapId
        ) {
            this.sendPositionCorrection(player);
        }

        this.broadcastToRoom(
            room,
            {
                type: 'player_joined',
                v: PROTOCOL_VERSION,
                player: this.toSnapshot(player),
            },
            id
        );

        console.log(
            `[GameRoom] ${player.name} (${id}) → sala ${room} @ ${joinTileX},${joinTileY},${joinZ} — ${this.players.size} online`
        );
    }

    private handleMove(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'move' } | { type: 'map_change' }>,
        isMapChange: boolean
    ): void {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (!player) return;

        if (!isValidTile(msg.mapId, msg.tileX, msg.tileY, msg.z)) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'INVALID_TILE',
                message: 'Movimento rejeitado: coordenadas fora dos limites.',
            });
            this.sendPositionCorrection(player);
            return;
        }

        let instanceId = msg.instanceId;
        if (isInstancedMap(msg.mapId)) {
            if (!instanceId && player.instanceId) {
                instanceId = player.instanceId;
            }
            if (!instanceId) {
                instanceId = this.instances.resolveInstanceId(msg.mapId);
            }
        } else {
            instanceId = undefined;
        }

        if (!this.isWalkable(msg.mapId, msg.tileX, msg.tileY, msg.z)) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'NOT_WALKABLE',
                message: 'Movimento rejeitado: tile bloqueado.',
            });
            this.sendPositionCorrection(player);
            return;
        }

        const from = {
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
        };
        const to = { tileX: msg.tileX, tileY: msg.tileY, z: msg.z };

        if (!isMapChange) {
            const sameMap =
                player.mapId === msg.mapId &&
                player.instanceId === instanceId;
            if (sameMap && !isAdjacentStep(from, to)) {
                this.send(socket, {
                    type: 'error',
                    v: PROTOCOL_VERSION,
                    code: 'INVALID_STEP',
                    message: 'Movimento rejeitado: só um tile adjacente por vez.',
                });
                this.sendPositionCorrection(player);
                return;
            }
        }

        const oldRoom = this.roomKey(player);
        const mapChanged =
            player.mapId !== msg.mapId || player.instanceId !== instanceId;

        player.mapId = msg.mapId;
        player.instanceId = instanceId;
        player.tileX = msg.tileX;
        player.tileY = msg.tileY;
        player.z = msg.z;
        if (msg.direction) {
            player.direction = msg.direction;
        }

        const newRoom = this.roomKey(player);

        if (isMapChange && !isInstancedMap(player.mapId)) {
            this.persistPlayerPosition(player, true);
        } else if (!isInstancedMap(player.mapId)) {
            this.persistPlayerPosition(player);
        }

        if (
            isInstancedMap(player.mapId) &&
            player.instanceId &&
            (mapChanged || instanceId !== msg.instanceId)
        ) {
            this.send(socket, {
                type: 'instance_assigned',
                v: PROTOCOL_VERSION,
                mapId: player.mapId,
                instanceId: player.instanceId,
            });
        }

        const payload: ServerMessage = {
            type: 'player_moved',
            v: PROTOCOL_VERSION,
            playerId: player.id,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
            mapId: player.mapId,
            instanceId: player.instanceId,
        };

        if (mapChanged || oldRoom !== newRoom) {
            this.broadcastToRoom(
                oldRoom,
                { type: 'player_left', v: PROTOCOL_VERSION, playerId: player.id },
                player.id
            );
            this.broadcastToRoom(newRoom, payload, player.id);
            this.broadcastToRoom(
                newRoom,
                {
                    type: 'player_joined',
                    v: PROTOCOL_VERSION,
                    player: this.toSnapshot(player),
                },
                player.id
            );
        } else {
            this.broadcastToRoom(newRoom, payload, player.id);
        }
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

        if (player) {
            this.instances.untrackPlayer(player.instanceId, playerId);
            console.log(`[GameRoom] ${player.name} (${playerId}) saiu de ${room}`);
            this.broadcastToRoom(room, {
                type: 'player_left',
                v: PROTOCOL_VERSION,
                playerId,
            });
        }
    }

    getStats(): { online: number } {
        return { online: this.players.size };
    }
}
