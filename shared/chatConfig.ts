/**
 * Configuração compartilhada do sistema de chat (cliente + servidor).
 */

export type ChatChannel = 'local' | 'global' | 'guild' | 'loot' | 'system';

export type ChatMessageKind = 'player' | 'system' | 'loot' | 'combat';

/** Canais que jogadores podem enviar mensagens. */
export type ChatPlayerChannel = 'local' | 'global' | 'guild';

export const CHAT_MAX_TEXT_LENGTH = 200;
export const CHAT_LOCAL_RANGE_SQM = 20;
export const CHAT_DUPLICATE_WINDOW_MS = 30_000;

export const CHAT_COOLDOWN_MS: Record<ChatChannel, number> = {
    local: 1_000,
    global: 3_000,
    guild: 3_000,
    loot: 0,
    system: 0,
};

export const CHAT_PLAYER_CHANNELS: readonly ChatPlayerChannel[] = ['local', 'global', 'guild'];

export const CHAT_CHANNEL_LABELS: Record<ChatChannel, string> = {
    local: 'Local',
    global: 'Global',
    guild: 'Guilda',
    loot: 'Loot',
    system: 'Sistema',
};

export const CHAT_LOG_MAX_MESSAGES = 100;

export function isChatPlayerChannel(channel: string): channel is ChatPlayerChannel {
    return channel === 'local' || channel === 'global' || channel === 'guild';
}

export function isChatChannel(channel: string): channel is ChatChannel {
    return (
        channel === 'local' ||
        channel === 'global' ||
        channel === 'guild' ||
        channel === 'loot' ||
        channel === 'system'
    );
}

/** Sanitiza texto de chat — trim, colapsa espaços, remove controles. */
export function sanitizeChatText(raw: string): string {
    return raw
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, CHAT_MAX_TEXT_LENGTH);
}

export function parseChatSendText(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const text = sanitizeChatText(raw);
    return text.length > 0 ? text : null;
}
