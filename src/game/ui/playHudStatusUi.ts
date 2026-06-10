import { markHudUpdate } from '../debug/playPerformanceMonitor';

export interface PlayHudStatusInput {
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    xpCurrent?: number;
    xpRequired?: number;
}

function fillPercent(current: number, max: number): number {
    if (max <= 0) return 0;
    return Math.max(0, Math.min(100, (current / max) * 100));
}

let lastStatus: PlayHudStatusInput | null = null;
let lastPingMs = Number.NaN;

export function resetPlayHudStatusCache(): void {
    lastStatus = null;
    lastPingMs = Number.NaN;
}

function statusUnchanged(a: PlayHudStatusInput, b: PlayHudStatusInput): boolean {
    return (
        a.health === b.health &&
        a.maxHealth === b.maxHealth &&
        a.mana === b.mana &&
        a.maxMana === b.maxMana &&
        a.xpCurrent === b.xpCurrent &&
        a.xpRequired === b.xpRequired
    );
}

export function updatePlayHudStatus(input: PlayHudStatusInput): void {
    if (lastStatus && statusUnchanged(lastStatus, input)) return;

    markHudUpdate('resources');
    lastStatus = { ...input };

    const hpFill = document.getElementById('playHudHpFill');
    const hpText = document.getElementById('playHudHpText');
    const mpFill = document.getElementById('playHudMpFill');
    const mpText = document.getElementById('playHudMpText');
    const xpFill = document.getElementById('playHudXpFill');
    const xpText = document.getElementById('playHudXpText');

    const hpPct = fillPercent(input.health, input.maxHealth);
    const mpPct = fillPercent(input.mana, input.maxMana);

    if (hpFill) hpFill.style.width = `${hpPct}%`;
    if (hpText) hpText.textContent = `${Math.floor(input.health)} / ${Math.floor(input.maxHealth)}`;
    if (mpFill) mpFill.style.width = `${mpPct}%`;
    if (mpText) mpText.textContent = `${Math.floor(input.mana)} / ${Math.floor(input.maxMana)}`;

    if (input.xpCurrent !== undefined && input.xpRequired !== undefined) {
        const xpPct = fillPercent(input.xpCurrent, input.xpRequired);
        if (xpFill) xpFill.style.width = `${xpPct}%`;
        if (xpText) {
            xpText.textContent = `${input.xpCurrent} / ${input.xpRequired} (${Math.round(xpPct)}%)`;
        }
    }
}

export function updatePlayHudPing(pingMs: number): void {
    if (pingMs === lastPingMs) return;

    markHudUpdate('ping');
    lastPingMs = pingMs;

    const el = document.getElementById('playPingText');
    if (!el) return;
    el.textContent = pingMs >= 0 ? `${pingMs} ms` : '—';
}
