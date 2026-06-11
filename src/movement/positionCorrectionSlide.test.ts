import { describe, expect, it } from 'vitest';
import {
    beginPositionCorrectionSlide,
    createPositionCorrectionSlide,
    tickPositionCorrectionSlide,
} from './positionCorrectionSlide';

describe('positionCorrectionSlide', () => {
    it('desliza worldX/Y até o tile alvo', () => {
        const slide = createPositionCorrectionSlide();
        const player = {
            worldX: 0,
            worldY: 0,
            worldZ: 0,
            tileX: 0,
            tileY: 0,
        };

        beginPositionCorrectionSlide(slide, player, 32, 2, 3, 0, 100);
        expect(player.tileX).toBe(2);
        expect(player.tileY).toBe(3);
        expect(slide.active).toBe(true);

        expect(tickPositionCorrectionSlide(slide, player, 50)).toBe(true);
        expect(player.worldX).toBeGreaterThan(0);
        expect(player.worldX).toBeLessThan(64);

        expect(tickPositionCorrectionSlide(slide, player, 100)).toBe(false);
        expect(player.worldX).toBe(64);
        expect(player.worldY).toBe(96);
    });

    it('snap imediato quando já está no tile visual', () => {
        const slide = createPositionCorrectionSlide();
        const player = {
            worldX: 64,
            worldY: 64,
            worldZ: 0,
            tileX: 1,
            tileY: 1,
        };

        beginPositionCorrectionSlide(slide, player, 32, 2, 2, 0);
        expect(slide.active).toBe(false);
        expect(player.worldX).toBe(64);
    });
});
