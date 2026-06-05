/**
 * Utilitários de verificação de movimento (console / dev).
 */

import type { AccountType } from '../functions/roles';
import { resolveFullStepDuration } from './characterMovement';
import type { CharacterSpeedState } from './movementSpeed';
import { stepDurationToTilesPerSecond } from './movementSpeed';
import type { SpeedBuffTotals } from './speedBuffs';

export interface MovementCompareSnapshot {
    label: string;
    speed: number;
    baseStepMs: number;
    stepMs: number;
    terrainModifier: number;
    tilesPerSecond: number;
}

export function buildMovementSnapshot(
    label: string,
    stats: CharacterSpeedState,
    role: AccountType,
    buffTotals: SpeedBuffTotals,
    terrainModifier: number
): MovementCompareSnapshot {
    const r = resolveFullStepDuration({
        stats,
        role,
        buffTotals,
        terrainModifier,
    });
    return {
        label,
        speed: r.speed,
        baseStepMs: r.baseStepDurationMs,
        stepMs: r.stepDurationMs,
        terrainModifier: r.terrainModifier,
        tilesPerSecond: stepDurationToTilesPerSecond(r.stepDurationMs),
    };
}

export function logMovementCompare(
    before: MovementCompareSnapshot,
    after: MovementCompareSnapshot
): void {
    const deltaMs = before.stepMs - after.stepMs;
    const deltaPct =
        before.stepMs > 0
            ? Math.round((deltaMs / before.stepMs) * 100)
            : 0;

    console.group(`[Movimento] ${after.label}`);
    console.table({
        antes: {
            speed: before.speed,
            'ms/tile': before.stepMs,
            'tiles/s': before.tilesPerSecond,
        },
        depois: {
            speed: after.speed,
            'ms/tile': after.stepMs,
            'tiles/s': after.tilesPerSecond,
        },
    });
    console.log(
        `Δ ${deltaMs > 0 ? 'mais rápido' : deltaMs < 0 ? 'mais lento' : 'igual'}: ${Math.abs(deltaMs)}ms/tile (${Math.abs(deltaPct)}%)`
    );
    console.groupEnd();
}
