import { describe, expect, it } from 'vitest';
import { findPath8, findPath8FirstDirection } from './pathfinding8';

describe('pathfinding8', () => {
    const openField = () => true;

    it('encontra caminho reto em campo aberto', () => {
        const path = findPath8(
            { tileX: 0, tileY: 0, z: 0 },
            { tileX: 3, tileY: 0, z: 0 },
            openField
        );
        expect(path).not.toBeNull();
        expect(path!.length).toBe(4);
        expect(path![3]).toEqual({ tileX: 3, tileY: 0, z: 0 });
    });

    it('primeira direção em diagonal livre', () => {
        const dir = findPath8FirstDirection(
            { tileX: 5, tileY: 5, z: 0 },
            { tileX: 7, tileY: 7, z: 0 },
            openField
        );
        expect(dir === 'south_east' || dir === 'east' || dir === 'south').toBe(true);
    });

    it('respeita canto OR — diagonal com um lado livre', () => {
        const blocked = (x: number, y: number) => !(x === 1 && y === 0);
        const dir = findPath8FirstDirection(
            { tileX: 0, tileY: 0, z: 0 },
            { tileX: 1, tileY: 1, z: 0 },
            (x, y, z) => z === 0 && blocked(x, y)
        );
        expect(dir).toBe('south_east');
    });
});
