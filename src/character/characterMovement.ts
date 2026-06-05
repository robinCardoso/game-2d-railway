/**
 * Orquestrador de movimento do personagem.
 * Une: stat base (level/equip) + buffs + terreno → duração final do passo.
 *
 * `movement/gridMovement.ts` só consome `stepDurationMs` por tile.
 */

import type { AccountType } from '../functions/roles';
import {
    resolveMovementSpeedWithStep,
    type CharacterSpeedState,
} from './movementSpeed';
import {
    applyTerrainToStepDuration,
    DEFAULT_TERRAIN_SPEED_MODIFIER,
    normalizeTerrainSpeedModifier,
} from './terrainSpeed';
import type { SpeedBuffTotals } from './speedBuffs';

export interface FullMovementResolveInput {
    stats: CharacterSpeedState;
    role: AccountType;
    buffTotals: SpeedBuffTotals;
    /** `speedModifier` do tile de destino (ou onde o personagem está). */
    terrainModifier?: number;
}

export interface FullMovementResolveResult {
    speed: number;
    baseStepDurationMs: number;
    stepDurationMs: number;
    terrainModifier: number;
}

export function resolveFullStepDuration(
    input: FullMovementResolveInput
): FullMovementResolveResult {
    const terrainModifier = normalizeTerrainSpeedModifier(
        input.terrainModifier ?? DEFAULT_TERRAIN_SPEED_MODIFIER
    );

    const { speed, stepDurationMs: baseStepDurationMs } =
        resolveMovementSpeedWithStep(
            input.stats,
            input.role,
            input.buffTotals
        );

    const stepDurationMs = applyTerrainToStepDuration(
        baseStepDurationMs,
        terrainModifier
    );

    return {
        speed,
        baseStepDurationMs,
        stepDurationMs,
        terrainModifier,
    };
}
