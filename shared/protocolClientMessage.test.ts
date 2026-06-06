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
