import type { PlayHudQuality } from './ui/playHudSettings';

export interface PlayCameraJuiceState {
    shakeRemainingMs: number;
    shakeIntensityPx: number;
}

const CAMERA_LERP_SPEED = 0.014;
const SHAKE_DECAY = 0.92;

export function createPlayCameraJuiceState(): PlayCameraJuiceState {
    return { shakeRemainingMs: 0, shakeIntensityPx: 0 };
}

export function triggerPlayScreenShake(
    state: PlayCameraJuiceState,
    intensityPx = 4,
    durationMs = 220
): void {
    state.shakeRemainingMs = Math.max(state.shakeRemainingMs, durationMs);
    state.shakeIntensityPx = Math.max(state.shakeIntensityPx, intensityPx);
}

export function tickPlayScreenShake(state: PlayCameraJuiceState, dtMs: number): { x: number; y: number } {
    if (state.shakeRemainingMs <= 0 || state.shakeIntensityPx <= 0) {
        state.shakeRemainingMs = 0;
        state.shakeIntensityPx = 0;
        return { x: 0, y: 0 };
    }

    state.shakeRemainingMs = Math.max(0, state.shakeRemainingMs - dtMs);
    const t = state.shakeRemainingMs / 220;
    const amp = state.shakeIntensityPx * t;
    const x = (Math.random() * 2 - 1) * amp;
    const y = (Math.random() * 2 - 1) * amp;

    if (state.shakeRemainingMs <= 0) {
        state.shakeIntensityPx *= SHAKE_DECAY;
        if (state.shakeIntensityPx < 0.25) state.shakeIntensityPx = 0;
    }

    return { x, y };
}

export function computePlayCameraTarget(
    worldX: number,
    worldY: number,
    canvas: HTMLCanvasElement,
    zoom: number,
    manualOffsetX = 0,
    manualOffsetY = 0
): { x: number; y: number } {
    const visibleW = canvas.width / zoom;
    const visibleH = canvas.height / zoom;
    return {
        x: worldX - visibleW / 2 + manualOffsetX,
        y: worldY - visibleH / 2 + manualOffsetY,
    };
}

/** Câmera elástica no modo `high`; snap nos demais. */
export function applyPlayCameraFollow(
    camera: { x: number; y: number },
    targetX: number,
    targetY: number,
    quality: PlayHudQuality,
    dtMs: number
): void {
    if (quality !== 'high' || dtMs <= 0) {
        camera.x = Math.floor(targetX);
        camera.y = Math.floor(targetY);
        return;
    }

    const t = 1 - Math.exp(-CAMERA_LERP_SPEED * dtMs);
    camera.x += (targetX - camera.x) * t;
    camera.y += (targetY - camera.y) * t;
    camera.x = Math.floor(camera.x);
    camera.y = Math.floor(camera.y);
}

export function snapPlayCamera(camera: { x: number; y: number }, targetX: number, targetY: number): void {
    camera.x = Math.floor(targetX);
    camera.y = Math.floor(targetY);
}
