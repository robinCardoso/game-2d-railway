import { describe, expect, it } from 'vitest';
import { validatePlayerStep, validatePlayerStepToTile } from './movementValidator.js';

describe('movementValidator', () => {
    const from = { tileX: 0, tileY: 0, z: 0 };
    const open = () => true;
    it('aceita passo diagonal válido', () => {
        const r = validatePlayerStep({
            from,
            direction8: 'south_east',
            isWalkable: open,
        });
        expect(r.ok).toBe(true);
        expect(r.to).toEqual({ tileX: 1, tileY: 1, z: 0 });
    });

    it('bloqueia canto quando ambos laterais fechados (OR)', () => {
        const isWalkableAt = (x: number, y: number, z: number) => {
            if (z !== 0) return false;
            if (x === 1 && y === 0) return false;
            if (x === 0 && y === 1) return false;
            return true;
        };
        const r = validatePlayerStep({
            from,
            direction8: 'south_east',
            isWalkable: isWalkableAt,
        });
        expect(r.ok).toBe(false);
        expect(r.code).toBe('INVALID_STEP');
    });

    it('permite diagonal com um lateral livre (OR)', () => {
        const r = validatePlayerStep({
            from,
            direction8: 'south_east',
            isWalkable: (x, y, z) => {
                if (z !== 0) return false;
                if (x === 1 && y === 0) return false;
                return true;
            },
        });
        expect(r.ok).toBe(true);
    });

    it('validatePlayerStepToTile rejeita salto de 2 tiles', () => {
        const r = validatePlayerStepToTile(
            from,
            { tileX: 2, tileY: 0, z: 0 },
            open
        );
        expect(r.ok).toBe(false);
    });

    it('isOccupied bloqueia destino', () => {
        const r = validatePlayerStep({
            from,
            direction8: 'east',
            isWalkable: open,
            isOccupied: (x) => x === 1,
        });
        expect(r.ok).toBe(false);
        expect(r.code).toBe('TILE_OCCUPIED');
    });
});
