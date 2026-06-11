import { describe, expect, it } from 'vitest';
import { computeDepthSortFingerprint, DepthSortFingerprintCache } from './depthSortCache';
import type { DepthDrawable } from './depthSortDraw';

describe('computeDepthSortFingerprint', () => {
    it('ignora sub-pixel durante deslize no mesmo tile', () => {
        const a: DepthDrawable[] = [{ sortY: 320.1, sortX: 160.2, draw: () => {} }];
        const b: DepthDrawable[] = [{ sortY: 330.9, sortX: 165.7, draw: () => {} }];
        expect(computeDepthSortFingerprint(a)).toBe(computeDepthSortFingerprint(b));
    });
});

describe('DepthSortFingerprintCache stats', () => {
    it('consumeSortStats acumula hits e misses', () => {
        const cache = new DepthSortFingerprintCache();
        const buffer: DepthDrawable[] = [{ sortY: 10, sortX: 5, draw: () => {} }];

        cache.sortIfDirty(0, buffer);
        expect(cache.consumeSortStats()).toEqual({ hits: 0, misses: 1 });

        cache.sortIfDirty(0, buffer);
        expect(cache.consumeSortStats()).toEqual({ hits: 1, misses: 0 });
    });
});
