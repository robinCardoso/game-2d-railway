import { describe, expect, it } from 'vitest';
import {
    clearBlockedMoveTiles,
    isBlockedTileCoolingDown,
    markBlockedTile,
} from './blockedMoveTiles';

describe('blockedMoveTiles', () => {
    it('marca tile e expira após cooldown', () => {
        clearBlockedMoveTiles();
        markBlockedTile(5, 6, 0, 1000);
        expect(isBlockedTileCoolingDown(5, 6, 0, 1100)).toBe(true);
        expect(isBlockedTileCoolingDown(5, 6, 0, 1250)).toBe(false);
        expect(isBlockedTileCoolingDown(5, 6, 0, 1300)).toBe(false);
    });
});
