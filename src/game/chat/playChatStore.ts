import {
    CHAT_CHANNEL_LABELS,
    CHAT_LOG_MAX_MESSAGES,
    type ChatChannel,
    type ChatMessageKind,
} from '../../../shared/chatConfig';

export interface ChatLogEntry {
    id: string;
    channel: ChatChannel;
    kind: ChatMessageKind;
    text: string;
    senderName?: string;
    senderPlayerId?: string;
    sentAtMs: number;
    /** Segmentos HTML opcionais para mensagens ricas (loot/combate). */
    html?: string;
}

type StoreListener = () => void;

const messagesByChannel: Record<ChatChannel, ChatLogEntry[]> = {
    local: [],
    global: [],
    guild: [],
    loot: [],
    system: [],
};

const unreadByChannel: Record<ChatChannel, number> = {
    local: 0,
    global: 0,
    guild: 0,
    loot: 0,
    system: 0,
};

let activeChannel: ChatChannel = 'local';
const listeners = new Set<StoreListener>();
let messageCounter = 0;

function nextEntryId(): string {
    messageCounter += 1;
    return `client_chat_${messageCounter}`;
}

function notify(): void {
    for (const listener of listeners) {
        listener();
    }
}

function trimChannelBuffer(channel: ChatChannel): void {
    const list = messagesByChannel[channel];
    if (list.length > CHAT_LOG_MAX_MESSAGES) {
        messagesByChannel[channel] = list.slice(list.length - CHAT_LOG_MAX_MESSAGES);
    }
}

export function subscribePlayChatStore(listener: StoreListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getActiveChatChannel(): ChatChannel {
    return activeChannel;
}

export function setActiveChatChannel(channel: ChatChannel): void {
    if (activeChannel === channel) return;
    activeChannel = channel;
    unreadByChannel[channel] = 0;
    notify();
}

export function getChatMessages(channel: ChatChannel): readonly ChatLogEntry[] {
    return messagesByChannel[channel];
}

export function getChatUnreadCount(channel: ChatChannel): number {
    return unreadByChannel[channel];
}

export function getTotalChatUnreadCount(): number {
    return Object.values(unreadByChannel).reduce((sum, n) => sum + n, 0);
}

export function appendChatMessage(entry: Omit<ChatLogEntry, 'id'> & { id?: string }): void {
    const id = entry.id ?? nextEntryId();
    const full: ChatLogEntry = { ...entry, id };
    messagesByChannel[full.channel].push(full);
    trimChannelBuffer(full.channel);
    if (full.channel !== activeChannel) {
        unreadByChannel[full.channel] += 1;
    }
    notify();
}

export function clearChatChannel(channel: ChatChannel): void {
    messagesByChannel[channel] = [];
    unreadByChannel[channel] = 0;
    notify();
}

export function formatChatChannelLabel(channel: ChatChannel): string {
    return CHAT_CHANNEL_LABELS[channel];
}
