import type { GridDirection } from './gridMovement';

/** Fila curta de direções — no máximo 2 passos à frente (doc Zezenia). */
export interface MovementInputBuffer {
    queue: GridDirection[];
}

export const MOVEMENT_INPUT_BUFFER_MAX = 2;

export function createMovementInputBuffer(): MovementInputBuffer {
    return { queue: [] };
}

export function pushMovementInput(
    buffer: MovementInputBuffer,
    direction: GridDirection
): void {
    if (buffer.queue.length >= MOVEMENT_INPUT_BUFFER_MAX) return;
    const last = buffer.queue[buffer.queue.length - 1];
    if (last === direction) return;
    buffer.queue.push(direction);
}

export function peekMovementInput(buffer: MovementInputBuffer): GridDirection | null {
    return buffer.queue[0] ?? null;
}

export function consumeMovementInput(buffer: MovementInputBuffer): GridDirection | null {
    return buffer.queue.shift() ?? null;
}

export function clearMovementInputBuffer(buffer: MovementInputBuffer): void {
    buffer.queue.length = 0;
}

export function movementInputBufferSize(buffer: MovementInputBuffer): number {
    return buffer.queue.length;
}
