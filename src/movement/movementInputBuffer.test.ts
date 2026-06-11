import { describe, expect, it } from 'vitest';
import {
    clearMovementInputBuffer,
    createMovementInputBuffer,
    pushMovementInput,
    consumeMovementInput,
    movementInputBufferSize,
} from './movementInputBuffer';

describe('movementInputBuffer', () => {
    it('limita fila a 2 direções', () => {
        const buf = createMovementInputBuffer();
        pushMovementInput(buf, 'north');
        pushMovementInput(buf, 'east');
        pushMovementInput(buf, 'south');
        expect(movementInputBufferSize(buf)).toBe(2);
        expect(consumeMovementInput(buf)).toBe('north');
        expect(consumeMovementInput(buf)).toBe('east');
    });

    it('clear esvazia fila', () => {
        const buf = createMovementInputBuffer();
        pushMovementInput(buf, 'west');
        clearMovementInputBuffer(buf);
        expect(movementInputBufferSize(buf)).toBe(0);
    });
});
