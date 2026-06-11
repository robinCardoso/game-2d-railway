import { describe, expect, it } from 'vitest';
import { createEmptyEquipment } from '../../../shared/inventory';
import { resolveServerPlayerStepDurationMs } from '../../../server/src/game/playerMovement';

describe('resolveServerPlayerStepDurationMs', () => {
    it('aplica speedBonus de equipamento no passo mínimo', () => {
        const without = resolveServerPlayerStepDurationMs({
            level: 1,
            equipment: createEmptyEquipment(),
        });
        const withHaste = resolveServerPlayerStepDurationMs({
            level: 1,
            equipment: {
                ...createEmptyEquipment(),
                feet: 'boots_of_haste',
            },
        });
        expect(withHaste).toBeLessThan(without);
    });
});
