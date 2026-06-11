import { describe, expect, it } from 'vitest';
import {
    applyDirection,
    direction8FromTiles,
    directionFromDelta,
    fromProtocolDirection8,
    getVisualFacing,
    isDiagonalDirection8,
    toProtocolDirection8,
} from './direction8';

describe('direction8', () => {
    it('mapeia os 8 vetores e round-trip grid↔protocolo', () => {
        expect(directionFromDelta(0, -1)).toBe('north');
        expect(directionFromDelta(0, 1)).toBe('south');
        expect(directionFromDelta(1, 0)).toBe('east');
        expect(directionFromDelta(-1, 0)).toBe('west');
        expect(directionFromDelta(1, -1)).toBe('north_east');
        expect(directionFromDelta(-1, -1)).toBe('north_west');
        expect(directionFromDelta(1, 1)).toBe('south_east');
        expect(directionFromDelta(-1, 1)).toBe('south_west');

        expect(toProtocolDirection8('northwest')).toBe('north_west');
        expect(fromProtocolDirection8('north_west')).toBe('northwest');
    });

    it('rejeita deltas inválidos', () => {
        expect(directionFromDelta(0, 0)).toBeNull();
        expect(directionFromDelta(2, 0)).toBeNull();
        expect(directionFromDelta(0, 2)).toBeNull();
    });

    it('applyDirection avança um tile', () => {
        const from = { tileX: 5, tileY: 5, z: 0 };
        expect(applyDirection(from, 'east')).toEqual({ tileX: 6, tileY: 5, z: 0 });
        expect(applyDirection(from, 'south_east')).toEqual({ tileX: 6, tileY: 6, z: 0 });
    });

    it('direction8FromTiles deriva passo adjacente', () => {
        expect(
            direction8FromTiles(
                { tileX: 1, tileY: 1, z: 0 },
                { tileX: 2, tileY: 2, z: 0 }
            )
        ).toBe('south_east');
    });

    it('isDiagonalDirection8 e getVisualFacing', () => {
        expect(isDiagonalDirection8('north')).toBe(false);
        expect(isDiagonalDirection8('north_west')).toBe(true);
        expect(getVisualFacing('north_east')).toBe('east');
        expect(getVisualFacing('north_west')).toBe('west');
    });
});
