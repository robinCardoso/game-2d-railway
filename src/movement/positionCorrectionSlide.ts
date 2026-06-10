import type { GridPlayerMotion } from './gridMovement.js';

export interface PositionCorrectionSlide {
    active: boolean;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startMs: number;
    durationMs: number;
}

export const DEFAULT_POSITION_CORRECTION_MS = 100;

export function createPositionCorrectionSlide(): PositionCorrectionSlide {
    return {
        active: false,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        startMs: 0,
        durationMs: DEFAULT_POSITION_CORRECTION_MS,
    };
}

/** Posição lógica (tile) imediata; visual desliza até o tile autoritativo. */
export function beginPositionCorrectionSlide(
    slide: PositionCorrectionSlide,
    player: GridPlayerMotion,
    tileSize: number,
    tileX: number,
    tileY: number,
    nowMs: number,
    durationMs = DEFAULT_POSITION_CORRECTION_MS
): void {
    player.tileX = tileX;
    player.tileY = tileY;

    const targetX = tileX * tileSize;
    const targetY = tileY * tileSize;

    if (Math.abs(player.worldX - targetX) < 0.5 && Math.abs(player.worldY - targetY) < 0.5) {
        player.worldX = targetX;
        player.worldY = targetY;
        slide.active = false;
        return;
    }

    slide.active = true;
    slide.fromX = player.worldX;
    slide.fromY = player.worldY;
    slide.toX = targetX;
    slide.toY = targetY;
    slide.startMs = nowMs;
    slide.durationMs = Math.max(16, durationMs);
}

/** @returns `true` enquanto o deslize de correção estiver ativo. */
export function tickPositionCorrectionSlide(
    slide: PositionCorrectionSlide,
    player: GridPlayerMotion,
    nowMs: number
): boolean {
    if (!slide.active) return false;

    const t = Math.min(1, (nowMs - slide.startMs) / slide.durationMs);
    player.worldX = slide.fromX + (slide.toX - slide.fromX) * t;
    player.worldY = slide.fromY + (slide.toY - slide.fromY) * t;

    if (t >= 1) {
        player.worldX = slide.toX;
        player.worldY = slide.toY;
        slide.active = false;
        return false;
    }
    return true;
}

export function cancelPositionCorrectionSlide(slide: PositionCorrectionSlide): void {
    slide.active = false;
}
