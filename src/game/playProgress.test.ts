import { describe, expect, it } from 'vitest';
import { shouldCelebrateSessionLevelUp } from './playProgress';

describe('shouldCelebrateSessionLevelUp', () => {
    it('não celebra quando level permanece igual (login em level 3)', () => {
        expect(shouldCelebrateSessionLevelUp(3, 3)).toBe(false);
    });

    it('celebra quando sobe de level na sessão (2 → 3)', () => {
        expect(shouldCelebrateSessionLevelUp(2, 3)).toBe(true);
    });

    it('não celebra sync que corrige level sem subir na sessão (1 → 3 após baseline 3)', () => {
        expect(shouldCelebrateSessionLevelUp(3, 3)).toBe(false);
    });

    it('celebra múltiplos levels de uma vez', () => {
        expect(shouldCelebrateSessionLevelUp(1, 4)).toBe(true);
    });

    it('não celebra regressão de level', () => {
        expect(shouldCelebrateSessionLevelUp(5, 4)).toBe(false);
    });
});
