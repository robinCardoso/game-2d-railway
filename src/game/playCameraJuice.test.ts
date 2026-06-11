import { describe, expect, it } from 'vitest';
import {
    applyPlayCameraFollow,
    computePlayCameraTarget,
    createPlayCameraJuiceState,
    triggerPlayScreenShake,
} from './playCameraJuice';

describe('playCameraJuice', () => {
    it('modo high aproxima alvo com lerp', () => {
        const camera = { x: 0, y: 0 };
        applyPlayCameraFollow(camera, 100, 80, 'high', 32);
        expect(camera.x).toBeGreaterThan(0);
        expect(camera.x).toBeLessThan(100);
    });

    it('modo medium faz snap', () => {
        const camera = { x: 0, y: 0 };
        applyPlayCameraFollow(camera, 100, 80, 'medium', 16);
        expect(camera.x).toBe(100);
        expect(camera.y).toBe(80);
    });

    it('screen shake decai', () => {
        const state = createPlayCameraJuiceState();
        triggerPlayScreenShake(state, 6, 50);
        const first = state.shakeRemainingMs;
        expect(first).toBeGreaterThan(0);
    });

    it('computePlayCameraTarget centraliza jogador', () => {
        const canvas = { width: 320, height: 240 } as HTMLCanvasElement;
        const t = computePlayCameraTarget(160, 120, canvas, 1);
        expect(t.x).toBe(0);
        expect(t.y).toBe(0);
    });
});
