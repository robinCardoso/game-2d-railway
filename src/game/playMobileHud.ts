const MOBILE_PLAY_MQ = '(max-width: 768px)';

export function initPlayMobileHud(): void {
    const layout = document.querySelector('.play-layout');
    const toggle = document.getElementById('playStatsToggle');
    const closeBtn = document.getElementById('playStatsClose');
    const backdrop = document.getElementById('playStatsBackdrop');
    if (!layout || !toggle) return;

    const mq = window.matchMedia(MOBILE_PLAY_MQ);

    const setOpen = (open: boolean): void => {
        layout.classList.toggle('is-stats-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const syncForViewport = (): void => {
        if (!mq.matches) setOpen(false);
    };

    toggle.addEventListener('click', () => {
        if (!mq.matches) return;
        setOpen(!layout.classList.contains('is-stats-open'));
    });

    closeBtn?.addEventListener('click', () => setOpen(false));
    backdrop?.addEventListener('click', () => setOpen(false));

    mq.addEventListener('change', syncForViewport);
    window.addEventListener('resize', syncForViewport);
}
