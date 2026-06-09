/** Passos de zoom do Play (canvas + HUD). */
export const PLAY_ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;

export const PLAY_ZOOM_SESSION_KEY = 'game2d_camera_zoom';

export const PLAY_DEFAULT_ZOOM = 1;

export function snapPlayZoom(value: number): number {
    return PLAY_ZOOM_STEPS.reduce((best, step) =>
        Math.abs(step - value) < Math.abs(best - value) ? step : best
    );
}

export const PLAY_DEFAULT_ZOOM_CHANGED_EVENT = 'elarion-play-default-zoom';
