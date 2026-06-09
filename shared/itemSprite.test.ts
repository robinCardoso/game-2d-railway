import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import {
    buildDefaultIdleAnimation,
    defaultItemIconUrl,
    itemSpriteHasAnimation,
    resolveItemIconAnimationFrame,
    sanitizeItemSpriteCalibration,
    validateItemCatalogDocument,
} from './itemSprite';

describe('itemSprite', () => {
    it('defaultItemIconUrl usa slug em tiles/items/icons/', () => {
        expect(defaultItemIconUrl('Warrior Ring')).toBe('tiles/items/icons/warrior_ring.png');
    });

    it('sanitizeItemSpriteCalibration infere iconUrl e dims padrão', () => {
        const sprite = sanitizeItemSpriteCalibration(
            { frameWidth: 32, gridCols: 2 },
            'gold_coin'
        );
        expect(sprite?.iconUrl).toBe('tiles/items/icons/gold_coin.png');
        expect(sprite?.frameWidth).toBe(32);
        expect(sprite?.gridCols).toBe(2);
    });

    it('rejeita iconUrl fora de tiles/items/', () => {
        expect(
            sanitizeItemSpriteCalibration({ iconUrl: 'tiles/maps/foo.png' }, 'x')
        ).toBeUndefined();
    });

    it('validateItemCatalogDocument exige sprite quando implemented', () => {
        const catalog: ItemCatalogDocument = {
            items: [
                {
                    id: 'ring',
                    name: 'Ring',
                    category: 'equipment',
                    slot: 'ring',
                    implemented: true,
                },
            ],
        };
        const result = validateItemCatalogDocument(catalog);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors[0]).toContain('sprite.iconUrl');
        }
    });

    it('sanitize e resolve animação idle em strip', () => {
        const sprite = sanitizeItemSpriteCalibration(
            {
                gridCols: 4,
                gridRows: 1,
                animations: {
                    idle: { frames: [0, 1, 2, 3], speedFps: 4, loop: true },
                },
            },
            'potion'
        );
        expect(sprite?.animations?.idle.frames).toEqual([0, 1, 2, 3]);
        expect(itemSpriteHasAnimation(sprite!)).toBe(true);
        expect(resolveItemIconAnimationFrame(sprite!, 0)).toBe(0);
        expect(resolveItemIconAnimationFrame(sprite!, 500)).toBe(2);
    });

    it('buildDefaultIdleAnimation gera frames row-major', () => {
        const anim = buildDefaultIdleAnimation(2, 2, 8);
        expect(anim?.idle.frames).toEqual([0, 1, 2, 3]);
    });

    it('validateItemCatalogDocument checa arquivo quando callback informado', () => {
        const catalog: ItemCatalogDocument = {
            items: [
                {
                    id: 'ring',
                    name: 'Ring',
                    category: 'equipment',
                    slot: 'ring',
                    implemented: true,
                    sprite: {
                        iconUrl: 'tiles/items/icons/ring.png',
                        frameWidth: 32,
                        frameHeight: 32,
                        gridCols: 1,
                        gridRows: 1,
                    },
                },
            ],
        };
        expect(
            validateItemCatalogDocument(catalog, { iconFileExists: () => false }).ok
        ).toBe(false);
        expect(
            validateItemCatalogDocument(catalog, { iconFileExists: () => true }).ok
        ).toBe(true);
    });
});
