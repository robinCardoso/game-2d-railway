/**
 * Stat de velocidade do personagem (persistente: base, level, equipamento).
 *
 * Buffs temporários → `speedBuffs.ts`
 * Terreno por tile → `terrainSpeed.ts`
 * Orquestração → `characterMovement.ts`
 */

import type { AccountType } from '../functions/roles';
import type { SpeedBuffTotals } from './speedBuffs';

export const MOVEMENT_SPEED_LIMITS = {
    MIN: 1,
    MAX: 350,
    PLAYER_BASE: 1,
    GM: 350,
    TUTOR: 280,
} as const;

export const STEP_DURATION_BY_SPEED = {
    AT_MIN_SPEED: 320,
    AT_MAX_SPEED: 55,
} as const;

/**
 * Até este stat, cada ponto de SPEED muda bastante o ms (gameplay nível baixo).
 * Acima disso, a curva aproxima do teto (end-game / GM).
 */
const LOW_SPEED_CURVE_CAP = 60;

export const LEVEL_SPEED_BONUS_CAP = 80;

export interface CharacterSpeedState {
    baseSpeed: number;
    level: number;
    equipmentBonus: number;
}

export function createDefaultCharacterSpeed(): CharacterSpeedState {
    return {
        baseSpeed: MOVEMENT_SPEED_LIMITS.PLAYER_BASE,
        level: 1,
        equipmentBonus: 0,
    };
}

export function clampMovementSpeed(speed: number): number {
    return Math.max(
        MOVEMENT_SPEED_LIMITS.MIN,
        Math.min(MOVEMENT_SPEED_LIMITS.MAX, speed)
    );
}

export function getLevelSpeedBonus(level: number): number {
    const safe = Math.max(0, Math.floor(level));
    return Math.min(Math.max(0, safe - 1), LEVEL_SPEED_BONUS_CAP);
}

export function resolveMovementSpeed(
    state: CharacterSpeedState,
    role: AccountType,
    buffTotals: SpeedBuffTotals = { bonus: 0, penalty: 0 }
): number {
    if (role === 'GM') {
        return MOVEMENT_SPEED_LIMITS.GM;
    }

    const raw =
        state.baseSpeed +
        getLevelSpeedBonus(state.level) +
        state.equipmentBonus +
        buffTotals.bonus -
        buffTotals.penalty;

    const capped = clampMovementSpeed(raw);

    if (role === 'Tutor') {
        return Math.min(capped, MOVEMENT_SPEED_LIMITS.TUTOR);
    }

    return capped;
}

/**
 * Converte SPEED → ms/tile com curva em dois trechos:
 * - Speed 1–60: 320ms → 180ms (cada +1 de stat é perceptível no andar).
 * - Speed 60–350: 180ms → 55ms (progressão de end-game).
 */
export function speedToStepDurationMs(speed: number): number {
    const s = clampMovementSpeed(speed);
    const { MIN, MAX } = MOVEMENT_SPEED_LIMITS;
    const { AT_MIN_SPEED, AT_MAX_SPEED } = STEP_DURATION_BY_SPEED;
    const midMs = 180;

    if (s <= LOW_SPEED_CURVE_CAP) {
        const t = (s - MIN) / (LOW_SPEED_CURVE_CAP - MIN);
        return Math.round(AT_MIN_SPEED - t * (AT_MIN_SPEED - midMs));
    }

    const t = (s - LOW_SPEED_CURVE_CAP) / (MAX - LOW_SPEED_CURVE_CAP);
    return Math.round(midMs - t * (midMs - AT_MAX_SPEED));
}

export interface ResolvedMovementSpeed {
    speed: number;
    stepDurationMs: number;
}

export function resolveMovementSpeedWithStep(
    state: CharacterSpeedState,
    role: AccountType,
    buffTotals: SpeedBuffTotals = { bonus: 0, penalty: 0 }
): ResolvedMovementSpeed {
    const speed = resolveMovementSpeed(state, role, buffTotals);
    return {
        speed,
        stepDurationMs: speedToStepDurationMs(speed),
    };
}

/** Tiles por segundo (útil para comparar visualmente). */
export function stepDurationToTilesPerSecond(stepDurationMs: number): number {
    if (stepDurationMs <= 0) return 0;
    return Math.round((1000 / stepDurationMs) * 10) / 10;
}
