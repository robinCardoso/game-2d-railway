import { describe, expect, it } from 'vitest';
import {
    playerResourcesChanged,
    snapshotPlayerResources,
} from '../../../server/src/gameRoom/playerVitals.js';
import { spellCastErrorMessage } from '../../../server/src/gameRoom/spellMessages.js';
import type { ConnectedPlayer } from '../../../server/src/gameRoom/types.js';

describe('spellCastErrorMessage', () => {
    it('mapeia códigos conhecidos', () => {
        expect(spellCastErrorMessage('NOT_ENOUGH_MANA')).toContain('Mana');
        expect(spellCastErrorMessage('SPELL_COOLDOWN')).toContain('cooldown');
    });

    it('fallback genérico', () => {
        expect(spellCastErrorMessage('UNKNOWN')).toContain('conjurar');
    });
});

describe('playerResourcesChanged', () => {
    const base = {
        health: 100,
        maxHealth: 100,
        mana: 50,
        maxMana: 50,
    } as ConnectedPlayer;

    it('detecta mudança de mana', () => {
        const snap = snapshotPlayerResources(base);
        expect(playerResourcesChanged(snap, { ...snap, mana: 40 })).toBe(true);
        expect(playerResourcesChanged(snap, { ...snap })).toBe(false);
    });
});
