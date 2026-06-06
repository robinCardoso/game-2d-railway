import { describe, expect, it } from 'vitest';
import { shouldAcceptClientProgressSync } from './progressSyncPolicy.js';

describe('shouldAcceptClientProgressSync', () => {
    it('bloqueia sempre em produção, mesmo com ALLOW_CLIENT_PROGRESS_SYNC', () => {
        expect(
            shouldAcceptClientProgressSync({
                isProduction: true,
                allowClientProgressSync: true,
                requireWsTicket: false,
            })
        ).toBe(false);
    });

    it('bloqueia dev sem opt-in explícito', () => {
        expect(
            shouldAcceptClientProgressSync({
                isProduction: false,
                allowClientProgressSync: false,
                requireWsTicket: false,
            })
        ).toBe(false);
    });

    it('bloqueia dev com ticket WS (servidor autoritativo)', () => {
        expect(
            shouldAcceptClientProgressSync({
                isProduction: false,
                allowClientProgressSync: true,
                requireWsTicket: true,
            })
        ).toBe(false);
    });

    it('aceita dev offline com opt-in e sem ticket', () => {
        expect(
            shouldAcceptClientProgressSync({
                isProduction: false,
                allowClientProgressSync: true,
                requireWsTicket: false,
            })
        ).toBe(true);
    });
});
