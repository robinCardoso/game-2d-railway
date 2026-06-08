import './roster.css';
import { requireAuth, signOut, getProfile } from '../shared/authGuard';
import { enforceDesktopVersionGate, initDesktopClientShell } from '../ui/initDesktopClient';
import {
    listCharacters,
    softDeleteCharacter,
    markCharacterPlayed,
} from '../shared/characterStore';
import type { CharacterRow } from '../shared/types';
import { track } from '../shared/analytics';
import { resolveAnimationSourceRect } from '../character/sheetFrameLayout';
import { resolveApiUrl } from '../shared/apiUrl';
import {
    hideWorldEntryOverlay,
    markWorldEntryPending,
    resetWorldEntryOverlay,
    setWorldEntryStage,
    showWorldEntryOverlay,
} from '../world-entry/worldEntryOverlay';

initDesktopClientShell();

const session = await requireAuth();

const errEl = document.getElementById('rosterError') as HTMLElement;
const grid = document.getElementById('charGrid') as HTMLElement;
const empty = document.getElementById('emptyState') as HTMLElement;
const createBtn = document.getElementById('rosterCreateBtn') as HTMLAnchorElement | null;
const enterBtn = document.getElementById('enterWorldBtn') as HTMLButtonElement;
const deleteBtn = document.getElementById('deleteCharBtn') as HTMLButtonElement;
const emailEl = document.getElementById('accountEmail') as HTMLElement;
const studioLink = document.getElementById('studioLink') as HTMLAnchorElement;

const loadingEl = document.getElementById('rosterLoading') as HTMLElement | null;
const selectedDetailsEl = document.getElementById('selectedDetails') as HTMLElement | null;
const noSelectionStateEl = document.getElementById('noSelectionState') as HTMLElement | null;

const selectedNameEl = document.getElementById('selectedName') as HTMLElement | null;
const selectedVocationEl = document.getElementById('selectedVocation') as HTMLElement | null;
const selectedLevelEl = document.getElementById('selectedLevel') as HTMLElement | null;
const selectedGenderEl = document.getElementById('selectedGender') as HTMLElement | null;
const selectedMapEl = document.getElementById('selectedMap') as HTMLElement | null;
const selectedLastPlayedEl = document.getElementById('selectedLastPlayed') as HTMLElement | null;
const selectedPreviewCanvas = document.getElementById('selectedPreviewCanvas') as HTMLCanvasElement | null;

emailEl.textContent = session.email;

const profile = await getProfile();
if (!profile?.canAccessStudio) {
    studioLink.style.display = 'none';
}

let characters: CharacterRow[] = [];
let selectedId: string | null = null;

function getCharacterSpriteUrl(c: CharacterRow): string {
    return (
        c.outfitConfig?.spriteSheetUrl ||
        c.appearance?.spriteSheetUrl ||
        `tiles/characters/vocations/${c.gender || 'male'}/${c.vocation || 'knight'}.png`
    );
}

function formatVocation(c: CharacterRow): string {
    const value = c.vocation || 'knight';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatGender(c: CharacterRow): string {
    const value = c.gender || c.appearance?.gender;

    if (value === 'female') return 'Feminino';
    if (value === 'male') return 'Masculino';

    return '-';
}

function formatLastPlayed(value: string | null): string {
    if (!value) return 'Nunca jogou';

    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatMap(c: CharacterRow): string {
    return c.mapId || c.spawnMapId || 'Elarion';
}

function getSelectedCharacter(): CharacterRow | null {
    if (!selectedId) return null;
    return characters.find((c) => c.id === selectedId) ?? null;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadRoster(): Promise<void> {
    try {
        errEl.hidden = true;
        if (loadingEl) loadingEl.hidden = false;

        characters = await listCharacters(session.userId);

        if (!selectedId && characters.length > 0) {
            selectedId = characters[0].id;
            enterBtn.disabled = false;
            deleteBtn.disabled = false;
        }

        renderGrid();
        renderSelectedCharacter();
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao carregar personagens.';
        errEl.hidden = false;
    } finally {
        if (loadingEl) loadingEl.hidden = true;
    }
}

function renderGrid(): void {
    grid.innerHTML = '';

    const hasCharacters = characters.length > 0;
    empty.hidden = hasCharacters;
    if (createBtn) createBtn.hidden = !hasCharacters;

    if (!hasCharacters) {
        enterBtn.disabled = true;
        deleteBtn.disabled = true;
        renderSelectedCharacter();
        return;
    }

    for (const c of characters) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'roster-char-card' + (c.id === selectedId ? ' is-selected' : '');
        button.dataset.id = c.id;

        const vocation = formatVocation(c);
        const level = c.level ?? 1;
        const lastPlayed = c.lastPlayedAt
            ? `Último acesso: ${new Date(c.lastPlayedAt).toLocaleDateString('pt-BR')}`
            : 'Nunca jogou';

        button.innerHTML = `
      <span class="roster-char-card__canvas-wrap">
        <canvas class="char-card-canvas" width="64" height="64"></canvas>
      </span>

      <span>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(vocation)} · Level ${level}</p>
        <small>${escapeHtml(lastPlayed)}</small>
      </span>
    `;

        button.addEventListener('click', () => {
            selectedId = c.id;
            enterBtn.disabled = false;
            deleteBtn.disabled = false;
            renderGrid();
            renderSelectedCharacter();
        });

        grid.appendChild(button);

        const canvas = button.querySelector('.char-card-canvas') as HTMLCanvasElement | null;

        if (canvas) {
            void drawCharacterPreview(canvas, getCharacterSpriteUrl(c));
        }
    }
}

function renderSelectedCharacter(): void {
    const selected = getSelectedCharacter();

    const hasSelected = Boolean(selected);

    if (selectedDetailsEl) selectedDetailsEl.hidden = !hasSelected;
    if (noSelectionStateEl) noSelectionStateEl.hidden = hasSelected;

    if (!selected) {
        enterBtn.disabled = true;
        deleteBtn.disabled = true;
        return;
    }

    if (selectedNameEl) selectedNameEl.textContent = selected.name;
    if (selectedVocationEl) selectedVocationEl.textContent = formatVocation(selected);
    if (selectedLevelEl) selectedLevelEl.textContent = String(selected.level ?? 1);
    if (selectedGenderEl) selectedGenderEl.textContent = formatGender(selected);
    if (selectedMapEl) selectedMapEl.textContent = formatMap(selected);
    if (selectedLastPlayedEl) selectedLastPlayedEl.textContent = formatLastPlayed(selected.lastPlayedAt);

    if (selectedPreviewCanvas) {
        void drawCharacterPreview(selectedPreviewCanvas, getCharacterSpriteUrl(selected));
    }
}

interface CharacterConfig {
    frameWidth: number;
    frameHeight: number;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
    sheetLayout?: 'horizontal' | 'vertical';
    chromaKey?: boolean;
    chromaKeyTolerance?: number;
    animations: Record<string, { row: number; startFrame?: number; frames: number }>;
}

async function drawCharacterPreview(canvas: HTMLCanvasElement, spriteSheetUrl: string): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cleanPath = spriteSheetUrl.replace(/^\//, '');
    const jsonUrl = resolveApiUrl('/' + cleanPath.replace(/\.png$/i, '.json'));
    let config: CharacterConfig | null = null;
    try {
        const res = await fetch(jsonUrl);
        if (res.ok) {
            config = await res.json() as CharacterConfig;
        }
    } catch (e) {
        console.error('Erro ao buscar config do personagem no roster:', e);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
    });
    img.src = resolveApiUrl('/' + cleanPath);
    if (!(await loaded)) return;

    const frameWidth = config?.frameWidth ?? 32;
    const frameHeight = config?.frameHeight ?? 32;
    const offsetX = config?.offsetX ?? 0;
    const offsetY = config?.offsetY ?? 0;
    const gapX = config?.gapX ?? 0;
    const gapY = config?.gapY ?? 0;
    const useChromaKey = config?.chromaKey ?? false;
    const tolerance = config?.chromaKeyTolerance ?? 50;
    const sheetLayout = config?.sheetLayout ?? 'horizontal';

    const rawAnim = (config?.animations?.['idle_down'] || config?.animations?.['walk_down']) as
        | { row: number; startFrame?: number; frames?: number; speedFps?: number; loop?: boolean }
        | undefined;
    const anim = {
        row: rawAnim?.row ?? 0,
        startFrame: rawAnim?.startFrame ?? 0,
        frames: rawAnim?.frames ?? 1,
        speedFps: rawAnim?.speedFps ?? 5,
        loop: rawAnim?.loop ?? true,
    };

    const { sx, sy } = resolveAnimationSourceRect(
        {
            name: '',
            spriteSheetUrl: '',
            frameWidth,
            frameHeight,
            defaultDirection: 'down',
            animations: {},
            offsetX,
            offsetY,
            gapX,
            gapY,
            sheetLayout,
        },
        anim,
        0,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.floor(Math.min(canvas.width / frameWidth, canvas.height / frameHeight));
    const drawW = frameWidth * scale;
    const drawH = frameHeight * scale;
    const drawX = Math.floor((canvas.width - drawW) / 2);
    const drawY = Math.floor((canvas.height - drawH) / 2);

    if (useChromaKey) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameWidth;
        tempCanvas.height = frameHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.drawImage(img, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            const imgData = tempCtx.getImageData(0, 0, frameWidth, frameHeight);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                if (r >= 255 - tolerance && g <= tolerance && b >= 255 - tolerance) {
                    d[i + 3] = 0;
                }
            }
            tempCtx.putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
        }
    } else {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
    }
}

enterBtn.addEventListener('click', async () => {
    if (!selectedId) return;

    const selected = getSelectedCharacter();
    const originalText = enterBtn.textContent ?? 'Entrar no mundo';

    try {
        enterBtn.disabled = true;
        enterBtn.textContent = 'Entrando...';

        resetWorldEntryOverlay();
        showWorldEntryOverlay(
            selected
                ? `Preparando ${selected.name} para entrar em Elarion...`
                : 'Preparando entrada...'
        );

        setWorldEntryStage('version', 'active', 'Validando versão do cliente...');

        const versionOk = await enforceDesktopVersionGate();
        if (!versionOk) {
            setWorldEntryStage('version', 'error', 'Atualização necessária.');
            hideWorldEntryOverlay();
            enterBtn.disabled = false;
            enterBtn.textContent = originalText;
            return;
        }

        setWorldEntryStage('version', 'done');

        setWorldEntryStage('character', 'active', 'Salvando último personagem jogado...');
        await markCharacterPlayed(selectedId, session.userId);
        sessionStorage.setItem('activeCharacterId', selectedId);
        setWorldEntryStage('character', 'done');

        setWorldEntryStage('map', 'active', 'Abrindo passagem para o mundo...');
        track('first_world_enter', { characterId: selectedId });

        markWorldEntryPending(selected?.name);
        const characterId = selectedId;
        location.href = `play.html?characterId=${encodeURIComponent(characterId)}`;
    } catch (err) {
        setWorldEntryStage('character', 'error');
        hideWorldEntryOverlay();

        errEl.textContent = err instanceof Error ? err.message : 'Erro ao entrar.';
        errEl.hidden = false;
        enterBtn.disabled = false;
        enterBtn.textContent = originalText;
    }
});

deleteBtn.addEventListener('click', async () => {
    const selected = getSelectedCharacter();

    if (!selected) return;

    const confirmed = confirm(
        `Excluir o personagem "${selected.name}"? Esta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    try {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Excluindo...';

        await softDeleteCharacter(selected.id, session.userId);

        selectedId = null;
        await loadRoster();
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao excluir.';
        errEl.hidden = false;
    } finally {
        deleteBtn.disabled = !selectedId;
        deleteBtn.textContent = 'Excluir';
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut();
    location.href = 'login.html';
});

void loadRoster();
