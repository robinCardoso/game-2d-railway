export type PlayPanelName = 'character' | 'inventory' | 'settings' | 'map' | 'spells';

type PanelOpenListener = (name: PlayPanelName) => void;

let closePanelsImpl: (() => void) | null = null;
let openPanelImpl: ((name: PlayPanelName) => void) | null = null;
const openListeners = new Set<PanelOpenListener>();

export function openPlayPanel(name: PlayPanelName): void {
    openPanelImpl?.(name);
}

export function closePlayPanels(): void {
    closePanelsImpl?.();
}

export function onPlayPanelOpen(listener: PanelOpenListener): () => void {
    openListeners.add(listener);
    return () => openListeners.delete(listener);
}

export function initPlayHudPanels(): void {
    const buttons = document.querySelectorAll<HTMLElement>('[data-panel]');
    const panels = document.querySelectorAll<HTMLElement>('[data-panel-name]');
    const backdrop = document.getElementById('playPanelBackdrop');

    const closePanels = (): void => {
        panels.forEach((panel) => {
            panel.hidden = true;
            panel.classList.remove('is-open');
        });
        buttons.forEach((button) => {
            button.classList.remove('is-active');
            button.setAttribute('aria-expanded', 'false');
        });
        const mobileToggle = document.getElementById('playStatsToggle');
        mobileToggle?.setAttribute('aria-expanded', 'false');
        if (backdrop) backdrop.hidden = true;
        document.body.classList.remove('play-panel-open');
    };

    const closeHudMenu = (): void => {
        const dropdown = document.getElementById('playHudMenuDropdown');
        const menuBtn = document.getElementById('playHudMenuBtn');
        if (!dropdown || dropdown.hidden) return;
        dropdown.hidden = true;
        menuBtn?.setAttribute('aria-expanded', 'false');
        menuBtn?.classList.remove('is-active');
    };

    const openPanel = (name: PlayPanelName): void => {
        closeHudMenu();
        closePanels();

        const panel = document.querySelector<HTMLElement>(`[data-panel-name="${name}"]`);
        const button = document.querySelector<HTMLElement>(`[data-panel="${name}"]`);
        if (!panel) return;

        panel.hidden = false;
        panel.classList.add('is-open');

        button?.classList.add('is-active');
        button?.setAttribute('aria-expanded', 'true');

        const mobileToggle = document.getElementById('playStatsToggle');
        if (name === 'character') {
            mobileToggle?.setAttribute('aria-expanded', 'true');
        }

        if (backdrop) backdrop.hidden = false;
        document.body.classList.add('play-panel-open');

        for (const listener of openListeners) {
            listener(name);
        }
    };

    closePanelsImpl = closePanels;
    openPanelImpl = openPanel;

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const name = button.dataset.panel as PlayPanelName | undefined;
            if (!name) return;

            const panel = document.querySelector<HTMLElement>(`[data-panel-name="${name}"]`);
            if (panel && !panel.hidden) {
                closePanels();
            } else {
                openPanel(name);
            }
        });
    });

    document.querySelectorAll('[data-close-panel]').forEach((button) => {
        button.addEventListener('click', closePanels);
    });

    backdrop?.addEventListener('click', closePanels);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closePanels();
    });
}
