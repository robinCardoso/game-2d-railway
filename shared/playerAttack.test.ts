import { describe, expect, it } from 'vitest';
import {
    chebyshevTileDistance,
    isPlayerInAttackRange,
    PLAYER_MELEE_RANGE,
    PLAYER_RANGED_RANGE,
    resolvePlayerAttackProfile,
} from './playerAttack.js';

const origin = { tileX: 10, tileY: 10, z: 0 };

describe('resolvePlayerAttackProfile', () => {
    it('knight usa melee adjacente', () => {
        const profile = resolvePlayerAttackProfile('knight');
        expect(profile.attackType).toBe('melee');
        expect(profile.range).toBe(PLAYER_MELEE_RANGE);
    });

    it('mage e sorcerer usam magic até 7 SQM', () => {
        for (const id of ['mage', 'sorcerer']) {
            const profile = resolvePlayerAttackProfile(id);
            expect(profile.attackType).toBe('magic');
            expect(profile.range).toBe(PLAYER_RANGED_RANGE);
        }
    });

    it('archer usa distance até 7 SQM', () => {
        const profile = resolvePlayerAttackProfile('archer');
        expect(profile.attackType).toBe('distance');
        expect(profile.range).toBe(PLAYER_RANGED_RANGE);
    });

    it('prioriza attackProfile do vocations.json sobre ID legado', () => {
        const profile = resolvePlayerAttackProfile('custom_sorcerer', {
            attackProfile: { attackType: 'magic', range: 5 },
        });
        expect(profile.attackType).toBe('magic');
        expect(profile.range).toBe(5);
    });
});

describe('isPlayerInAttackRange', () => {
    it('melee permite diagonal adjacente', () => {
        const profile = resolvePlayerAttackProfile('knight');
        expect(
            isPlayerInAttackRange(origin, { tileX: 11, tileY: 11, z: 0 }, profile)
        ).toBe(true);
    });

    it('melee bloqueia alvo a 2+ SQM (chebyshev)', () => {
        const profile = resolvePlayerAttackProfile('knight');
        expect(
            isPlayerInAttackRange(origin, { tileX: 12, tileY: 10, z: 0 }, profile)
        ).toBe(false);
    });

    it('magic permite até 7 SQM', () => {
        const profile = resolvePlayerAttackProfile('mage');
        expect(
            isPlayerInAttackRange(origin, { tileX: 17, tileY: 10, z: 0 }, profile)
        ).toBe(true);
        expect(chebyshevTileDistance(10, 10, 17, 10)).toBe(7);
    });

    it('magic bloqueia além de 7 SQM', () => {
        const profile = resolvePlayerAttackProfile('mage');
        expect(
            isPlayerInAttackRange(origin, { tileX: 18, tileY: 10, z: 0 }, profile)
        ).toBe(false);
    });

    it('bloqueia andar diferente', () => {
        const profile = resolvePlayerAttackProfile('knight');
        expect(
            isPlayerInAttackRange(origin, { tileX: 11, tileY: 10, z: 1 }, profile)
        ).toBe(false);
    });
});
