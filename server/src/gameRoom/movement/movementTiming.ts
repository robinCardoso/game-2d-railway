import {
    isDiagonalDirection8,
    type Direction8,
} from '../../../../shared/movement/direction8.js';

/** Fator autoritativo diagonal (doc Zezenia §7) — única fonte no servidor. */
export const SERVER_DIAGONAL_FACTOR = 1.15;

export function getAuthoritativeStepDurationMs(
    baseMs: number,
    direction8?: Direction8
): number {
    const base = Math.max(1, Math.round(baseMs));
    if (!direction8 || !isDiagonalDirection8(direction8)) {
        return base;
    }
    return Math.max(1, Math.round(base * SERVER_DIAGONAL_FACTOR));
}
