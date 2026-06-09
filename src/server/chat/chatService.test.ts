import { describe, expect, it } from 'vitest';
import { CHAT_MAX_TEXT_LENGTH, parseChatSendText, sanitizeChatText } from '../../../shared/chatConfig.js';
import {
    checkChatRateLimit,
    createChatRateLimitState,
    getLocalChatRecipients,
    recordChatSend,
    type ChatPlayerRef,
} from '../../../server/src/chat/chatService.js';

function mockPlayer(overrides: Partial<ChatPlayerRef> & Pick<ChatPlayerRef, 'id'>): ChatPlayerRef {
    return {
        name: overrides.name ?? 'Test',
        mapId: overrides.mapId ?? 'mainland',
        tileX: overrides.tileX ?? 10,
        tileY: overrides.tileY ?? 10,
        z: overrides.z ?? 0,
        socket: { readyState: 1, OPEN: 1, send: () => {} },
        ...overrides,
    };
}

describe('parseChatSendText', () => {
    it('rejeita vazio', () => {
        expect(parseChatSendText('   ')).toBeNull();
    });
});

describe('sanitizeChatText', () => {
    it('trim e colapsa espaços', () => {
        expect(sanitizeChatText('  olá   mundo  ')).toBe('olá mundo');
    });

    it('trunca no limite', () => {
        const long = 'a'.repeat(CHAT_MAX_TEXT_LENGTH + 50);
        expect(sanitizeChatText(long).length).toBe(CHAT_MAX_TEXT_LENGTH);
    });
});

describe('ChatRateLimiter', () => {
    it('bloqueia cooldown', () => {
        const state = createChatRateLimitState();
        const now = 10_000;
        recordChatSend(state, 'local', 'oi', now);
        const result = checkChatRateLimit(state, 'local', 'tchau', now + 200);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('CHAT_COOLDOWN');
            expect(result.retryAfterMs).toBe(800);
        }
    });

    it('bloqueia duplicata', () => {
        const state = createChatRateLimitState();
        const now = 10_000;
        recordChatSend(state, 'global', 'spam', now);
        const result = checkChatRateLimit(state, 'global', 'spam', now + 5_000);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('CHAT_DUPLICATE');
    });
});

describe('getLocalChatRecipients', () => {
    it('filtra por sala, Z e 20 sqm', () => {
        const sender = mockPlayer({ id: 'a', tileX: 10, tileY: 10, z: 0 });
        const near = mockPlayer({ id: 'b', tileX: 25, tileY: 10, z: 0 });
        const far = mockPlayer({ id: 'c', tileX: 40, tileY: 10, z: 0 });
        const otherZ = mockPlayer({ id: 'd', tileX: 11, tileY: 10, z: 1 });
        const recipients = getLocalChatRecipients(sender, [sender, near, far, otherZ]);
        expect(recipients.map((p) => p.id).sort()).toEqual(['a', 'b']);
    });
});
