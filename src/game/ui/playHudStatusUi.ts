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

export function updatePlayHudStatus(input: PlayHudStatusInput): void {
    const hpFill = document.getElementById('playHudHpFill');
    const hpText = document.getElementById('playHudHpText');
    const mpFill = document.getElementById('playHudMpFill');
    const mpText = document.getElementById('playHudMpText');
    const xpText = document.getElementById('playHudXpText');

    const hpPct = fillPercent(input.health, input.maxHealth);
    const mpPct = fillPercent(input.mana, input.maxMana);

    if (hpFill) hpFill.style.width = `${hpPct}%`;
    if (hpText) hpText.textContent = `${Math.floor(input.health)} / ${Math.floor(input.maxHealth)}`;
    if (mpFill) mpFill.style.width = `${mpPct}%`;
    if (mpText) mpText.textContent = `${Math.floor(input.mana)} / ${Math.floor(input.maxMana)}`;

    if (xpText && input.xpCurrent !== undefined && input.xpRequired !== undefined) {
        xpText.textContent = `${input.xpCurrent} / ${input.xpRequired} XP`;
    }
}

export function updatePlayHudPing(pingMs: number): void {
    const el = document.getElementById('playPingText');
    if (!el) return;
    el.textContent = pingMs >= 0 ? `${pingMs} ms` : '—';
}
