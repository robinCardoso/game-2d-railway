const STORAGE_PREFIX = 'elarion.play.';

export type PlaySettingKey =
    | 'showPlayerNames'
    | 'showMonsterNames'
    | 'showHealthBars'
    | 'showFloatingDamage'
    | 'showCoordinates'
    | 'showPing';

const DEFAULTS: Record<PlaySettingKey, boolean> = {
    showPlayerNames: true,
    showMonsterNames: true,
    showHealthBars: true,
    showFloatingDamage: true,
    showCoordinates: false,
    showPing: true,
};

function storageKey(key: PlaySettingKey): string {
    return `${STORAGE_PREFIX}${key}`;
}

export function getPlaySetting(key: PlaySettingKey): boolean {
    try {
        const raw = localStorage.getItem(storageKey(key));
        if (raw === null) return DEFAULTS[key];
        return raw === 'true';
    } catch {
        return DEFAULTS[key];
    }
}

export function setPlaySetting(key: PlaySettingKey, value: boolean): void {
    try {
        localStorage.setItem(storageKey(key), value ? 'true' : 'false');
    } catch {
        /* ignore */
    }
    applyPlaySettings();
}

/** Preferências que afetam o render do canvas (lidas a cada frame no Play). */
export interface PlayRenderOptions {
    showPlayerNames: boolean;
    showMonsterNames: boolean;
    showHealthBars: boolean;
    showFloatingDamage: boolean;
}

export function getPlayRenderOptions(): PlayRenderOptions {
    return {
        showPlayerNames: getPlaySetting('showPlayerNames'),
        showMonsterNames: getPlaySetting('showMonsterNames'),
        showHealthBars: getPlaySetting('showHealthBars'),
        showFloatingDamage: getPlaySetting('showFloatingDamage'),
    };
}

function applyPlaySettings(): void {
    const coordsWrap = document.getElementById('playCoordsWrap');
    const mapStatus = document.getElementById('playMapStatus');
    if (coordsWrap) {
        coordsWrap.hidden = !getPlaySetting('showCoordinates');
    }
    if (mapStatus && !getPlaySetting('showCoordinates')) {
        /* map name still visible */
    }

    const pingEl = document.querySelector('.play-ping') as HTMLElement | null;
    if (pingEl) {
        pingEl.hidden = !getPlaySetting('showPing');
    }
}

export function initPlayHudSettings(): void {
    document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
        const key = input.dataset.setting as PlaySettingKey | undefined;
        if (!key || !(key in DEFAULTS)) return;
        input.checked = getPlaySetting(key);
        input.addEventListener('change', () => {
            setPlaySetting(key, input.checked);
        });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            const sectionId = tab.dataset.settingsTab;
            if (!sectionId) return;

            document.querySelectorAll('[data-settings-tab]').forEach((t) => {
                t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
            });
            document.querySelectorAll<HTMLElement>('[data-settings-section]').forEach((section) => {
                section.hidden = section.dataset.settingsSection !== sectionId;
            });
        });
    });

    applyPlaySettings();
}
