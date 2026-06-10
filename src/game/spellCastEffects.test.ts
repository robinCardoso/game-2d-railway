import { describe, expect, it } from 'vitest';
import type { SpellDefinition } from '../game-data/spellCatalogTypes';
import {
    getActiveSpellCastEffectCount,
    pruneSpellCastEffects,
    resetSpellCastEffects,
    resolveSpellCastEffectKind,
    spawnSpellCastEffect,
} from './spellCastEffects';

function knightSpell(id: string, castEffect?: string): SpellDefinition {
    return {
        id,
        name: id,
        description: '',
        group: 'attack',
        icon: '/ui/play-hud/combat/attack.svg',
        manaCost: 5,
        cooldownMs: 2000,
        groupCooldownMs: 2000,
        minLevel: 1,
        vocations: ['knight'],
        range: 1,
        requiresTarget: true,
        damage: { type: 'melee', multiplier: 1 },
        castEffect,
        implemented: true,
    };
}

describe('spellCastEffects', () => {
    it('resolveSpellCastEffectKind mapeia magias knight', () => {
        expect(resolveSpellCastEffectKind(knightSpell('knight_brutal_strike'))).toBe(
            'knight_brutal_strike'
        );
        expect(resolveSpellCastEffectKind(knightSpell('knight_ground_slam'))).toBe(
            'knight_ground_slam'
        );
        expect(resolveSpellCastEffectKind(knightSpell('knight_front_sweep'))).toBe(
            'knight_front_sweep'
        );
    });

    it('castEffect explícito sobrescreve id', () => {
        expect(
            resolveSpellCastEffectKind(
                knightSpell('custom_id', 'knight_ground_slam')
            )
        ).toBe('knight_ground_slam');
    });

    it('spawn e prune remove efeitos expirados', () => {
        resetSpellCastEffects();
        spawnSpellCastEffect(knightSpell('knight_brutal_strike'), {
            worldX: 320,
            worldY: 320,
            z: 0,
            casterWorldX: 288,
            casterWorldY: 320,
        }, 1000);
        expect(getActiveSpellCastEffectCount()).toBe(1);
        pruneSpellCastEffects(2000);
        expect(getActiveSpellCastEffectCount()).toBe(0);
    });
});
