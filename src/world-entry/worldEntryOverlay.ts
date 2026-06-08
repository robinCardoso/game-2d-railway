import './worldEntryOverlay.css';

export type WorldEntryStage =
    | 'version'
    | 'character'
    | 'map'
    | 'network'
    | 'sync'
    | 'ready';

const STAGE_LABELS: Record<WorldEntryStage, string> = {
    version: 'Validando versão',
    character: 'Carregando personagem',
    map: 'Carregando mapa',
    network: 'Conectando ao servidor',
    sync: 'Sincronizando mundo',
    ready: 'Preparando Elarion',
};

const WORLD_ENTRY_PENDING_KEY = 'worldEntryPending';
const WORLD_ENTRY_CHARACTER_KEY = 'worldEntryCharacterName';

const TIPS = [
    'Explore Rookgaard e treine suas habilidades antes de se aventurar em terras perigosas.',
    'No mundo aberto, suas decisões importam. Nas dungeons, sua estratégia evolui.',
    'Equipamentos evolutivos acompanham sua jornada e podem mudar seu estilo de jogo.',
    'Treinar skills aumenta sua força real em Elarion.',
];

let overlayEl: HTMLElement | null = null;
let tipIndex = 0;
let tipTimer: number | null = null;

function createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'worldEntryOverlay';
    overlay.className = 'world-entry-overlay';
    overlay.innerHTML = `
    <div class="world-entry-frame">
      <div class="world-entry-header">
        <img
          class="world-entry-logo"
          src="/assets/brand/elarion-logo.png"
          alt="Elarion Online"
        />
        <h1>Entrando no mundo</h1>
        <p>Prepare-se para sua aventura</p>
      </div>

      <div class="world-entry-card">
        <h2 id="worldEntryTitle">Carregando recursos</h2>

        <div class="world-entry-stages">
          <div class="world-entry-stage is-pending" data-world-stage="version">
            <span class="world-entry-stage__icon"></span>
            <span>Validando versão</span>
            <strong>...</strong>
          </div>

          <div class="world-entry-stage is-pending" data-world-stage="character">
            <span class="world-entry-stage__icon"></span>
            <span>Carregando personagem</span>
            <strong>...</strong>
          </div>

          <div class="world-entry-stage is-pending" data-world-stage="map">
            <span class="world-entry-stage__icon"></span>
            <span>Carregando mapa</span>
            <strong>...</strong>
          </div>

          <div class="world-entry-stage is-pending" data-world-stage="network">
            <span class="world-entry-stage__icon"></span>
            <span>Conectando ao servidor</span>
            <strong>...</strong>
          </div>

          <div class="world-entry-stage is-pending" data-world-stage="sync">
            <span class="world-entry-stage__icon"></span>
            <span>Sincronizando mundo</span>
            <strong>...</strong>
          </div>

          <div class="world-entry-stage is-pending" data-world-stage="ready">
            <span class="world-entry-stage__icon"></span>
            <span>Preparando Elarion</span>
            <strong>...</strong>
          </div>
        </div>

        <div class="world-entry-progress">
          <span id="worldEntryProgressBar"></span>
        </div>

        <p id="worldEntryMessage" class="world-entry-message">Preparando entrada...</p>
      </div>

      <div class="world-entry-spinner" aria-hidden="true"></div>

      <div class="world-entry-tip">
        <strong>Dica:</strong>
        <span id="worldEntryTip">${TIPS[0]}</span>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    return overlay;
}

function ensureOverlay(): HTMLElement {
    if (!overlayEl) {
        overlayEl = createOverlay();
    }

    return overlayEl;
}

function updateProgress(): void {
    const overlay = ensureOverlay();

    const stages = Array.from(overlay.querySelectorAll<HTMLElement>('.world-entry-stage'));
    const doneCount = stages.filter((stage) => stage.classList.contains('is-done')).length;
    const activeCount = stages.filter((stage) => stage.classList.contains('is-active')).length;
    const progress = Math.min(100, Math.round(((doneCount + activeCount * 0.5) / stages.length) * 100));

    const bar = overlay.querySelector<HTMLElement>('#worldEntryProgressBar');
    if (bar) bar.style.width = `${progress}%`;
}

export function isWorldEntryOverlayVisible(): boolean {
    return overlayEl?.classList.contains('is-visible') ?? false;
}

export function isWorldEntryPending(): boolean {
    try {
        return sessionStorage.getItem(WORLD_ENTRY_PENDING_KEY) === '1';
    } catch {
        return false;
    }
}

export function markWorldEntryPending(characterName?: string): void {
    try {
        sessionStorage.setItem(WORLD_ENTRY_PENDING_KEY, '1');
        if (characterName) {
            sessionStorage.setItem(WORLD_ENTRY_CHARACTER_KEY, characterName);
        }
    } catch {
        /* ignore */
    }
}

export function clearWorldEntryPending(): void {
    try {
        sessionStorage.removeItem(WORLD_ENTRY_PENDING_KEY);
        sessionStorage.removeItem(WORLD_ENTRY_CHARACTER_KEY);
    } catch {
        /* ignore */
    }
    document.documentElement.classList.remove('world-entry-pending');
}

export function resumeWorldEntryOverlayIfPending(): boolean {
    if (!isWorldEntryPending()) return false;

    document.documentElement.classList.add('world-entry-pending');
    document.getElementById('loadingScreen')?.style.setProperty('display', 'none');

    const name = sessionStorage.getItem(WORLD_ENTRY_CHARACTER_KEY);
    const message = name ? `Carregando ${name}...` : 'Carregando Elarion...';

    showWorldEntryOverlay(message, { immediate: true });
    setWorldEntryStage('version', 'done');
    setWorldEntryStage('character', 'done');
    setWorldEntryStage('map', 'active', 'Carregando mapa inicial...');
    return true;
}

export function showWorldEntryOverlay(
    message = 'Preparando entrada...',
    options?: { immediate?: boolean }
): void {
    const overlay = ensureOverlay();

    if (options?.immediate) {
        overlay.classList.add('is-resuming');
    } else {
        overlay.classList.remove('is-resuming');
    }

    overlay.classList.add('is-visible');

    const messageEl = overlay.querySelector<HTMLElement>('#worldEntryMessage');
    if (messageEl) messageEl.textContent = message;

    if (tipTimer === null) {
        tipTimer = window.setInterval(() => {
            tipIndex = (tipIndex + 1) % TIPS.length;
            const tipEl = overlay.querySelector<HTMLElement>('#worldEntryTip');
            if (tipEl) tipEl.textContent = TIPS[tipIndex];
        }, 4200);
    }
}

export function hideWorldEntryOverlay(): void {
    if (!overlayEl) return;

    overlayEl.classList.remove('is-visible', 'is-resuming');

    if (tipTimer !== null) {
        window.clearInterval(tipTimer);
        tipTimer = null;
    }

    window.setTimeout(() => {
        clearWorldEntryPending();
    }, 240);
}

export function setWorldEntryStage(
    stage: WorldEntryStage,
    state: 'pending' | 'active' | 'done' | 'error',
    message?: string
): void {
    const overlay = ensureOverlay();

    const stageEl = overlay.querySelector<HTMLElement>(`[data-world-stage="${stage}"]`);
    if (stageEl) {
        stageEl.classList.remove('is-pending', 'is-active', 'is-done', 'is-error');
        stageEl.classList.add(`is-${state}`);

        const statusEl = stageEl.querySelector('strong');
        if (statusEl) {
            statusEl.textContent =
                state === 'done' ? '✓' :
                state === 'active' ? '...' :
                state === 'error' ? 'Erro' :
                '...';
        }
    }

    const titleEl = overlay.querySelector<HTMLElement>('#worldEntryTitle');
    if (titleEl) titleEl.textContent = STAGE_LABELS[stage] ?? 'Carregando recursos';

    if (message) {
        const messageEl = overlay.querySelector<HTMLElement>('#worldEntryMessage');
        if (messageEl) messageEl.textContent = message;
    }

    updateProgress();
}

export function resetWorldEntryOverlay(): void {
    const overlay = ensureOverlay();

    overlay.querySelector('#worldEntryErrorActions')?.remove();

    overlay.querySelectorAll<HTMLElement>('.world-entry-stage').forEach((stage) => {
        stage.classList.remove('is-active', 'is-done', 'is-error');
        stage.classList.add('is-pending');

        const statusEl = stage.querySelector('strong');
        if (statusEl) statusEl.textContent = '...';
    });

    const bar = overlay.querySelector<HTMLElement>('#worldEntryProgressBar');
    if (bar) bar.style.width = '0%';

    const messageEl = overlay.querySelector<HTMLElement>('#worldEntryMessage');
    if (messageEl) messageEl.textContent = 'Preparando entrada...';
}

export function setWorldEntryError(message: string): void {
    const overlay = ensureOverlay();

    const messageEl = overlay.querySelector<HTMLElement>('#worldEntryMessage');
    if (messageEl) messageEl.textContent = message;

    const card = overlay.querySelector<HTMLElement>('.world-entry-card');
    if (card && !overlay.querySelector('#worldEntryErrorActions')) {
        const actions = document.createElement('div');
        actions.id = 'worldEntryErrorActions';
        actions.className = 'world-entry-error-actions';
        actions.innerHTML = `
      <a class="world-entry-error-btn" href="characters.html">Voltar para personagens</a>
      <button class="world-entry-error-btn" type="button">Tentar novamente</button>
    `;
        actions.querySelector('button')?.addEventListener('click', () => location.reload());
        card.appendChild(actions);
    }
}

export function finishWorldEntryOverlay(): void {
    setWorldEntryStage('ready', 'active', 'Preparando Elarion...');
    setWorldEntryStage('ready', 'done');
    window.setTimeout(() => hideWorldEntryOverlay(), 350);
}
