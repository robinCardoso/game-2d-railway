import { describe, expect, it } from 'vitest';
import { parseClientMessage, PROTOCOL_VERSION } from './protocol.js';

describe('parseClientMessage resync_request', () => {
    it('aceita resync_request válido', () => {
        const msg = parseClientMessage({ type: 'resync_request', v: PROTOCOL_VERSION });
        expect(msg).toEqual({ type: 'resync_request', v: PROTOCOL_VERSION });
    });

    it('rejeita versão incompatível', () => {
        expect(parseClientMessage({ type: 'resync_request', v: 99 })).toBeNull();
    });
});

describe('parseClientMessage chat_send', () => {
    it('aceita chat local válido', () => {
        const msg = parseClientMessage({
            type: 'chat_send',
            v: PROTOCOL_VERSION,
            channel: 'local',
            text: '  olá mundo  ',
        });
        expect(msg).toEqual({
            type: 'chat_send',
            v: PROTOCOL_VERSION,
            channel: 'local',
            text: 'olá mundo',
        });
    });

    it('rejeita canal inválido', () => {
        expect(
            parseClientMessage({
                type: 'chat_send',
                v: PROTOCOL_VERSION,
                channel: 'loot',
                text: 'teste',
            })
        ).toBeNull();
    });

    it('rejeita texto vazio', () => {
        expect(
            parseClientMessage({
                type: 'chat_send',
                v: PROTOCOL_VERSION,
                channel: 'global',
                text: '   ',
            })
        ).toBeNull();
    });
});
