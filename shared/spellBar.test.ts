import { describe, expect, it } from 'vitest';
import { listEquippedSpellIds, parseSpellBar, isSpellEquipped } from './spellBar';

describe('spellBar', () => {
    it('parseSpellBar normaliza slots', () => {
        expect(parseSpellBar({ slot1: ' fire_bolt ', slot2: '', slot3: 'void' })).toEqual({
            slot1: 'fire_bolt',
            slot3: 'void',
        });
    });

    it('listEquippedSpellIds deduplica', () => {
        const bar = parseSpellBar({ slot1: 'a', slot2: 'a', slot3: 'b' });
        expect(listEquippedSpellIds(bar)).toEqual(['a', 'b']);
    });

    it('isSpellEquipped', () => {
        const bar = { slot1: 'knight_brutal_strike' };
        expect(isSpellEquipped('knight_brutal_strike', bar)).toBe(true);
        expect(isSpellEquipped('other', bar)).toBe(false);
    });
});
