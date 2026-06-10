import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import { getLevelFromExp } from '../../../../src/engine/character/calculateStats.js';
import { syncPlayerLearnedSpells } from '../playerLoadout.js';
import type { ConnectedPlayer } from '../types.js';

export interface ProgressHandlerContext {
    shouldAcceptClientProgress: () => boolean;
    getPlayerBySocket: (socket: WebSocket) => ConnectedPlayer | undefined;
    recalcPlayerMaxHealth: (player: ConnectedPlayer) => void;
    send: (socket: WebSocket, message: ServerMessage) => void;
}

export function handleProgressSync(
    ctx: ProgressHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'progress_sync' }>
): void {
    if (!ctx.shouldAcceptClientProgress()) {
        return;
    }

    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    const clientExp = Math.max(0, Math.floor(msg.experience));
    if (clientExp <= player.experience) return;

    const prevLevel = player.level;
    player.experience = clientExp;
    player.level = getLevelFromExp(clientExp);
    if (player.level !== prevLevel) {
        ctx.recalcPlayerMaxHealth(player);
        void syncPlayerLearnedSpells(player);
    }

    ctx.send(player.socket, {
        type: 'player_progress',
        v: PROTOCOL_VERSION,
        playerId: player.id,
        level: player.level,
        experience: player.experience,
        leveledUp: false,
    });
}
