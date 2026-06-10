import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import {
    buildPlayerChatBroadcast,
    checkChatRateLimit,
    getGlobalChatRecipients,
    getLocalChatRecipients,
    isGuildChatEnabled,
    recordChatSend,
    sendChatToPlayers,
} from '../../chat/chatService.js';
import type { ConnectedPlayer } from '../types.js';

export interface ChatHandlerContext {
    getPlayerBySocket: (socket: WebSocket) => ConnectedPlayer | undefined;
    getAllPlayers: () => ConnectedPlayer[];
    send: (socket: WebSocket, message: ServerMessage) => void;
}

export function handleChatSend(
    ctx: ChatHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'chat_send' }>
): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    if (msg.channel === 'guild' && !isGuildChatEnabled()) {
        ctx.send(socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'CHAT_CHANNEL_DISABLED',
            message: 'Canal de guilda ainda não está disponível.',
        });
        return;
    }

    const nowMs = Date.now();
    const limit = checkChatRateLimit(player.chatRateLimit, msg.channel, msg.text, nowMs);
    if (!limit.ok) {
        ctx.send(socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: limit.code,
            message:
                limit.code === 'CHAT_COOLDOWN'
                    ? 'Aguarde antes de enviar outra mensagem.'
                    : 'Mensagem duplicada — aguarde um pouco.',
            retryAfterMs: limit.retryAfterMs,
        });
        return;
    }

    recordChatSend(player.chatRateLimit, msg.channel, msg.text, nowMs);
    const broadcast = buildPlayerChatBroadcast(msg.channel, player, msg.text, nowMs);
    const allPlayers = ctx.getAllPlayers();
    const recipients =
        msg.channel === 'global'
            ? getGlobalChatRecipients(allPlayers)
            : getLocalChatRecipients(player, allPlayers);
    sendChatToPlayers(recipients, broadcast);
}
