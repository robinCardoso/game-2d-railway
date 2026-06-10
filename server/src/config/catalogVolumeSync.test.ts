import { describe, expect, it } from 'vitest';
import {
    mergeCreaturePresetsFromRepo,
    mergeItemCatalogFromRepo,
} from './catalogVolumeSync.js';

describe('mergeItemCatalogFromRepo', () => {
    it('adiciona itens do repo quando volume está vazio', () => {
        const repo = {
            items: [
                { id: 'gold_coin', name: 'Gold Coin', category: 'loot', implemented: true },
            ],
        };
        const merged = mergeItemCatalogFromRepo(repo, { items: [] });
        expect(merged.items.map((i) => i.id)).toEqual(['gold_coin']);
    });

    it('preserva itens editados no volume', () => {
        const repo = {
            items: [
                { id: 'gold_coin', name: 'Gold Coin', category: 'loot', implemented: true },
            ],
        };
        const volume = {
            items: [
                { id: 'gold_coin', name: 'Moeda Custom', category: 'loot', implemented: true },
            ],
        };
        const merged = mergeItemCatalogFromRepo(repo, volume);
        expect(merged.items[0].name).toBe('Moeda Custom');
    });
});

describe('mergeCreaturePresetsFromRepo', () => {
    it('preenche loot ausente no volume a partir do repo', () => {
        const repo = [
            {
                name: 'Magao Bruto',
                loot: [{ itemId: 'gold_coin', chance: 100 }],
            },
        ];
        const volume = [{ name: 'Magao Bruto', maxHealth: 250 }];
        const merged = mergeCreaturePresetsFromRepo(repo, volume);
        expect(merged).toHaveLength(1);
        expect(merged[0].loot).toEqual([{ itemId: 'gold_coin', chance: 100 }]);
        expect(merged[0].maxHealth).toBe(250);
    });
});
