/**
 * Velocidade do terreno (tile) aplicada ao passo no grid.
 * Lê `speedModifier` de `tileConfig` — não duplica valores de piso aqui.
 */

/** Piso neutro (grama, etc.). */
export const DEFAULT_TERRAIN_SPEED_MODIFIER = 1;

const TERRAIN_MODIFIER_MIN = 0.25;
const TERRAIN_MODIFIER_MAX = 2.5;

/** Normaliza modifier do tile (1.0 = normal; >1 = mais rápido; <1 = mais lento). */
export function normalizeTerrainSpeedModifier(modifier?: number): number {
    const m = modifier ?? DEFAULT_TERRAIN_SPEED_MODIFIER;
    return Math.max(TERRAIN_MODIFIER_MIN, Math.min(TERRAIN_MODIFIER_MAX, m));
}

/**
 * Aplica terreno à duração base do passo (ms).
 * Modifier maior → menos ms (passo mais rápido).
 */
export function applyTerrainToStepDuration(
    baseStepDurationMs: number,
    terrainModifier: number
): number {
    const mod = normalizeTerrainSpeedModifier(terrainModifier);
    return Math.round(Math.max(16, baseStepDurationMs / mod));
}
