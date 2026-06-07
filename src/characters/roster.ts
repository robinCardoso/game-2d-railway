import '../shared/shell.css';
import { requireAuth, signOut, getProfile } from '../shared/authGuard';
import {
    listCharacters,
    softDeleteCharacter,
    markCharacterPlayed,
} from '../shared/characterStore';
import type { CharacterRow } from '../shared/types';
import { track } from '../shared/analytics';
import { resolveAnimationSourceRect } from '../character/sheetFrameLayout';
import { resolveApiUrl } from '../shared/apiUrl';

const session = await requireAuth();
const errEl = document.getElementById('rosterError') as HTMLElement;
const grid = document.getElementById('charGrid') as HTMLElement;
const empty = document.getElementById('emptyState') as HTMLElement;
const enterBtn = document.getElementById('enterWorldBtn') as HTMLButtonElement;
const deleteBtn = document.getElementById('deleteCharBtn') as HTMLButtonElement;
const emailEl = document.getElementById('accountEmail') as HTMLElement;
const studioLink = document.getElementById('studioLink') as HTMLAnchorElement;

emailEl.textContent = session.email;

const profile = await getProfile();
if (!profile?.canAccessStudio) {
    studioLink.style.display = 'none';
}

let characters: CharacterRow[] = [];
let selectedId: string | null = null;

async function loadRoster(): Promise<void> {
    try {
        characters = await listCharacters(session.userId);
        renderGrid();
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao carregar personagens.';
        errEl.hidden = false;
    }
}

function renderGrid(): void {
    grid.innerHTML = '';
    empty.hidden = characters.length > 0;
    for (const c of characters) {
        const card = document.createElement('div');
        card.className = 'char-card' + (c.id === selectedId ? ' selected' : '');
        card.dataset.id = c.id;
        card.innerHTML = `
          <canvas class="char-card-canvas" width="64" height="64" style="image-rendering: pixelated; display: block; margin: 0 auto 12px; background: #1e293b; border-radius: 6px;"></canvas>
          <h3>${escapeHtml(c.name)}</h3>
          <p>${c.lastPlayedAt ? 'Último login: ' + new Date(c.lastPlayedAt).toLocaleDateString('pt-BR') : 'Nunca jogou'}</p>
        `;
        card.addEventListener('click', () => {
            selectedId = c.id;
            renderGrid();
            enterBtn.disabled = false;
            deleteBtn.disabled = false;
        });
        grid.appendChild(card);

        // Desenha o preview no canvas
        const canvas = card.querySelector('.char-card-canvas') as HTMLCanvasElement;
        if (canvas) {
            void drawCharacterPreview(canvas, c.outfitConfig?.spriteSheetUrl || `tiles/characters/vocations/${c.gender || 'male'}/${c.vocation || 'knight'}.png`);
        }
    }
    if (!selectedId && characters.length === 1) {
        selectedId = characters[0].id;
        renderGrid();
        enterBtn.disabled = false;
        deleteBtn.disabled = false;
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

    // 1. Carrega a config JSON
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

    // 2. Carrega a imagem
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

    // Procura animação de idle_down ou walk_down
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

    // Limpa canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Escala para desenhar centralizado
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
                    d[i + 3] = 0; // transparente
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

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

enterBtn.addEventListener('click', async () => {
    if (!selectedId) return;
    try {
        await markCharacterPlayed(selectedId, session.userId);
        sessionStorage.setItem('activeCharacterId', selectedId);
        track('first_world_enter', { characterId: selectedId });
        location.href = `play.html?characterId=${encodeURIComponent(selectedId)}`;
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao entrar.';
        errEl.hidden = false;
    }
});

deleteBtn.addEventListener('click', async () => {
    console.log('[roster.ts] Excluir clicked. selectedId:', selectedId, 'session.userId:', session?.userId);
    if (!selectedId) return;
    console.log('[roster.ts] Showing confirm dialog...');
    const confirmed = confirm('Excluir este personagem? Esta ação não pode ser desfeita.');
    console.log('[roster.ts] Confirm dialog result:', confirmed);
    if (!confirmed) return;
    try {
        console.log('[roster.ts] Calling softDeleteCharacter...');
        await softDeleteCharacter(selectedId, session.userId);
        console.log('[roster.ts] softDeleteCharacter completed. Reloading roster...');
        selectedId = null;
        enterBtn.disabled = true;
        deleteBtn.disabled = true;
        await loadRoster();
        console.log('[roster.ts] Roster reloaded.');
    } catch (err) {
        console.error('[roster.ts] Error deleting character:', err);
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao excluir.';
        errEl.hidden = false;
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut();
    location.href = 'login.html';
});

void loadRoster();
