import { describe, expect, it } from 'vitest';
import type { SpellCatalogDocument } from '../src/game-data/spellCatalogTypes';
import {
    computeEligibleSpellIds,
    isSpellEligibleForCharacter,
    isSpellLearned,
    parseLearnedSpellIds,
} from './characterSpells';

const catalog: SpellCatalogDocument = {
    spells: [
        {
            id: 'knight_brutal_strike',
            name: 'Brutal Strike',
            description: '',
            group: 'attack',
            icon: '/ui/play-hud/combat/spell_fire.svg',
            manaCost: 10,
            cooldownMs: 2000,
            groupCooldownMs: 1000,
            minLevel: 1,
            vocations: ['knight'],
            range: 1,
            requiresTarget: true,
            implemented: true,
        },
        {
            id: 'knight_ground_slam',
            name: 'Ground Slam',
            description: '',
            group: 'attack',
            icon: '/ui/play-hud/combat/spell_fire.svg',
            manaCost: 12,
            cooldownMs: 2500,
            groupCooldownMs: 1000,
            minLevel: 5,
            vocations: ['knight'],
            range: 1,
            requiresTarget: true,
            implemented: true,
        },
        {
            id: 'mock_fire_bolt',
            name: 'Fire Bolt',
            description: '',
            group: 'attack',
            icon: '/ui/play-hud/combat/spell_fire.svg',
            manaCost: 20,
            cooldownMs: 2000,
            groupCooldownMs: 1000,
            minLevel: 8,
            vocations: ['mage'],
            range: 4,
            requiresTarget: true,
            implemented: true,
        },
        {
            id: 'dev_spell',
            name: 'Dev',
            description: '',
            group: 'attack',
            icon: '/ui/play-hud/combat/slot_empty.svg',
            manaCost: 0,
            cooldownMs: 1000,
            groupCooldownMs: 1000,
            minLevel: 1,
            vocations: ['knight'],
            range: 1,
            requiresTarget: false,
            implemented: false,
        },
    ],
};

describe('characterSpells', () => {
    it('isSpellEligibleForCharacter respeita level, vocação e implemented', () => {
        const brutal = catalog.spells[0];
        expect(isSpellEligibleForCharacter(brutal, 'knight', 1)).toBe(true);
        expect(isSpellEligibleForCharacter(brutal, 'mage', 10)).toBe(false);
        expect(isSpellEligibleForCharacter(catalog.spells[3], 'knight', 10)).toBe(false);
    });

    it('computeEligibleSpellIds filtra por vocação e level', () => {
        expect(computeEligibleSpellIds(catalog, 'knight', 1)).toEqual(['knight_brutal_strike']);
        expect(computeEligibleSpellIds(catalog, 'knight', 10)).toEqual([
            'knight_brutal_strike',
            'knight_ground_slam',
        ]);
        expect(computeEligibleSpellIds(catalog, 'mage', 10)).toEqual(['mock_fire_bolt']);
    });

    it('parseLearnedSpellIds deduplica strings', () => {
        expect(parseLearnedSpellIds(['a', 'a', ' b '])).toEqual(['a', 'b']);
    });

    it('isSpellLearned', () => {
        expect(isSpellLearned('a', ['a', 'b'])).toBe(true);
        expect(isSpellLearned('c', ['a', 'b'])).toBe(false);
    });
});
