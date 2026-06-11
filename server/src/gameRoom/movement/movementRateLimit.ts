import { MIN_SERVER_STEP_DURATION_MS } from '../../../../shared/protocol.js';

/** Tolerância de jitter/latência no intervalo mínimo entre passos. */
export const MOVE_RATE_LIMIT_TOLERANCE = 0.8;

/** Tolerância extra de timing (doc Zezenia §7). */
export const MOVE_TIMING_TOLERANCE_MS = 35;

export interface MoveRateLimitInput {
    lastMoveAcceptedAtMs: number;
    lastObservedMoveIntervalMs: number;
    authoritativeStepMs: number;
    nowMs: number;
}

export interface MoveRateLimitResult {
    allowed: boolean;
    minIntervalMs: number;
    elapsedMs: number;
}

export function computeMinMoveIntervalMs(
    authoritativeStepMs: number,
    lastObservedMoveIntervalMs: number
): number {
    const claimedMin = Math.round(authoritativeStepMs * MOVE_RATE_LIMIT_TOLERANCE);
    const floorMin = Math.round(MIN_SERVER_STEP_DURATION_MS * MOVE_RATE_LIMIT_TOLERANCE);
    let minInterval = Math.max(1, claimedMin);
    if (lastObservedMoveIntervalMs > 0) {
        const observedMin = Math.round(
            lastObservedMoveIntervalMs * MOVE_RATE_LIMIT_TOLERANCE
        );
        minInterval = Math.min(claimedMin, Math.max(floorMin, observedMin));
    }
    return Math.max(1, minInterval);
}

export function checkMoveRateLimit(input: MoveRateLimitInput): MoveRateLimitResult {
    const minIntervalMs = computeMinMoveIntervalMs(
        input.authoritativeStepMs,
        input.lastObservedMoveIntervalMs
    );
    const effectiveMinMs = Math.max(1, minIntervalMs - MOVE_TIMING_TOLERANCE_MS);
    const elapsedMs =
        input.lastMoveAcceptedAtMs > 0
            ? input.nowMs - input.lastMoveAcceptedAtMs
            : effectiveMinMs;
    const allowed =
        input.lastMoveAcceptedAtMs <= 0 || elapsedMs >= effectiveMinMs;
    return { allowed, minIntervalMs: effectiveMinMs, elapsedMs };
}

export function nextMoveAllowedAtMs(
    lastMoveAcceptedAtMs: number,
    authoritativeStepMs: number,
    lastObservedMoveIntervalMs = 0
): number {
    if (lastMoveAcceptedAtMs <= 0) return 0;
    const minInterval = computeMinMoveIntervalMs(
        authoritativeStepMs,
        lastObservedMoveIntervalMs
    );
    return lastMoveAcceptedAtMs + minInterval;
}
