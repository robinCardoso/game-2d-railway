import { describe, expect, it } from 'vitest';
import { DepthSortFingerprintCache } from './depthSortCache';
import type { DepthDrawable } from './depthSortDraw';

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
