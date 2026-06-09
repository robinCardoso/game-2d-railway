import {
    CHAT_COOLDOWN_MS,
    CHAT_DUPLICATE_WINDOW_MS,
    CHAT_LOCAL_RANGE_SQM,
    CHAT_PLAYER_CHANNELS,
    isChatPlayerChannel,
    type ChatChannel,
    type ChatMessageKind,
    type ChatPlayerChannel,
} from '../../../shared/chatConfig.js';
import type { ChatBroadcastMessage } from '../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../shared/protocol.js';
import { chebyshevTileDistance } from '../../../shared/playerAttack.js';
import { buildRoomKey } from '../../../shared/roomKey.js';

export interface ChatPlayerRef {
    id: string;
    name: string;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    socket: { readyState: number; OPEN: number; send: (data: string) => void };
}

export interface ChatRateLimitState {
    lastSentAtMs: Partial<Record<ChatPlayerChannel, number>>;
    lastTextByChannel: Partial<Record<ChatPlayerChannel, string>>;
    lastDuplicateAtMs: Partial<Record<ChatPlayerChannel, number>>;
}

export type ChatRateLimitResult =
    | { ok: true }
    | { ok: false; code: 'CHAT_COOLDOWN'; retryAfterMs: number }
    | { ok: false; code: 'CHAT_DUPLICATE'; retryAfterMs: number };

export function createChatRateLimitState(): ChatRateLimitState {
    return {
        lastSentAtMs: {},
        lastTextByChannel: {},
        lastDuplicateAtMs: {},
    };
}

export function checkChatRateLimit(
    state: ChatRateLimitState,
    channel: ChatPlayerChannel,
    text: string,
    nowMs: number
): ChatRateLimitResult {
    const cooldownMs = CHAT_COOLDOWN_MS[channel];
    const lastSent = state.lastSentAtMs[channel] ?? 0;
    const elapsed = nowMs - lastSent;
    if (elapsed < cooldownMs) {
        return { ok: false, code: 'CHAT_COOLDOWN', retryAfterMs: cooldownMs - elapsed };
    }

    const lastText = state.lastTextByChannel[channel];
    if (lastText === text) {
        const lastDup = state.lastDuplicateAtMs[channel] ?? 0;
        if (nowMs - lastDup < CHAT_DUPLICATE_WINDOW_MS) {
            return {
                ok: false,
                code: 'CHAT_DUPLICATE',
                retryAfterMs: CHAT_DUPLICATE_WINDOW_MS - (nowMs - lastDup),
            };
        }
    }

    return { ok: true };
}

export function recordChatSend(
    state: ChatRateLimitState,
    channel: ChatPlayerChannel,
    text: string,
    nowMs: number
): void {
    state.lastSentAtMs[channel] = nowMs;
    state.lastTextByChannel[channel] = text;
    state.lastDuplicateAtMs[channel] = nowMs;
}

export function getLocalChatRecipients(
    sender: ChatPlayerRef,
    players: Iterable<ChatPlayerRef>
): ChatPlayerRef[] {
    const senderRoom = buildRoomKey(sender.mapId, sender.instanceId);
    const recipients: ChatPlayerRef[] = [];
    for (const p of players) {
        if (p.id === sender.id) {
            recipients.push(p);
            continue;
        }
        if (buildRoomKey(p.mapId, p.instanceId) !== senderRoom) continue;
        if (p.z !== sender.z) continue;
        const dist = chebyshevTileDistance(sender.tileX, sender.tileY, p.tileX, p.tileY);
        if (dist <= CHAT_LOCAL_RANGE_SQM) {
            recipients.push(p);
        }
    }
    return recipients;
}

export function getGlobalChatRecipients(players: Iterable<ChatPlayerRef>): ChatPlayerRef[] {
    return [...players];
}

let chatMessageCounter = 0;

export function nextChatMessageId(): string {
    chatMessageCounter += 1;
    return `chat_${Date.now()}_${chatMessageCounter}`;
}

export function buildPlayerChatBroadcast(
    channel: ChatPlayerChannel,
    sender: ChatPlayerRef,
    text: string,
    sentAtMs: number
): ChatBroadcastMessage {
    return {
        type: 'chat_message',
        v: PROTOCOL_VERSION,
        messageId: nextChatMessageId(),
        channel,
        kind: 'player',
        text,
        senderName: sender.name,
        senderPlayerId: sender.id,
        sentAtMs,
    };
}

export function buildServerChatBroadcast(
    channel: 'loot' | 'system',
    text: string,
    kind: ChatMessageKind,
    sentAtMs: number
): ChatBroadcastMessage {
    return {
        type: 'chat_message',
        v: PROTOCOL_VERSION,
        messageId: nextChatMessageId(),
        channel,
        kind,
        text,
        sentAtMs,
    };
}

export function sendChatToPlayers(
    players: Iterable<ChatPlayerRef>,
    message: ChatBroadcastMessage
): void {
    const payload = JSON.stringify(message);
    for (const p of players) {
        if (p.socket.readyState === p.socket.OPEN) {
            p.socket.send(payload);
        }
    }
}

export function validateChatSendChannel(channel: string): channel is ChatPlayerChannel {
    return isChatPlayerChannel(channel) && CHAT_PLAYER_CHANNELS.includes(channel);
}

export function isGuildChatEnabled(): boolean {
    return false;
}
