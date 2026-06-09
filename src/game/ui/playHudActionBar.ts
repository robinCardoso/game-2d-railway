import { closePlayPanels } from './playHudPanels';

const ACTION_BAR_EXPANDED_KEY = 'play.hud.actionBar.expanded';

function readActionBarExpanded(): boolean {
    try {
        const raw = localStorage.getItem(ACTION_BAR_EXPANDED_KEY);
        if (raw === '0') return false;
        if (raw === '1') return true;
    } catch {
        /* ignore */
    }
    return true;
}

function saveActionBarExpanded(expanded: boolean): void {
    try {
        localStorage.setItem(ACTION_BAR_EXPANDED_KEY, expanded ? '1' : '0');
    } catch {
        /* ignore */
    }
}

function setActionBarExpanded(wrap: HTMLElement, toggle: HTMLButtonElement, expanded: boolean): void {
    wrap.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Recolher menu' : 'Mostrar menu');
    if (!expanded) {
        closePlayHudMenu();
        closePlayPanels();
    }
}

function closeMenuDropdown(menuBtn: HTMLButtonElement, dropdown: HTMLElement): void {
    dropdown.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.classList.remove('is-active');
}

export function closePlayHudMenu(): void {
    const menuBtn = document.getElementById('playHudMenuBtn') as HTMLButtonElement | null;
    const dropdown = document.getElementById('playHudMenuDropdown') as HTMLElement | null;
    if (menuBtn && dropdown && !dropdown.hidden) {
        closeMenuDropdown(menuBtn, dropdown);
    }
}

export function initPlayHudActionBar(): void {
    const wrap = document.getElementById('playHudActionBarWrap');
    const toggle = document.getElementById('playHudActionBarToggle') as HTMLButtonElement | null;
    if (wrap && toggle) {
        setActionBarExpanded(wrap, toggle, readActionBarExpanded());
        toggle.addEventListener('click', () => {
            const next = !wrap.classList.contains('is-expanded');
            setActionBarExpanded(wrap, toggle, next);
            saveActionBarExpanded(next);
        });
    }

    const menuBtn = document.getElementById('playHudMenuBtn') as HTMLButtonElement | null;
    const dropdown = document.getElementById('playHudMenuDropdown') as HTMLElement | null;
    if (!menuBtn || !dropdown) return;

    menuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = dropdown.hidden;
        closePlayPanels();
        if (willOpen) {
            dropdown.hidden = false;
            menuBtn.setAttribute('aria-expanded', 'true');
            menuBtn.classList.add('is-active');
        } else {
            closeMenuDropdown(menuBtn, dropdown);
        }
    });

    document.addEventListener('click', (event) => {
        if (dropdown.hidden) return;
        const target = event.target as Node;
        if (!menuBtn.contains(target) && !dropdown.contains(target)) {
            closeMenuDropdown(menuBtn, dropdown);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !dropdown.hidden) {
            closeMenuDropdown(menuBtn, dropdown);
        }
    });

    dropdown.querySelectorAll('a, button').forEach((item) => {
        item.addEventListener('click', () => {
            closeMenuDropdown(menuBtn, dropdown);
        });
    });
}

/** Exibe badge numérico em um botão do HUD (ex.: inventário com itens novos). */
export function setPlayHudActionBadge(panel: string, count: number): void {
    const btn = document.querySelector<HTMLElement>(`[data-panel="${panel}"] .play-hud-action-btn__badge`);
    if (!btn) return;
    if (count > 0) {
        btn.textContent = count > 9 ? '9+' : String(count);
        btn.hidden = false;
    } else {
        btn.hidden = true;
    }
}
