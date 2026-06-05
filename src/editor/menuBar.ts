/**
 * Shell do editor: menu superior + painel flyout (um painel por vez).
 * Novas opções: adicionar entrada no menubar e seção em #flyoutPanel.
 */

export type FlyoutPanelId =
    | 'paint'
    | 'tileset'
    | 'floors'
    | 'stats'
    | 'mechanics'
    | 'dev'
    | 'account'
    | 'minimap'
    | 'character'
    | 'sprite_creator'
    | 'map_editor';

const PANEL_TITLES: Record<FlyoutPanelId, string> = {
    paint: 'Pintar',
    tileset: 'Tileset',
    floors: 'Andares (Z)',
    stats: 'Dados técnicos',
    mechanics: 'Mecânicas',
    dev: 'Teste (dev)',
    account: 'Conta',
    minimap: 'Minimap',
    character: 'Personagem',
    sprite_creator: 'Criar Sprites',
    map_editor: 'Editor de Mapa',
};

export interface EditorShellController {
    openPanel: (id: FlyoutPanelId, trigger?: HTMLElement) => void;
    closePanel: () => void;
    setEditorMenusVisible: (visible: boolean) => void;
    getActivePanel: () => FlyoutPanelId | null;
    setPanelOpenHook: (hook: ((id: FlyoutPanelId, trigger?: HTMLElement) => void) | null) => void;
}

function isFlyoutPanelId(value: string | undefined): value is FlyoutPanelId {
    return value !== undefined && value in PANEL_TITLES;
}

export function initEditorShell(): EditorShellController {
    const workspace = document.getElementById('workspace')!;
    const flyout = document.getElementById('flyoutPanel')!;
    const flyoutTitle = document.getElementById('flyoutTitle')!;
    const menubar = document.getElementById('mainMenubar')!;
    let currentPanel: FlyoutPanelId | null = null;
    let panelOpenHook: ((id: FlyoutPanelId, trigger?: HTMLElement) => void) | null = null;

    const sections = flyout.querySelectorAll<HTMLElement>('.flyout-section');
    const editOnlyNodes = document.querySelectorAll<HTMLElement>(
        '[data-requires-edit="true"]'
    );

    function openPanel(id: FlyoutPanelId, trigger?: HTMLElement): void {
        if (
            currentPanel === id &&
            workspace.classList.contains('panel-open')
        ) {
            closePanel();
            return;
        }

        currentPanel = id;
        workspace.classList.add('panel-open');
        flyout.setAttribute('aria-hidden', 'false');
        flyoutTitle.textContent = PANEL_TITLES[id];

        sections.forEach((section) => {
            section.classList.toggle(
                'is-active',
                section.dataset.panel === id
            );
        });

        menubar.querySelectorAll<HTMLElement>('[data-open-panel]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.openPanel === id);
        });

        panelOpenHook?.(id, trigger);
    }

    function closePanel(): void {
        workspace.classList.remove('panel-open');
        flyout.setAttribute('aria-hidden', 'true');
        currentPanel = null;
        menubar
            .querySelectorAll<HTMLElement>('[data-open-panel]')
            .forEach((btn) => btn.classList.remove('is-active'));
    }

    function closeAllSubmenus(): void {
        menubar.querySelectorAll<HTMLElement>('.menu-submenu').forEach((sub) => {
            sub.classList.remove('is-open');
            sub.querySelector<HTMLElement>('.menu-submenu-trigger')?.classList.remove('is-active');
        });
    }

    function closeAllDropdowns(): void {
        menubar.querySelectorAll<HTMLElement>('.menu-item').forEach((item) => {
            item.classList.remove('is-open');
        });
        closeAllSubmenus();
    }

    /** Um listener no menubar cobre pílulas e itens de dropdown (delegação). */
    menubar.addEventListener('click', (e) => {
        const target = e.target as Element;

        const panelBtn = target.closest<HTMLElement>('[data-open-panel]');
        if (panelBtn) {
            e.preventDefault();
            e.stopPropagation();
            const panelId = panelBtn.dataset.openPanel;
            if (isFlyoutPanelId(panelId)) {
                closeAllDropdowns();
                openPanel(panelId, panelBtn);
            }
            return;
        }

        const menuTrigger = target.closest<HTMLElement>('.menu-trigger');
        if (menuTrigger) {
            e.preventDefault();
            e.stopPropagation();
            const item = menuTrigger.closest<HTMLElement>('.menu-item');
            if (!item) return;
            const wasOpen = item.classList.contains('is-open');
            closeAllDropdowns();
            if (!wasOpen) item.classList.add('is-open');
            return;
        }

        const submenuTrigger = target.closest<HTMLElement>('.menu-submenu-trigger');
        if (submenuTrigger) {
            e.preventDefault();
            e.stopPropagation();
            const submenu = submenuTrigger.closest<HTMLElement>('.menu-submenu');
            if (!submenu) return;
            const wasOpen = submenu.classList.contains('is-open');
            closeAllSubmenus();
            if (!wasOpen) {
                submenu.classList.add('is-open');
                submenuTrigger.classList.add('is-active');
            }
            return;
        }

        // Se clicou em um item de dropdown comum que não abre painel (ex: exportar, teleportar), fecha os dropdowns
        const dropdownItem = target.closest<HTMLElement>('.menu-dropdown-item');
        if (dropdownItem) {
            closeAllDropdowns();
        }
    });

    document.getElementById('flyoutClose')?.addEventListener('click', closePanel);

    /** Fecha dropdowns ao clicar fora do menubar (não interfere nos itens com data-open-panel). */
    document.addEventListener('click', (e) => {
        const target = e.target as Element;
        if (target.closest('.menubar-scroll') || target.closest('.flyout-panel')) {
            return;
        }
        closeAllDropdowns();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (workspace.classList.contains('panel-open')) {
                closePanel();
            } else {
                closeAllDropdowns();
            }
        }
    });

    function setEditorMenusVisible(visible: boolean): void {
        editOnlyNodes.forEach((el) => {
            el.style.display = visible ? '' : 'none';
        });
        if (!visible) {
            closePanel();
        }
    }

    return {
        openPanel,
        closePanel,
        setEditorMenusVisible,
        getActivePanel: () => currentPanel,
        setPanelOpenHook: (hook) => { panelOpenHook = hook; },
    };
}
