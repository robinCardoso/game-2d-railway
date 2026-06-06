export const FLOATING_DAMAGE_DURATION_MS = 1000;
export const FLOATING_DAMAGE_RISE_PX = 32;
export const FLOATING_DAMAGE_MAX_STACK = 5;

export interface FloatingDamageEntry {
    label: string;
    startMs: number;
    durationMs: number;
    /** Deslocamento vertical inicial para hits simultâneos. */
    stackIndex: number;
}

const DAMAGE_FONT_FAMILY =
    "bold 13px 'Segoe UI', Tahoma, 'Arial Rounded MT Bold', Verdana, sans-serif";

/** Rótulo compacto — sem separador de milhar para largura previsível no canvas. */
export function formatDamageLabel(damage: number): string {
    const amount = Math.max(0, Math.floor(damage));
    if (amount <= 0) return 'Miss';
    return `-${amount}`;
}

export function floatingDamageFont(label: string): string {
    const len = label.length;
    let size = 14;
    if (len >= 6) size = 10;
    else if (len >= 5) size = 11;
    else if (len >= 4) size = 12;
    return DAMAGE_FONT_FAMILY.replace('13px', `${size}px`);
}

export function pruneFloatingDamages(
    entries: FloatingDamageEntry[],
    nowMs: number
): FloatingDamageEntry[] {
    return entries.filter((entry) => nowMs - entry.startMs < entry.durationMs);
}

export function createFloatingDamageEntry(
    damage: number,
    nowMs: number,
    activeCount: number
): FloatingDamageEntry {
    return {
        label: formatDamageLabel(damage),
        startMs: nowMs,
        durationMs: FLOATING_DAMAGE_DURATION_MS,
        stackIndex: Math.min(FLOATING_DAMAGE_MAX_STACK - 1, activeCount),
    };
}

export function drawFloatingDamages(
    ctx: CanvasRenderingContext2D,
    entries: FloatingDamageEntry[],
    anchorX: number,
    anchorTopY: number,
    nowMs: number
): void {
    for (const entry of entries) {
        const elapsed = nowMs - entry.startMs;
        if (elapsed < 0 || elapsed >= entry.durationMs) continue;

        const progress = elapsed / entry.durationMs;
        const rise = progress * FLOATING_DAMAGE_RISE_PX;
        const stackOffset = entry.stackIndex * 11;
        const x = anchorX + (entry.stackIndex % 2 === 0 ? -6 : 6);
        const y = anchorTopY - 6 - stackOffset - rise;

        const fadeStart = 0.5;
        const alpha =
            progress < fadeStart ? 1 : Math.max(0, 1 - (progress - fadeStart) / (1 - fadeStart));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = floatingDamageFont(entry.label);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(entry.label, x, y);
        ctx.fillStyle = entry.label === 'Miss' ? '#cbd5e1' : '#fff7ed';
        ctx.fillText(entry.label, x, y);
        ctx.restore();
    }
}
