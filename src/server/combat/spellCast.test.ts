import { describe, expect, it } from 'vitest';
import type { SpellDefinition } from '../../../game-data/spellCatalogTypes';
import { validateAndResolveSpellCast } from '../../../server/src/combat/spellCast';
import type { VocationConfig } from '../../engine/character/calculateStats';

const vocationConfig: VocationConfig = {
    name: 'Knight',
    baseStats: {
        melee: 10,
        magicAttack: 5,
        distanceAttack: 5,
        defense: 10,
        attackSpeed: 550,
        defenseAttack: 0,
        health: 100,
        mana: 50,
    },
    growthPerLevel: {
        melee: 3,
        magicAttack: 1,
        distanceAttack: 1,
        defense: 2,
        health: 10,
        mana: 5,
    },
};

const spell: SpellDefinition = {
    id: 'knight_brutal_strike',
    name: 'Brutal Strike',
    description: '',
    group: 'attack',
    icon: '/ui/play-hud/combat/slot_empty.svg',
    manaCost: 10,
    cooldownMs: 2000,
    groupCooldownMs: 1000,
    minLevel: 1,
    vocations: ['knight'],
    range: 1,
    requiresTarget: true,
    damage: { type: 'melee', multiplier: 1 },
    implemented: true,
};

describe('validateAndResolveSpellCast', () => {
    it('rejeita magia não equipada nos slots', () => {
        const result = validateAndResolveSpellCast(
            spell,
            {
                playerId: 'p1',
                tileX: 10,
                tileY: 10,
                z: 0,
                level: 5,
                vocationId: 'knight',
                mana: 50,
                spellCooldownUntil: {},
                groupCooldownUntil: {},
                equippedSpellIds: ['knight_ground_slam'],
                learnedSpellIds: ['knight_brutal_strike', 'knight_ground_slam'],
            },
            {
                id: 'mob1',
                name: 'Rat',
                tileX: 11,
                tileY: 10,
                z: 0,
                health: 30,
                maxHealth: 30,
                defense: 2,
                isDead: false,
                creatureType: 'monster',
            },
            vocationConfig,
            1000
        );
        expect(result.ok).toBe(false);
        expect(result.code).toBe('SPELL_NOT_EQUIPPED');
    });

    it('rejeita magia não aprendida', () => {
        const result = validateAndResolveSpellCast(
            spell,
            {
                playerId: 'p1',
                tileX: 10,
                tileY: 10,
                z: 0,
                level: 5,
                vocationId: 'knight',
                mana: 50,
                spellCooldownUntil: {},
                groupCooldownUntil: {},
                equippedSpellIds: ['knight_brutal_strike'],
                learnedSpellIds: ['knight_ground_slam'],
            },
            {
                id: 'mob1',
                name: 'Rat',
                tileX: 11,
                tileY: 10,
                z: 0,
                health: 30,
                maxHealth: 30,
                defense: 2,
                isDead: false,
                creatureType: 'monster',
            },
            vocationConfig,
            1000
        );
        expect(result.ok).toBe(false);
        expect(result.code).toBe('SPELL_NOT_LEARNED');
    });

    it('aceita magia equipada e adjacente', () => {
        const result = validateAndResolveSpellCast(
            spell,
            {
                playerId: 'p1',
                tileX: 10,
                tileY: 10,
                z: 0,
                level: 5,
                vocationId: 'knight',
                mana: 50,
                spellCooldownUntil: {},
                groupCooldownUntil: {},
                equippedSpellIds: ['knight_brutal_strike'],
                learnedSpellIds: ['knight_brutal_strike'],
            },
            {
                id: 'mob1',
                name: 'Rat',
                tileX: 11,
                tileY: 10,
                z: 0,
                health: 30,
                maxHealth: 30,
                defense: 2,
                isDead: false,
                creatureType: 'monster',
            },
            vocationConfig,
            1000
        );
        expect(result.ok).toBe(true);
        expect(result.newMana).toBe(40);
    });
});
