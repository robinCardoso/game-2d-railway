import { describe, expect, it } from 'vitest';
import {
    chaseFaceDirectionWhenEngaged,
    DEFAULT_MELEE_CHASE_CONFIG,
    directionTowardTile,
    resolveChaseIdleDirection,
} from './creatureChase.js';

describe('directionTowardTile', () => {
    it('prefere eixo dominante', () => {
        expect(directionTowardTile(0, 0, 3, 1)).toBe('east');
        expect(directionTowardTile(0, 0, 1, 3)).toBe('south');
        expect(directionTowardTile(5, 5, 2, 5)).toBe('west');
        expect(directionTowardTile(5, 5, 5, 2)).toBe('north');
    });
});

describe('chaseFaceDirectionWhenEngaged', () => {
    it('vira para o jogador quando melee adjacente', () => {
        expect(
            chaseFaceDirectionWhenEngaged(10, 10, 11, 10, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBe('east');
        expect(
            chaseFaceDirectionWhenEngaged(10, 10, 9, 10, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBe('west');
    });

    it('retorna null fora do alcance', () => {
        expect(
            chaseFaceDirectionWhenEngaged(0, 0, 5, 0, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBeNull();
    });
});

describe('resolveChaseIdleDirection', () => {
    it('vira para o jogador quando aggroed e parado (adjacente)', () => {
        expect(resolveChaseIdleDirection(10, 10, 10, 9, 0, 0)).toBe('north');
        expect(resolveChaseIdleDirection(10, 10, 11, 10, 0, 0)).toBe('east');
    });

    it('vira para o jogador fora do attackRange mas dentro do aggro', () => {
        expect(resolveChaseIdleDirection(0, 0, 0, 4, 0, 0)).toBe('south');
        expect(resolveChaseIdleDirection(0, 0, 5, 0, 0, 0)).toBe('east');
    });

    it('retorna null fora do aggro ou andar diferente', () => {
        expect(resolveChaseIdleDirection(0, 0, 20, 0, 0, 0)).toBeNull();
        expect(resolveChaseIdleDirection(0, 0, 1, 0, 1, 0)).toBeNull();
        expect(resolveChaseIdleDirection(5, 5, 5, 5, 0, 0)).toBeNull();
    });
});
