import type { WebSocket } from 'ws';
import type { PlayerSnapshot, ServerMessage } from '../../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import type { ConnectedPlayer } from '../types.js';

export const RESYNC_MIN_INTERVAL_MS = 2000;

export interface ResyncHandlerContext {
    getPlayerBySocket: (socket: WebSocket) => ConnectedPlayer | undefined;
    tryAcquireResyncSlot: (playerId: string, nowMs: number) => boolean;
    roomKey: (player: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>) => string;
    playersInRoom: (room: string) => PlayerSnapshot[];
    sendCreatureSync: (
        socket: WebSocket,
        room: string,
        mapId: string,
        instanceId?: string
    ) => void;
    sendPositionCorrection: (player: ConnectedPlayer) => void;
    send: (socket: WebSocket, message: ServerMessage) => void;
}

export function handleResyncRequest(ctx: ResyncHandlerContext, socket: WebSocket): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    const nowMs = Date.now();
    if (!ctx.tryAcquireResyncSlot(player.id, nowMs)) return;

    const room = ctx.roomKey(player);
    ctx.send(socket, {
        type: 'state_sync',
        v: PROTOCOL_VERSION,
        players: ctx.playersInRoom(room),
    });
    ctx.sendCreatureSync(socket, room, player.mapId, player.instanceId);
    ctx.sendPositionCorrection(player);
    ctx.send(socket, {
        type: 'player_progress',
        v: PROTOCOL_VERSION,
        playerId: player.id,
        level: player.level,
        experience: player.experience,
        leveledUp: false,
    });
}
