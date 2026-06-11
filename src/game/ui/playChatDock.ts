import type { ChatChannel, ChatPlayerChannel } from '../../../shared/chatConfig';
import { CHAT_MAX_TEXT_LENGTH, CHAT_PLAYER_CHANNELS } from '../../../shared/chatConfig';
import {
    getActiveChatChannel,
    getChatMessages,
    getChatUnreadCount,
    getTotalChatUnreadCount,
    setActiveChatChannel,
    subscribePlayChatStore,
    type ChatLogEntry,
} from '../chat/playChatStore';
import { markHudUpdate } from '../debug/playPerformanceMonitor';

const DOCK_EXPANDED_KEY = 'play.chat.dock.expanded';

const READ_ONLY_CHANNELS = new Set<ChatChannel>(['loot', 'system', 'guild']);

const CHANNELS: ChatChannel[] = ['local', 'global', 'guild', 'loot', 'system'];

export type PlayChatSendHandler = (channel: ChatPlayerChannel, text: string) => void;

let sendHandler: PlayChatSendHandler | null = null;
let cooldownUntilMs = 0;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;
let lastRenderedChannel: ChatChannel | null = null;
let lastRenderedEntryId: string | null = null;

function readDockExpanded(): boolean {
    try {
        const raw = localStorage.getItem(DOCK_EXPANDED_KEY);
        if (raw === '0') return false;
        if (raw === '1') return true;
    } catch {
        /* ignore */
    }
    return true;
}

function saveDockExpanded(expanded: boolean): void {
    try {
        localStorage.setItem(DOCK_EXPANDED_KEY, expanded ? '1' : '0');
    } catch {
        /* ignore */
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPlayerLine(entry: ChatLogEntry): string {
    const name = entry.senderName ? `<span class="play-chat-line__name">${escapeHtml(entry.senderName)}</span>` : '';
    return `${name}<span class="play-chat-line__text">${escapeHtml(entry.text)}</span>`;
}

function formatEntryHtml(entry: ChatLogEntry): string {
    if (entry.html) return entry.html;
    switch (entry.kind) {
        case 'combat':
            return `<span class="play-chat-line play-chat-line--combat">${escapeHtml(entry.text)}</span>`;
        case 'loot':
            return `<span class="play-chat-line play-chat-line--loot">${escapeHtml(entry.text)}</span>`;
        case 'system':
            return `<span class="play-chat-line play-chat-line--system">${escapeHtml(entry.text)}</span>`;
        case 'player':
        default:
            return `<span class="play-chat-line play-chat-line--player">${formatPlayerLine(entry)}</span>`;
    }
}

function setDockExpanded(dock: HTMLElement, expanded: boolean): void {
    dock.classList.toggle('is-expanded', expanded);
    dock.classList.toggle('is-collapsed', !expanded);
    const topBtn = document.getElementById('playHudChatToggle');
    topBtn?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const collapseBtn = dock.querySelector<HTMLButtonElement>('.play-chat-dock__collapse-btn');
    collapseBtn?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    saveDockExpanded(expanded);
}

function updateTopBadge(): void {
    const badge = document.querySelector<HTMLElement>('#playHudChatToggle .play-hud-action-btn__badge');
    if (!badge) return;
    const total = getTotalChatUnreadCount();
    if (total > 0) {
        badge.textContent = total > 9 ? '9+' : String(total);
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

function updateTabBadges(): void {
    const dock = document.getElementById('playChatDock');
    if (!dock) return;
    for (const channel of CHANNELS) {
        const tab = dock.querySelector<HTMLElement>(`[data-chat-tab="${channel}"]`);
        const badge = tab?.querySelector<HTMLElement>('.play-chat-dock__tab-badge');
        if (!badge) continue;
        const unread = getChatUnreadCount(channel);
        if (unread > 0 && channel !== getActiveChatChannel()) {
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    }
}

function updateComposerState(): void {
    const dock = document.getElementById('playChatDock');
    const input = dock?.querySelector<HTMLInputElement>('#playChatInput');
    const sendBtn = dock?.querySelector<HTMLButtonElement>('#playChatSendBtn');
    const hint = dock?.querySelector<HTMLElement>('#playChatComposerHint');
    const counter = dock?.querySelector<HTMLElement>('#playChatCharCount');
    if (!dock || !input || !sendBtn || !hint) return;

    const channel = getActiveChatChannel();
    const readOnly = READ_ONLY_CHANNELS.has(channel);
    const onCooldown = Date.now() < cooldownUntilMs;

    dock.classList.toggle('is-composer-disabled', readOnly || onCooldown);
    input.disabled = readOnly || onCooldown;
    sendBtn.disabled = readOnly || onCooldown || input.value.trim().length === 0;

    if (readOnly) {
        if (channel === 'guild') {
            hint.textContent = 'Guilda — em breve.';
        } else if (channel === 'loot') {
            hint.textContent = 'Loot — mensagens automáticas do jogo.';
        } else {
            hint.textContent = 'Sistema — anúncios do servidor.';
        }
    } else if (onCooldown) {
        const secs = Math.ceil((cooldownUntilMs - Date.now()) / 1000);
        hint.textContent = `Aguarde ${secs}s para enviar.`;
    } else {
        hint.textContent = '';
    }

    if (counter) {
        counter.textContent = `${input.value.length}/${CHAT_MAX_TEXT_LENGTH}`;
    }
}

function appendEntryToLog(log: HTMLElement, entry: ChatLogEntry): void {
    const empty = log.querySelector('.play-chat-dock__empty');
    empty?.remove();
    const div = document.createElement('div');
    div.className = 'play-chat-dock__entry';
    div.innerHTML = formatEntryHtml(entry);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function renderLogFull(channel: ChatChannel): void {
    const log = document.getElementById('playChatLog');
    if (!log) return;
    const entries = getChatMessages(channel);
    markHudUpdate('chat');
    lastRenderedChannel = channel;
    if (entries.length === 0) {
        log.innerHTML = '<p class="play-chat-dock__empty">Nenhuma mensagem ainda.</p>';
        lastRenderedEntryId = null;
        return;
    }
    log.innerHTML = entries.map((e) => `<div class="play-chat-dock__entry">${formatEntryHtml(e)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    lastRenderedEntryId = entries[entries.length - 1].id;
}

function renderLog(): void {
    const log = document.getElementById('playChatLog');
    if (!log) return;
    const channel = getActiveChatChannel();
    const entries = getChatMessages(channel);

    if (channel !== lastRenderedChannel || lastRenderedEntryId === null) {
        renderLogFull(channel);
        return;
    }

    if (entries.length === 0) {
        renderLogFull(channel);
        return;
    }

    const lastIdx = entries.findIndex((entry) => entry.id === lastRenderedEntryId);
    if (lastIdx === -1) {
        renderLogFull(channel);
        return;
    }

    if (lastIdx === entries.length - 1) return;

    markHudUpdate('chat');
    for (let i = lastIdx + 1; i < entries.length; i++) {
        appendEntryToLog(log, entries[i]);
    }
    lastRenderedEntryId = entries[entries.length - 1].id;
}

function renderTabs(): void {
    const dock = document.getElementById('playChatDock');
    if (!dock) return;
    const active = getActiveChatChannel();
    dock.querySelectorAll<HTMLElement>('[data-chat-tab]').forEach((tab) => {
        const channel = tab.dataset.chatTab as ChatChannel;
        tab.classList.toggle('is-active', channel === active);
        tab.setAttribute('aria-selected', channel === active ? 'true' : 'false');
    });
}

function refreshUi(): void {
    renderTabs();
    renderLog();
    updateTabBadges();
    updateTopBadge();
    updateComposerState();
}

export function setPlayChatSendHandler(handler: PlayChatSendHandler | null): void {
    sendHandler = handler;
}

export function setPlayChatCooldown(retryAfterMs: number): void {
    cooldownUntilMs = Date.now() + Math.max(0, retryAfterMs);
    if (cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
    }
    updateComposerState();
    if (retryAfterMs > 0) {
        cooldownTimer = setInterval(() => {
            updateComposerState();
            if (Date.now() >= cooldownUntilMs && cooldownTimer) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
            }
        }, 250);
    }
}

export function togglePlayChatDock(): void {
    const dock = document.getElementById('playChatDock');
    if (!dock) return;
    const expanded = !dock.classList.contains('is-expanded');
    setDockExpanded(dock, expanded);
}

export function initPlayChatDock(): void {
    const dock = document.getElementById('playChatDock');
    if (!dock) return;

    setDockExpanded(dock, readDockExpanded());

    const collapseBtn = dock.querySelector<HTMLButtonElement>('.play-chat-dock__collapse-btn');
    collapseBtn?.addEventListener('click', () => {
        const expanded = !dock.classList.contains('is-expanded');
        setDockExpanded(dock, expanded);
    });

    document.getElementById('playHudChatToggle')?.addEventListener('click', () => {
        togglePlayChatDock();
    });

    dock.querySelectorAll<HTMLElement>('[data-chat-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            const channel = tab.dataset.chatTab as ChatChannel;
            if (channel) setActiveChatChannel(channel);
        });
    });

    const input = dock.querySelector<HTMLInputElement>('#playChatInput');
    const sendBtn = dock.querySelector<HTMLButtonElement>('#playChatSendBtn');

    const trySend = (): void => {
        if (!input || !sendHandler) return;
        const channel = getActiveChatChannel();
        if (!CHAT_PLAYER_CHANNELS.includes(channel as ChatPlayerChannel)) return;
        const text = input.value.trim();
        if (!text) return;
        sendHandler(channel as ChatPlayerChannel, text.slice(0, CHAT_MAX_TEXT_LENGTH));
        input.value = '';
        updateComposerState();
    };

    sendBtn?.addEventListener('click', trySend);
    input?.addEventListener('input', () => updateComposerState());
    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            trySend();
        }
    });

    subscribePlayChatStore(refreshUi);
    refreshUi();
}

