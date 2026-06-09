import { describe, expect, it } from 'vitest';
import {
    createFloatingDamageEntry,
    FLOATING_DAMAGE_DURATION_MS,
    formatDamageLabel,
    pruneFloatingDamages,
} from './floatingCombatText';

describe('floatingCombatText', () => {
    it('formata dano como -N', () => {
        expect(formatDamageLabel(10)).toBe('-10');
        expect(formatDamageLabel(50)).toBe('-50');
    });

    it('float de dano some antes de 1s (evita sensação de trava)', () => {
        expect(FLOATING_DAMAGE_DURATION_MS).toBeLessThan(700);
    });

    it('prune remove entradas expiradas', () => {
        const entry = createFloatingDamageEntry(10, 1000, 0);
        expect(pruneFloatingDamages([entry], 1000 + FLOATING_DAMAGE_DURATION_MS - 1)).toHaveLength(1);
        expect(pruneFloatingDamages([entry], 1000 + FLOATING_DAMAGE_DURATION_MS)).toHaveLength(0);
    });
});
