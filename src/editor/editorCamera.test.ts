import { describe, expect, it } from 'vitest';
import {
    createEditorCamera,
    focusEditorCameraOnTile,
    syncEditorCameraToRenderCamera,
    tickEditorCameraPan,
} from './editorCamera';

describe('editorCamera', () => {
    it('focusOnTile centraliza view e zera offset', () => {
        const state = createEditorCamera({ viewTileX: 0, viewTileY: 0, viewZ: 0, offsetX: 40, offsetY: -20 });
        focusEditorCameraOnTile(state, 12, 34, 2, 256, -7, 7);
        expect(state.viewTileX).toBe(12);
        expect(state.viewTileY).toBe(34);
        expect(state.viewZ).toBe(2);
        expect(state.offsetX).toBe(0);
        expect(state.offsetY).toBe(0);
    });

    it('syncEditorCameraToRenderCamera calcula camera.x/y a partir do tile', () => {
        const state = createEditorCamera({ viewTileX: 10, viewTileY: 20, viewZ: 0 });
        const camera = { x: 0, y: 0, zoom: 1 };
        const canvas = { width: 640, height: 480 } as HTMLCanvasElement;
        syncEditorCameraToRenderCamera(state, camera, canvas, 32);
        expect(camera.x).toBe(10 * 32 - 640 / 2);
        expect(camera.y).toBe(20 * 32 - 480 / 2);
    });

    it('tickEditorCameraPan move offset com WASD', () => {
        const state = createEditorCamera();
        tickEditorCameraPan(state, { w: true, d: true }, 1000);
        expect(state.offsetY).toBeGreaterThan(0);
        expect(state.offsetX).toBeLessThan(0);
    });
});
