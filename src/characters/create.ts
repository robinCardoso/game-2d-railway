import '../shared/shell.css';
import { requireAuth } from '../shared/authGuard';
import { createCharacter, validateCharacterName } from '../shared/characterStore';
import { track } from '../shared/analytics';
import type { Gender, VocationId } from '../../shared/types/character';
import { loadOutfitPresets, filterOutfitsByVocationAndGender, findOutfitPreset, type OutfitPreset } from '../game-data/default/loadOutfitPresets';
import { resolveAnimationSourceRect } from '../character/sheetFrameLayout';
import {
    fillVocationSelect,
    VOCATIONS_UPDATED_EVENT,
    type VocationsMap,
} from '../game-data/vocationUi';
import { getRuntimeVocations, loadRuntimeVocations } from '../game-data/vocationRegistry';

const session = await requireAuth();
const errEl = document.getElementById('createError') as HTMLElement;
const stepLabel = document.getElementById('wizardStep') as HTMLElement;
const presetSelect = document.getElementById('preset') as HTMLSelectElement;
const genderSelect = document.getElementById('gender') as HTMLSelectElement;
const outfitSelect = document.getElementById('outfit') as HTMLSelectElement;
const previewCanvas = document.getElementById('presetPreviewCanvas') as HTMLCanvasElement;
const previewCtx = previewCanvas?.getContext('2d');

let outfitPresets: OutfitPreset[] = [];

// ---- Preview animado ----
interface AnimationEntry {
    row: number;
    startFrame?: number;
    frames: number;
    speedFps: number;
    loop: boolean;
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
    animations: Record<string, AnimationEntry>;
}

let previewAnimId = 0; // controle de cancelamento

/**
 * Remove o magenta (chroma key) de um ImageData, tornando-o transparente.
 */
function applyChromaKey(imageData: ImageData, tolerance: number): void {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        // Magenta puro: R=255, G=0, B=255
        if (r >= 255 - tolerance && g <= tolerance && b >= 255 - tolerance) {
            d[i + 3] = 0; // transparente
        }
    }
}

/**
 * Carrega o JSON de configuração do personagem a partir do spriteSheetUrl.
 * Converte tiles/characters/vocations/male/knight.png → tiles/characters/vocations/male/knight.json
 */
async function loadCharacterConfig(spriteSheetUrl: string): Promise<CharacterConfig | null> {
    const jsonUrl = spriteSheetUrl.replace(/\.png$/i, '.json');
    try {
        const response = await fetch(jsonUrl);
        if (!response.ok) return null;
        return await response.json() as CharacterConfig;
    } catch {
        return null;
    }
}

/**
 * Inicia a animação de preview no canvas para o outfit selecionado.
 */
async function startAnimatedPreview(outfit: OutfitPreset): Promise<void> {
    // Incrementa o ID para cancelar animações anteriores
    const thisAnimId = ++previewAnimId;

    if (!previewCtx || !previewCanvas) return;

    // Limpa canvas enquanto carrega
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Carrega a config JSON do personagem
    const config = await loadCharacterConfig(outfit.spriteSheetUrl);
    if (thisAnimId !== previewAnimId) return; // cancelado

    // Carrega a imagem do spritesheet
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const imageLoaded = new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
    });

    img.src = outfit.spriteSheetUrl;
    const loaded = await imageLoaded;
    if (!loaded || thisAnimId !== previewAnimId) return;

    // Usa config real ou fallback conservador
    const frameWidth = config?.frameWidth ?? 32;
    const frameHeight = config?.frameHeight ?? 32;
    const offsetX = config?.offsetX ?? 0;
    const offsetY = config?.offsetY ?? 0;
    const gapX = config?.gapX ?? 0;
    const gapY = config?.gapY ?? 0;
    const useChromaKey = config?.chromaKey ?? false;
    const chromaKeyTolerance = config?.chromaKeyTolerance ?? 50;
    const sheetLayout = config?.sheetLayout ?? 'horizontal';

    // Pega animação walk_down (preferencial) ou idle_down como fallback
    const anim: AnimationEntry = config?.animations?.['walk_down']
        ?? config?.animations?.['idle_down']
        ?? { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true };

    const totalFrames = Math.max(1, anim.frames);
    const fps = Math.max(1, anim.speedFps);
    const msPerFrame = 1000 / fps;

    // Escala para caber no canvas (128x128)
    const scale = Math.floor(Math.min(previewCanvas.width / frameWidth, previewCanvas.height / frameHeight));
    const drawW = frameWidth * scale;
    const drawH = frameHeight * scale;
    const drawX = Math.floor((previewCanvas.width - drawW) / 2);
    const drawY = Math.floor((previewCanvas.height - drawH) / 2);

    let currentFrame = 0;
    let lastFrameTime = 0;

    // Canvas temporário para chroma key
    let tempCanvas: HTMLCanvasElement | null = null;
    let tempCtx: CanvasRenderingContext2D | null = null;
    if (useChromaKey) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameWidth;
        tempCanvas.height = frameHeight;
        tempCtx = tempCanvas.getContext('2d');
    }

    function drawFrame(timestamp: number): void {
        if (thisAnimId !== previewAnimId) return; // cancelado
        if (!previewCtx) return;

        if (timestamp - lastFrameTime >= msPerFrame) {
            lastFrameTime = timestamp;

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
                currentFrame,
                img.naturalWidth || img.width,
                img.naturalHeight || img.height
            );

            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

            if (useChromaKey && tempCtx && tempCanvas) {
                // Desenha no canvas temporário, aplica chroma key, depois copia
                tempCtx.clearRect(0, 0, frameWidth, frameHeight);
                tempCtx.drawImage(img, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
                const imageData = tempCtx.getImageData(0, 0, frameWidth, frameHeight);
                applyChromaKey(imageData, chromaKeyTolerance);
                tempCtx.putImageData(imageData, 0, 0);
                previewCtx.imageSmoothingEnabled = false;
                previewCtx.drawImage(tempCanvas, 0, 0, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
            } else {
                previewCtx.imageSmoothingEnabled = false;
                previewCtx.drawImage(img, sx, sy, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
            }

            currentFrame = (currentFrame + 1) % totalFrames;
        }

        requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
}

function stopPreview(): void {
    previewAnimId++;
    if (previewCtx && previewCanvas) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
}

// ---- Fim preview animado ----

function populateVocationPresetSelect(source?: VocationsMap): void {
    if (!presetSelect) return;
    fillVocationSelect(presetSelect, source ?? (getRuntimeVocations() as VocationsMap), {
        includeKeyInLabel: true,
    });
}

async function init() {
    await loadRuntimeVocations();
    populateVocationPresetSelect();

    window.addEventListener(VOCATIONS_UPDATED_EVENT, (event) => {
        const detail = (event as CustomEvent<{ vocations: VocationsMap }>).detail;
        if (detail?.vocations) {
            populateVocationPresetSelect(detail.vocations);
            renderOutfitOptions();
        }
    });

    try {
        outfitPresets = await loadOutfitPresets();
    } catch (e) {
        console.error('Falha ao carregar outfit presets:', e);
    }
    
    presetSelect?.addEventListener('change', renderOutfitOptions);
    genderSelect?.addEventListener('change', renderOutfitOptions);
    outfitSelect?.addEventListener('change', () => void updatePreview());

    renderOutfitOptions();
}

function renderOutfitOptions() {
    if (!outfitSelect || !presetSelect || !genderSelect) return;

    const vocation = presetSelect.value as VocationId;
    const gender = genderSelect.value as Gender;

    const availableOutfits = filterOutfitsByVocationAndGender(outfitPresets, vocation, gender)
        .filter(outfit => outfit.showInCreation !== false);

    outfitSelect.innerHTML = '';

    for (const outfit of availableOutfits) {
        const option = document.createElement('option');
        option.value = outfit.id;
        option.textContent = outfit.name;
        outfitSelect.appendChild(option);
    }

    void updatePreview();
}

async function updatePreview(): Promise<void> {
    if (!outfitSelect) return;

    const outfitId = outfitSelect.value;
    const outfit = findOutfitPreset(outfitPresets, outfitId);

    if (outfit) {
        await startAnimatedPreview(outfit);
    } else {
        stopPreview();
    }
}

let charName = '';
let selectedVocation: VocationId = 'knight';
let selectedGender: Gender = 'male';
let selectedOutfitId = '';
let selectedSpriteSheetUrl = '';

function showStep(n: number): void {
    (document.getElementById('step1') as HTMLElement).hidden = n !== 1;
    (document.getElementById('step2') as HTMLElement).hidden = n !== 2;
    (document.getElementById('step3') as HTMLElement).hidden = n !== 3;
    stepLabel.textContent = `Passo ${n} de 3 — ${n === 1 ? 'Nome' : n === 2 ? 'Classe e Gênero' : 'Confirmar'}`;
}

document.getElementById('next1')?.addEventListener('click', () => {
    errEl.hidden = true;
    const name = (document.getElementById('charName') as HTMLInputElement).value;
    const err = validateCharacterName(name);
    if (err) {
        errEl.textContent = err;
        errEl.hidden = false;
        return;
    }
    charName = name.trim();
    showStep(2);
});

document.getElementById('next2')?.addEventListener('click', () => {
    errEl.hidden = true;
    selectedVocation = presetSelect.value as VocationId;
    selectedGender = genderSelect.value as Gender;
    selectedOutfitId = outfitSelect.value;

    const outfit = findOutfitPreset(outfitPresets, selectedOutfitId);
    if (!outfit) {
        errEl.textContent = 'Selecione um visual válido.';
        errEl.hidden = false;
        return;
    }

    selectedSpriteSheetUrl = outfit.spriteSheetUrl;

    const outfitLabel = outfit.name;
    (document.getElementById('summaryName') as HTMLElement).textContent = `${charName} (${selectedVocation.toUpperCase()}, ${selectedGender.toUpperCase()}, Visual: ${outfitLabel})`;
    showStep(3);
});

document.getElementById('confirmCreate')?.addEventListener('click', async () => {
    errEl.hidden = true;
    try {
        await createCharacter(
            session.userId,
            charName,
            selectedVocation,
            selectedGender,
            selectedOutfitId,
            selectedSpriteSheetUrl
        );
        track('character_created', { preset: selectedOutfitId, gender: selectedGender });
        location.href = 'characters.html';
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Erro ao criar personagem.';
        errEl.hidden = false;
    }
});

// Inicializa o fluxo
void init();
showStep(1);
