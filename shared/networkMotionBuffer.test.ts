import { describe, expect, it } from 'vitest';
import {
    createNetworkMotionBuffer,
    pushNetworkMotionSegment,
    sampleNetworkMotion,
    snapNetworkMotionBuffer,
} from './networkMotionBuffer';

describe('networkMotionBuffer', () => {
    it('interpola segmento com delay de render', () => {
        const buf = createNetworkMotionBuffer();
        pushNetworkMotionSegment(buf, 0, 0, 32, 0, 1000, 200);

        const mid = sampleNetworkMotion(buf, 1100, 0, 0);
        expect(mid.x).toBeGreaterThan(0);
        expect(mid.x).toBeLessThan(32);
        expect(mid.moving).toBe(true);

        const end = sampleNetworkMotion(buf, 1250, 0, 0);
        expect(end.x).toBe(32);
        expect(end.moving).toBe(false);
    });

    it('snap reseta buffer', () => {
        const buf = createNetworkMotionBuffer();
        pushNetworkMotionSegment(buf, 0, 0, 32, 32, 0, 100);
        snapNetworkMotionBuffer(buf, 64, 64, 500);
        expect(buf.keyframes).toHaveLength(1);
        expect(sampleNetworkMotion(buf, 500, 0, 0)).toMatchObject({ x: 64, y: 64 });
    });
});
