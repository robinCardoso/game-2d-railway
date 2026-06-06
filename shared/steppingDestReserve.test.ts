import { describe, expect, it } from 'vitest';
import {
    computeSteppingDestExpiresAtMs,
    DEFAULT_STEPPING_DEST_DURATION_MS,
    expireStaleSteppingDest,
    clearSteppingDest,
    STEPPING_DEST_EXPIRY_BUFFER_MS,
} from './steppingDestReserve.js';

describe('steppingDestReserve', () => {
    it('computeSteppingDestExpiresAtMs usa stepDuration + buffer', () => {
        const now = 1_000_000;
        expect(computeSteppingDestExpiresAtMs(180, now)).toBe(
            now + 180 + STEPPING_DEST_EXPIRY_BUFFER_MS
        );
    });

    it('computeSteppingDestExpiresAtMs usa fallback quando stepDuration ausente', () => {
        const now = 2_000_000;
        expect(computeSteppingDestExpiresAtMs(undefined, now)).toBe(
            now + DEFAULT_STEPPING_DEST_DURATION_MS + STEPPING_DEST_EXPIRY_BUFFER_MS
        );
    });

    it('expireStaleSteppingDest limpa reserva expirada', () => {
        const state = {
            steppingDestTileX: 10,
            steppingDestTileY: 20,
            steppingDestExpiresAtMs: 5000,
        };
        expireStaleSteppingDest(state, 5001);
        expect(state.steppingDestTileX).toBeUndefined();
        expect(state.steppingDestTileY).toBeUndefined();
        expect(state.steppingDestExpiresAtMs).toBeUndefined();
    });

    it('expireStaleSteppingDest mantém reserva ainda válida', () => {
        const state = {
            steppingDestTileX: 10,
            steppingDestTileY: 20,
            steppingDestExpiresAtMs: 5000,
        };
        expireStaleSteppingDest(state, 5000);
        expect(state.steppingDestTileX).toBe(10);
        expect(state.steppingDestTileY).toBe(20);
        expect(state.steppingDestExpiresAtMs).toBe(5000);
    });

    it('clearSteppingDest zera todos os campos', () => {
        const state = {
            steppingDestTileX: 1,
            steppingDestTileY: 2,
            steppingDestExpiresAtMs: 999,
        };
        clearSteppingDest(state);
        expect(state.steppingDestTileX).toBeUndefined();
        expect(state.steppingDestTileY).toBeUndefined();
        expect(state.steppingDestExpiresAtMs).toBeUndefined();
    });
});
