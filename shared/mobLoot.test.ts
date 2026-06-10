import { describe, expect, it } from 'vitest';
import { rollMobLoot } from './mobLoot';

describe('rollMobLoot', () => {
    it('retorna vazio sem tabela', () => {
        expect(rollMobLoot(undefined)).toEqual([]);
        expect(rollMobLoot([])).toEqual([]);
    });

    it('sempre dropa quando chance é 100', () => {
        const grants = rollMobLoot(
            [{ itemId: 'gold_coin', chance: 100, quantity: 5 }],
            { random: () => 0.99 }
        );
        expect(grants).toEqual([{ itemId: 'gold_coin', quantity: 5 }]);
    });

    it('não dropa quando random excede chance', () => {
        const grants = rollMobLoot(
            [{ itemId: 'health_potion', chance: 50 }],
            { random: () => 0.6 }
        );
        expect(grants).toEqual([]);
    });

    it('dropa quando random está abaixo da chance', () => {
        const grants = rollMobLoot(
            [{ itemId: 'health_potion', chance: 50 }],
            { random: () => 0.4 }
        );
        expect(grants).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    });

    it('cada jogador rola independentemente (política A)', () => {
        let roll = 0;
        const random = () => {
            roll += 1;
            return roll === 1 ? 0.1 : 0.9;
        };
        const table = [{ itemId: 'gold_coin', chance: 50 }];

        const first = rollMobLoot(table, { random });
        const second = rollMobLoot(table, { random });

        expect(first).toEqual([{ itemId: 'gold_coin', quantity: 1 }]);
        expect(second).toEqual([]);
    });
});
