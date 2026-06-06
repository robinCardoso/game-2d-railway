/** Margem após stepDurationMs antes de liberar tile reservado (ms). */
export const STEPPING_DEST_EXPIRY_BUFFER_MS = 80;

/** Fallback quando cliente não envia stepDurationMs na reserva. */
export const DEFAULT_STEPPING_DEST_DURATION_MS = 280;

export interface SteppingDestState {
    steppingDestTileX?: number;
    steppingDestTileY?: number;
    steppingDestExpiresAtMs?: number;
}

export function computeSteppingDestExpiresAtMs(
    stepDurationMs: number | undefined,
    nowMs: number = Date.now()
): number {
    const stepMs = stepDurationMs ?? DEFAULT_STEPPING_DEST_DURATION_MS;
    return nowMs + stepMs + STEPPING_DEST_EXPIRY_BUFFER_MS;
}

/** Remove reserva expirada (tile fantasma após passo não confirmado). */
export function expireStaleSteppingDest<T extends SteppingDestState>(
    state: T,
    nowMs: number = Date.now()
): T {
    if (
        state.steppingDestExpiresAtMs !== undefined &&
        nowMs > state.steppingDestExpiresAtMs
    ) {
        state.steppingDestTileX = undefined;
        state.steppingDestTileY = undefined;
        state.steppingDestExpiresAtMs = undefined;
    }
    return state;
}

export function clearSteppingDest<T extends SteppingDestState>(state: T): T {
    state.steppingDestTileX = undefined;
    state.steppingDestTileY = undefined;
    state.steppingDestExpiresAtMs = undefined;
    return state;
}
