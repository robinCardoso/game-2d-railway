import type { ChatBroadcastMessage } from '../../../shared/protocol';
import type { GameNetClient } from '../../net/gameNetClient';
import { appendChatMessage } from './playChatStore';
import {
    initPlayChatDock,
    setPlayChatCooldown,
    setPlayChatSendHandler,
} from '../ui/playChatDock';

let boundClient: GameNetClient | null = null;

function handleChatMessage(msg: ChatBroadcastMessage): void {
    appendChatMessage({
        id: msg.messageId,
        channel: msg.channel,
        kind: msg.kind,
        text: msg.text,
        senderName: msg.senderName,
        senderPlayerId: msg.senderPlayerId,
        sentAtMs: msg.sentAtMs,
    });
}

export function bindPlayChatNetwork(client: GameNetClient): void {
    boundClient = client;
    setPlayChatSendHandler((channel, text) => {
        boundClient?.sendChat(channel, text);
    });
}

export function unbindPlayChatNetwork(): void {
    boundClient = null;
    setPlayChatSendHandler(null);
}

export function initPlayChatController(): void {
    initPlayChatDock();

    setPlayChatSendHandler((channel, text) => {
        boundClient?.sendChat(channel, text);
    });
}

export function createPlayChatNetHandlers(): {
    onChatMessage: (msg: ChatBroadcastMessage) => void;
    onServerError: (payload: { code: string; message: string; retryAfterMs?: number }) => void;
} {
    return {
        onChatMessage: handleChatMessage,
        onServerError: (payload) => {
            if (payload.code === 'CHAT_COOLDOWN' || payload.code === 'CHAT_DUPLICATE') {
                setPlayChatCooldown(payload.retryAfterMs ?? 1000);
            }
        },
    };
}
