/**
 * Resolução de input → direção 8 vias (extraído de gridMovement).
 */

import {
    DIAGONAL_CHORD_DELAY_MS,
    type GridDirection,
    type GridMovementController,
    type MovementKeyState,
} from './gridMovement';

type DiagonalChord = 'northwest' | 'northeast' | 'southwest' | 'southeast';

function updateChordHoldTiming(
    ctrl: GridMovementController,
    keys: MovementKeyState,
    nowMs: number
): void {
    const pairs: [DiagonalChord, boolean][] = [
        ['northwest', keys.chordNorthwest],
        ['northeast', keys.chordNortheast],
        ['southwest', keys.chordSouthwest],
        ['southeast', keys.chordSoutheast],
    ];
    for (const [chord, held] of pairs) {
        if (held) {
            if (ctrl.chordHeldSinceMs[chord] === undefined) {
                ctrl.chordHeldSinceMs[chord] = nowMs;
            }
        } else {
            delete ctrl.chordHeldSinceMs[chord];
        }
    }
}

function isChordDiagonalReady(
    ctrl: GridMovementController,
    chord: DiagonalChord,
    nowMs: number
): boolean {
    const since = ctrl.chordHeldSinceMs[chord];
    return since !== undefined && nowMs - since >= DIAGONAL_CHORD_DELAY_MS;
}

function cardinalFromFacingKey(ctrl: GridMovementController): GridDirection | null {
    if (ctrl.lastMovementFacingKey === 'w') return 'north';
    if (ctrl.lastMovementFacingKey === 's') return 'south';
    if (ctrl.lastMovementFacingKey === 'a') return 'west';
    if (ctrl.lastMovementFacingKey === 'd') return 'east';
    return null;
}

/** Resolve direção de movimento a partir do estado de teclas. */
export function resolveInputDirection8(
    ctrl: GridMovementController,
    keys: MovementKeyState,
    nowMs: number
): GridDirection | null {
    updateChordHoldTiming(ctrl, keys, nowMs);

    if (keys.explicitNorthwest) return 'northwest';
    if (keys.explicitNortheast) return 'northeast';
    if (keys.explicitSouthwest) return 'southwest';
    if (keys.explicitSoutheast) return 'southeast';

    const pendingChords: DiagonalChord[] = [];

    if (keys.chordNorthwest) {
        if (isChordDiagonalReady(ctrl, 'northwest', nowMs)) return 'northwest';
        pendingChords.push('northwest');
    }
    if (keys.chordNortheast) {
        if (isChordDiagonalReady(ctrl, 'northeast', nowMs)) return 'northeast';
        pendingChords.push('northeast');
    }
    if (keys.chordSouthwest) {
        if (isChordDiagonalReady(ctrl, 'southwest', nowMs)) return 'southwest';
        pendingChords.push('southwest');
    }
    if (keys.chordSoutheast) {
        if (isChordDiagonalReady(ctrl, 'southeast', nowMs)) return 'southeast';
        pendingChords.push('southeast');
    }

    if (pendingChords.length > 1) return null;

    if (pendingChords.length === 1) {
        const fallback = cardinalFromFacingKey(ctrl);
        if (fallback) return fallback;
    }

    const { north, south, east, west } = keys;
    if (!north && !south && !east && !west) return null;
    if (north && south) return null;
    if (east && west) return null;

    if (north) return 'north';
    if (south) return 'south';
    if (west) return 'west';
    if (east) return 'east';
    return null;
}
