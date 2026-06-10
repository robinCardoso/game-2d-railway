/**
 * Overlay de diagnóstico do Play — FPS, tráfego WS e updates de HUD.
 * Ativar: F9 ou localStorage `debug.play.perf` = '1'
 */

export type HudUpdateArea = 'resources' | 'spellBar' | 'chat' | 'minimap' | 'ping' | 'inventory';

const STORAGE_KEY = 'debug.play.perf';

export interface PlayPerfContext {
    pingMs: number;
    visiblePlayers: number;
    visibleCreatures: number;
    floatingDamages: number;
}

let enabled = false;
let overlayEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;

let frameCount = 0;
let frameTimeSum = 0;
let frameTimeMax = 0;
let displayedFps = 0;
let displayedAvgMs = 0;
let displayedMaxMs = 0;

const wsCounts = new Map<string, number>();
const hudCounts = new Map<HudUpdateArea, number>();
let lastBucketMs = performance.now();
let context: PlayPerfContext = {
    pingMs: -1,
    visiblePlayers: 0,
    visibleCreatures: 0,
    floatingDamages: 0,
};

export function isPlayPerfMonitorEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function setPlayPerfMonitorEnabled(on: boolean): void {
    try {
        if (on) {
            localStorage.setItem(STORAGE_KEY, '1');
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        /* ignore */
    }
    enabled = on;
    if (on) {
        ensureOverlay();
        flushSecondBucket(true);
    } else {
        removeOverlay();
    }
}

function ensureOverlay(): void {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'playPerfOverlay';
    overlayEl.className = 'play-perf-overlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    textEl = document.createElement('pre');
    textEl.className = 'play-perf-overlay__text';
    overlayEl.appendChild(textEl);
    document.body.appendChild(overlayEl);
}

function removeOverlay(): void {
    overlayEl?.remove();
    overlayEl = null;
    textEl = null;
}

function flushSecondBucket(forceRender = false): void {
    const now = performance.now();
    const elapsed = now - lastBucketMs;
    if (!forceRender && elapsed < 1000) return;

    if (frameCount > 0) {
        displayedFps = Math.round((frameCount * 1000) / Math.max(elapsed, 1));
        displayedAvgMs = frameTimeSum / frameCount;
        displayedMaxMs = frameTimeMax;
    }

    if (textEl) {
        textEl.textContent = formatOverlayText(elapsed);
    }

    frameCount = 0;
    frameTimeSum = 0;
    frameTimeMax = 0;
    wsCounts.clear();
    hudCounts.clear();
    lastBucketMs = now;
}

function formatOverlayText(elapsedMs: number): string {
    const lines: string[] = [
        'Play perf (F9)',
        `FPS ${displayedFps} · avg ${displayedAvgMs.toFixed(1)} ms · max ${displayedMaxMs.toFixed(1)} ms`,
        `ping ${context.pingMs >= 0 ? `${context.pingMs} ms` : '—'} · players ${context.visiblePlayers} · mobs ${context.visibleCreatures} · floats ${context.floatingDamages}`,
    ];

    const wsSorted = [...wsCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (wsSorted.length > 0) {
        lines.push('WS/s:');
        for (const [type, count] of wsSorted.slice(0, 12)) {
            const rate = ((count * 1000) / Math.max(elapsedMs, 1)).toFixed(1);
            lines.push(`  ${type}: ${rate}`);
        }
    } else {
        lines.push('WS/s: —');
    }

    const hudSorted = [...hudCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (hudSorted.length > 0) {
        lines.push('HUD updates/s:');
        for (const [area, count] of hudSorted) {
            const rate = ((count * 1000) / Math.max(elapsedMs, 1)).toFixed(1);
            lines.push(`  ${area}: ${rate}`);
        }
    } else {
        lines.push('HUD updates/s: —');
    }

    return lines.join('\n');
}

export function initPlayPerformanceMonitor(): void {
    enabled = isPlayPerfMonitorEnabled();
    if (enabled) ensureOverlay();

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'F9') return;
        event.preventDefault();
        setPlayPerfMonitorEnabled(!isPlayPerfMonitorEnabled());
    });
}

export function tickPlayPerformanceMonitorFrame(frameDurationMs: number): void {
    if (!enabled) return;
    frameCount += 1;
    frameTimeSum += frameDurationMs;
    frameTimeMax = Math.max(frameTimeMax, frameDurationMs);
    flushSecondBucket();
}

export function setPlayPerfMonitorContext(next: Partial<PlayPerfContext>): void {
    context = { ...context, ...next };
}

export function recordPlayWsMessage(type: string): void {
    if (!enabled) return;
    wsCounts.set(type, (wsCounts.get(type) ?? 0) + 1);
}

export function markHudUpdate(area: HudUpdateArea): void {
    if (!enabled) return;
    hudCounts.set(area, (hudCounts.get(area) ?? 0) + 1);
}
