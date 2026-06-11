import { describe, expect, it } from 'vitest';
import type { SpellCatalogDocument } from '../src/game-data/spellCatalogTypes';
import { defaultSpellBarForVocation } from './spellBar';
import {
    resolveSpellBarOrDefaults,
    validateCharacterSpellBar,
} from './spellSlots';

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

describe('validateCharacterSpellBar', () => {
    it('aceita barra vazia', () => {
        const result = validateCharacterSpellBar({}, catalog, {
            vocationId: 'knight',
            level: 10,
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual({});
    });

    it('rejeita magia desconhecida', () => {
        const result = validateCharacterSpellBar({ slot1: 'unknown' }, catalog, {
            vocationId: 'knight',
            level: 10,
        });
        expect(result.ok).toBe(false);
    });

    it('rejeita vocação errada', () => {
        const result = validateCharacterSpellBar({ slot1: 'mock_fire_bolt' }, catalog, {
            vocationId: 'knight',
            level: 20,
        });
        expect(result.ok).toBe(false);
    });

    it('rejeita level baixo', () => {
        const result = validateCharacterSpellBar({ slot1: 'mock_fire_bolt' }, catalog, {
            vocationId: 'mage',
            level: 1,
        });
        expect(result.ok).toBe(false);
    });

    it('rejeita magia não implementada', () => {
        const result = validateCharacterSpellBar({ slot1: 'dev_spell' }, catalog, {
            vocationId: 'knight',
            level: 10,
        });
        expect(result.ok).toBe(false);
    });

    it('aceita magia válida', () => {
        const result = validateCharacterSpellBar(
            { slot1: 'knight_brutal_strike' },
            catalog,
            {
                vocationId: 'knight',
                level: 1,
                learnedSpellIds: ['knight_brutal_strike'],
            }
        );
        expect(result.ok).toBe(true);
    });

    it('rejeita magia não aprendida nos slots', () => {
        const result = validateCharacterSpellBar(
            { slot1: 'knight_brutal_strike' },
            catalog,
            {
                vocationId: 'knight',
                level: 10,
                learnedSpellIds: ['knight_ground_slam'],
            }
        );
        expect(result.ok).toBe(false);
    });
});

describe('resolveSpellBarOrDefaults', () => {
    it('usa defaults de knight quando vazio', () => {
        expect(resolveSpellBarOrDefaults({}, 'knight')).toEqual(defaultSpellBarForVocation('knight'));
    });

    it('preserva slots salvos', () => {
        const saved = { slot1: 'knight_brutal_strike' };
        expect(resolveSpellBarOrDefaults(saved, 'knight')).toEqual(saved);
    });
});
