import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../engine/config';
import { computeDepthSortFingerprint, DepthSortFingerprintCache } from '../engine/depthSortCache';
import type { DepthDrawable } from '../engine/depthSortDraw';
import { floorHasVisibleContentInView } from '../engine/floorViewportVisibility';
import { createEmptyLayerMap, setLayerCell } from '../engine/mapPaintLayers';
import { createEmptyWorldMap, ensureAllFloors } from '../engine/worldMap';

function drawable(sortY: number, sortX = 0): DepthDrawable {
    return { sortY, sortX, draw: () => {} };
}

describe('computeDepthSortFingerprint', () => {
    it('muda quando sortY de algum drawable muda', () => {
        const a = [drawable(10), drawable(20)];
        const b = [drawable(10), drawable(21)];
        expect(computeDepthSortFingerprint(a)).not.toBe(computeDepthSortFingerprint(b));
    });

    it('ignora ordem do array (multiset de chaves)', () => {
        const a = [drawable(10), drawable(20)];
        const b = [drawable(20), drawable(10)];
        expect(computeDepthSortFingerprint(a)).toBe(computeDepthSortFingerprint(b));
    });
});

describe('DepthSortFingerprintCache', () => {
    it('reaplica ordem cacheada sem chamar sort quando fingerprint é igual', () => {
        const cache = new DepthSortFingerprintCache();
        const buffer: DepthDrawable[] = [drawable(30, 1), drawable(10, 2), drawable(20, 3)];

        cache.sortIfDirty(0, buffer);
        expect(buffer.map((d) => d.sortY)).toEqual([10, 20, 30]);

        buffer.length = 0;
        buffer.push(drawable(30, 1), drawable(10, 2), drawable(20, 3));

        cache.sortIfDirty(0, buffer);
        expect(buffer.map((d) => d.sortY)).toEqual([10, 20, 30]);
    });

    it('reordena quando sortY muda', () => {
        const cache = new DepthSortFingerprintCache();
        const buffer: DepthDrawable[] = [drawable(30), drawable(10)];

        cache.sortIfDirty(0, buffer);
        expect(buffer.map((d) => d.sortY)).toEqual([10, 30]);

        buffer.length = 0;
        buffer.push(drawable(30), drawable(5));

        cache.sortIfDirty(0, buffer);
        expect(buffer.map((d) => d.sortY)).toEqual([5, 30]);
    });
});

describe('floorHasVisibleContentInView', () => {
    const emptyId = ENGINE_CONFIG.EMPTY_TILE_ID;

    it('sempre desenha o andar do jogador', () => {
        const worldMap = ensureAllFloors(createEmptyWorldMap(8));
        expect(
            floorHasVisibleContentInView({
                z: 3,
                startX: 0,
                endX: 3,
                startY: 0,
                endY: 3,
                playerWorldZ: 3,
                worldMap,
            })
        ).toBe(true);
    });

    it('pula andar vazio fora do jogador', () => {
        const worldMap = ensureAllFloors(createEmptyWorldMap(8));
        for (let z = ENGINE_CONFIG.MIN_FLOOR_Z; z <= ENGINE_CONFIG.MAX_FLOOR_Z; z++) {
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    worldMap[z]![y]![x] = emptyId;
                }
            }
        }
        expect(
            floorHasVisibleContentInView({
                z: 1,
                startX: 0,
                endX: 3,
                startY: 0,
                endY: 3,
                playerWorldZ: 0,
                worldMap,
            })
        ).toBe(false);
    });

    it('detecta tile base, grama ou item no viewport', () => {
        const worldMap = ensureAllFloors(createEmptyWorldMap(8));
        const grass = createEmptyLayerMap(8);
        const items = createEmptyLayerMap(8);

        worldMap[2]![1]![1] = 42;
        expect(
            floorHasVisibleContentInView({
                z: 2,
                startX: 0,
                endX: 3,
                startY: 0,
                endY: 3,
                playerWorldZ: 0,
                worldMap,
            })
        ).toBe(true);

        worldMap[2]![1]![1] = emptyId;
        setLayerCell(grass, 2, 1, 1, 7, 8);
        expect(
            floorHasVisibleContentInView({
                z: 2,
                startX: 0,
                endX: 3,
                startY: 0,
                endY: 3,
                playerWorldZ: 0,
                worldMap,
                grassOverlay: grass,
            })
        ).toBe(true);

        setLayerCell(grass, 2, 1, 1, emptyId, 8);
        setLayerCell(items, 2, 1, 1, 9, 8);
        expect(
            floorHasVisibleContentInView({
                z: 2,
                startX: 0,
                endX: 3,
                startY: 0,
                endY: 3,
                playerWorldZ: 0,
                worldMap,
                itemsOverlay: items,
            })
        ).toBe(true);
    });

    it('desenha andar ocupado por entidade mesmo sem tiles', () => {
        const worldMap = ensureAllFloors(createEmptyWorldMap(8));
        const occupied = new Set<number>([4]);
        expect(
            floorHasVisibleContentInView({
                z: 4,
                startX: 0,
                endX: 3,
                startY: 0,
                endY: 3,
                playerWorldZ: 0,
                worldMap,
                occupiedFloorZs: occupied,
            })
        ).toBe(true);
    });
});
