import { MOBILE_PLAY_MQ } from './playHudConstants';
import { closePlayPanels, openPlayPanel } from './ui/playHudPanels';

export function initPlayMobileHud(): void {
    const toggle = document.getElementById('playStatsToggle');
    if (!toggle) return;

    const mq = window.matchMedia(MOBILE_PLAY_MQ);

    toggle.addEventListener('click', () => {
        if (!mq.matches) return;
        const panel = document.getElementById('characterPanel');
        if (panel && !panel.hidden) {
            closePlayPanels();
        } else {
            openPlayPanel('character');
        }
    });

    const syncForViewport = (): void => {
        if (!mq.matches) closePlayPanels();
    };

    mq.addEventListener('change', syncForViewport);
    window.addEventListener('resize', syncForViewport);
}
