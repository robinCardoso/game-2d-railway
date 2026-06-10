/** Atraso de render para suavizar bursts de rede (remotos / mobs). */
export const DEFAULT_NETWORK_RENDER_DELAY_MS = 100;

const MAX_KEYFRAMES = 32;

export interface MotionKeyframe {
    x: number;
    y: number;
    t: number;
}

export interface NetworkMotionBuffer {
    keyframes: MotionKeyframe[];
}

export function createNetworkMotionBuffer(): NetworkMotionBuffer {
    return { keyframes: [] };
}

export function clearNetworkMotionBuffer(buf: NetworkMotionBuffer): void {
    buf.keyframes.length = 0;
}

function trimKeyframes(buf: NetworkMotionBuffer): void {
    if (buf.keyframes.length > MAX_KEYFRAMES) {
        buf.keyframes.splice(0, buf.keyframes.length - MAX_KEYFRAMES);
    }
}

function pushKeyframe(buf: NetworkMotionBuffer, x: number, y: number, t: number): void {
    const kf = buf.keyframes;
    const last = kf[kf.length - 1];
    if (last && Math.abs(last.t - t) < 0.5) {
        last.x = x;
        last.y = y;
        last.t = t;
        return;
    }
    if (last && t < last.t) return;
    kf.push({ x, y, t });
    trimKeyframes(buf);
}

/** Segmento linear [startMs, startMs + durationMs] no buffer temporal. */
export function pushNetworkMotionSegment(
    buf: NetworkMotionBuffer,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    startMs: number,
    durationMs: number
): void {
    const dur = Math.max(16, durationMs);
    const endMs = startMs + dur;
    const last = buf.keyframes[buf.keyframes.length - 1];

    if (
        !last ||
        Math.abs(last.x - fromX) > 0.5 ||
        Math.abs(last.y - fromY) > 0.5 ||
        startMs - last.t > 80
    ) {
        pushKeyframe(buf, fromX, fromY, startMs);
    } else if (startMs > last.t) {
        last.t = startMs;
    }

    pushKeyframe(buf, toX, toY, endMs);
}

export function snapNetworkMotionBuffer(
    buf: NetworkMotionBuffer,
    x: number,
    y: number,
    t: number
): void {
    clearNetworkMotionBuffer(buf);
    pushKeyframe(buf, x, y, t);
}

/** Posição interpolada no tempo de render (nowMs − delay). */
export function sampleNetworkMotion(
    buf: NetworkMotionBuffer,
    renderTimeMs: number,
    fallbackX: number,
    fallbackY: number
): { x: number; y: number; moving: boolean } {
    const kf = buf.keyframes;
    if (kf.length === 0) {
        return { x: fallbackX, y: fallbackY, moving: false };
    }

    if (renderTimeMs <= kf[0]!.t) {
        const moving = kf.length > 1 && kf[1]!.t > renderTimeMs;
        return { x: kf[0]!.x, y: kf[0]!.y, moving };
    }

    const last = kf[kf.length - 1]!;
    if (renderTimeMs >= last.t) {
        return { x: last.x, y: last.y, moving: false };
    }

    for (let i = 0; i < kf.length - 1; i++) {
        const a = kf[i]!;
        const b = kf[i + 1]!;
        if (renderTimeMs < a.t || renderTimeMs > b.t) continue;

        const span = b.t - a.t;
        const u = span > 0 ? (renderTimeMs - a.t) / span : 1;
        return {
            x: a.x + (b.x - a.x) * u,
            y: a.y + (b.y - a.y) * u,
            moving: u < 0.999 && span > 16,
        };
    }

    return { x: last.x, y: last.y, moving: false };
}
