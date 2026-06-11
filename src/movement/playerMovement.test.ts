import { describe, expect, it } from 'vitest';
import { shouldHoldWalkBetweenSteps } from './playerMovement';

describe('shouldHoldWalkBetweenSteps', () => {
    it('mantém walk entre passos com teclas e modo autoritativo', () => {
        expect(shouldHoldWalkBetweenSteps(false, true, true)).toBe(true);
    });

    it('volta a idle sem intenção de movimento', () => {
        expect(shouldHoldWalkBetweenSteps(false, true, false)).toBe(false);
    });

    it('não segura walk durante deslize ativo', () => {
        expect(shouldHoldWalkBetweenSteps(true, true, true)).toBe(false);
    });

    it('não segura walk fora do modo autoritativo', () => {
        expect(shouldHoldWalkBetweenSteps(false, false, true)).toBe(false);
        expect(shouldHoldWalkBetweenSteps(false, undefined, true)).toBe(false);
    });
});
