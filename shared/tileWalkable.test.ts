import { describe, expect, it } from 'vitest';
import { canAdjacentStep } from './tileWalkable';

describe('canAdjacentStep', () => {
    const open = () => true;
    const closed = (x: number, y: number) => x === 1 && y === 0;

    it('bloqueia diagonal quando ambos os cantos estão fechados', () => {
        const ok = canAdjacentStep(
            { tileX: 0, tileY: 0, z: 0 },
            { tileX: 1, tileY: 1, z: 0 },
            closed
        );
        expect(ok).toBe(false);
    });

    it('permite ortogonal adjacente', () => {
        const ok = canAdjacentStep(
            { tileX: 0, tileY: 0, z: 0 },
            { tileX: 1, tileY: 0, z: 0 },
            open
        );
        expect(ok).toBe(true);
    });

    it('rejeita salto de 2 tiles', () => {
        const ok = canAdjacentStep(
            { tileX: 0, tileY: 0, z: 0 },
            { tileX: 2, tileY: 0, z: 0 },
            open
        );
        expect(ok).toBe(false);
    });
});
