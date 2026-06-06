/** Tempo mínimo do corpo visível após a morte (ms). */
export const MONSTER_CORPSE_MIN_MS = 3000;

/** Tempo máximo do corpo visível antes de sumir (respawn continua no servidor). */
export const MONSTER_CORPSE_MAX_MS = 8000;

/** Respawn autoritativo no servidor — manter alinhado com RoomCreatureManager. */
export const MONSTER_RESPAWN_MS = 45_000;

export interface CorpseAnimTiming {
    state: 'dead' | 'idle';
    durationMs: number;
}

/** Estima duração visível do corpo a partir da animação configurada. */
export function estimateCorpseVisibleMs(timing: CorpseAnimTiming): number {
    const raw = Math.max(MONSTER_CORPSE_MIN_MS, timing.durationMs);
    return Math.min(raw, MONSTER_CORPSE_MAX_MS);
}
