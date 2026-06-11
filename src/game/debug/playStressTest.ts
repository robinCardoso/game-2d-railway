import type { DepthDrawable } from '../../engine/depthSortDraw';

const STORAGE_KEY = 'debug.play.stress';
const STRESS_LEVELS = [0, 50, 200, 500] as const;

export type PlayStressLevel = (typeof STRESS_LEVELS)[number];

export function getPlayStressLevel(): PlayStressLevel {
    try {
        const raw = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
        if (STRESS_LEVELS.includes(raw as PlayStressLevel)) return raw as PlayStressLevel;
    } catch {
        /* ignore */
    }
    return 0;
}

export function cyclePlayStressLevel(): PlayStressLevel {
    const current = getPlayStressLevel();
    const idx = STRESS_LEVELS.indexOf(current);
    const next = STRESS_LEVELS[(idx + 1) % STRESS_LEVELS.length]!;
    try {
        localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
        /* ignore */
    }
    return next;
}

/** Drawables sintéticos para stress de Y-sort/draw (F10). */
export function appendPlayStressDepthDrawables(
    buffer: DepthDrawable[],
    count: number,
    z: number,
    playerZ: number,
    playerWorldX: number,
    playerWorldY: number,
    tileSize: number
): void {
    if (count <= 0 || z !== playerZ) return;

    for (let i = 0; i < count; i++) {
        const ring = Math.floor(i / 20);
        const angle = (i * 0.61) % (Math.PI * 2);
        const radius = tileSize * (1.5 + ring * 0.8);
        const wx = playerWorldX + tileSize / 2 + Math.cos(angle) * radius;
        const wy = playerWorldY + tileSize / 2 + Math.sin(angle) * radius;
        buffer.push({
            sortY: wy + tileSize,
            sortX: wx,
            draw: () => {
                /* stress — sem draw real; só custo de sort + loop */
            },
        });
    }
}
