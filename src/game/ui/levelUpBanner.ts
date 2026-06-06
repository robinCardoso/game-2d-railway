const DEFAULT_DURATION_MS = 4000;
const FADE_MS = 450;

let hideTimerId: number | null = null;
let removeTimerId: number | null = null;

function clearTimers(): void {
    if (hideTimerId !== null) {
        window.clearTimeout(hideTimerId);
        hideTimerId = null;
    }
    if (removeTimerId !== null) {
        window.clearTimeout(removeTimerId);
        removeTimerId = null;
    }
}

/** Mensagem de parabéns no topo da área de jogo ao subir de level. */
export function showLevelUpBanner(level: number, durationMs = DEFAULT_DURATION_MS): void {
    const banner = document.getElementById('levelUpBanner');
    const textEl = document.getElementById('levelUpBannerText');
    if (!banner || !textEl) return;

    clearTimers();

    textEl.textContent = `Parabéns! Você alcançou o nível ${level}!`;
    banner.hidden = false;
    banner.classList.remove('is-visible');

    requestAnimationFrame(() => {
        banner.classList.add('is-visible');
    });

    hideTimerId = window.setTimeout(() => {
        banner.classList.remove('is-visible');
        removeTimerId = window.setTimeout(() => {
            banner.hidden = true;
            removeTimerId = null;
        }, FADE_MS);
        hideTimerId = null;
    }, durationMs);
}
