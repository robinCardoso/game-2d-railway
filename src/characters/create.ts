import './create-character.css';
import '../ui/player-flow-mobile.css';
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
import { assetLoader } from '../game-data/assetLoader';

const session = await requireAuth();

const errEl = document.getElementById('createError') as HTMLElement;
const stepLabel = document.getElementById('wizardStep') as HTMLElement;
const presetSelect = document.getElementById('preset') as HTMLSelectElement;
const genderSelect = document.getElementById('gender') as HTMLSelectElement;
const outfitSelect = document.getElementById('outfit') as HTMLSelectElement;
const previewCanvas = document.getElementById('presetPreviewCanvas') as HTMLCanvasElement;
const previewCtx = previewCanvas?.getContext('2d');

const previewNameEl = document.getElementById('previewName') as HTMLElement | null;
const previewVocationEl = document.getElementById('previewVocation') as HTMLElement | null;
const previewGenderEl = document.getElementById('previewGender') as HTMLElement | null;
const previewOutfitEl = document.getElementById('previewOutfit') as HTMLElement | null;

const vocationCardsEl = document.getElementById('vocationCards') as HTMLElement | null;
const genderCardsEl = document.getElementById('genderCards') as HTMLElement | null;
const outfitCardsEl = document.getElementById('outfitCards') as HTMLElement | null;

const backToStep1Btn = document.getElementById('backToStep1') as HTMLButtonElement | null;
const backToStep2Btn = document.getElementById('backToStep2') as HTMLButtonElement | null;
const confirmCreateBtn = document.getElementById('confirmCreate') as HTMLButtonElement | null;

const VOCATION_PRESENTATION: Record<string, { description: string; difficulty: 'easy' | 'medium' | 'hard' }> = {
    knight: {
        description: 'Guerreiros resistentes especializados em combate corpo a corpo e defesa.',
        difficulty: 'easy',
    },
    mage: {
        description: 'Feiticeiros poderosos que dominam energias arcanas.',
        difficulty: 'medium',
    },
    archer: {
        description: 'Atiradores precisos que atacam à distância com grande habilidade.',
        difficulty: 'medium',
    },
    druid: {
        description: 'Mestres da natureza que curam aliados e controlam forças naturais.',
        difficulty: 'medium',
    },
};

const DIFFICULTY_LABELS: Record<'easy' | 'medium' | 'hard', string> = {
    easy: 'Fácil',
    medium: 'Média',
    hard: 'Difícil',
};

let outfitPresets: OutfitPreset[] = [];

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

let previewAnimId = 0;

function applyChromaKey(imageData: ImageData, tolerance: number): void {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r >= 255 - tolerance && g <= tolerance && b >= 255 - tolerance) {
            d[i + 3] = 0;
        }
    }
}

async function loadCharacterConfig(spriteSheetUrl: string): Promise<CharacterConfig | null> {
    const { fetchCharacterConfigMerged } = await import('../character/characterCalibrationLoader');
    return fetchCharacterConfigMerged(spriteSheetUrl) as Promise<CharacterConfig | null>;
}

async function drawStaticCharacterPreview(canvas: HTMLCanvasElement, spriteSheetUrl: string): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config = await loadCharacterConfig(spriteSheetUrl);
    const cleanPath = spriteSheetUrl.replace(/^\//, '');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const loaded = new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
    });
    img.src = assetLoader.resolveAssetUrl('/' + cleanPath);
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

    const rawAnim = config?.animations?.['idle_down'] || config?.animations?.['walk_down'];
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
            const imageData = tempCtx.getImageData(0, 0, frameWidth, frameHeight);
            applyChromaKey(imageData, tolerance);
            tempCtx.putImageData(imageData, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
        }
    } else {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
    }
}

async function startAnimatedPreview(outfit: OutfitPreset): Promise<void> {
    const thisAnimId = ++previewAnimId;

    if (!previewCtx || !previewCanvas) return;

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const config = await loadCharacterConfig(outfit.spriteSheetUrl);
    if (thisAnimId !== previewAnimId) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const imageLoaded = new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
    });

    img.src = assetLoader.resolveAssetUrl('/' + outfit.spriteSheetUrl.replace(/^\//, ''));
    const loaded = await imageLoaded;
    if (!loaded || thisAnimId !== previewAnimId) return;

    const frameWidth = config?.frameWidth ?? 32;
    const frameHeight = config?.frameHeight ?? 32;
    const offsetX = config?.offsetX ?? 0;
    const offsetY = config?.offsetY ?? 0;
    const gapX = config?.gapX ?? 0;
    const gapY = config?.gapY ?? 0;
    const useChromaKey = config?.chromaKey ?? false;
    const chromaKeyTolerance = config?.chromaKeyTolerance ?? 50;
    const sheetLayout = config?.sheetLayout ?? 'horizontal';

    const anim: AnimationEntry = config?.animations?.['walk_down']
        ?? config?.animations?.['idle_down']
        ?? { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true };

    const totalFrames = Math.max(1, anim.frames);
    const fps = Math.max(1, anim.speedFps);
    const msPerFrame = 1000 / fps;

    const scale = Math.floor(Math.min(previewCanvas.width / frameWidth, previewCanvas.height / frameHeight));
    const drawW = frameWidth * scale;
    const drawH = frameHeight * scale;
    const drawX = Math.floor((previewCanvas.width - drawW) / 2);
    const drawY = Math.floor((previewCanvas.height - drawH) / 2);

    let currentFrame = 0;
    let lastFrameTime = 0;

    let tempCanvas: HTMLCanvasElement | null = null;
    let tempCtx: CanvasRenderingContext2D | null = null;
    if (useChromaKey) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameWidth;
        tempCanvas.height = frameHeight;
        tempCtx = tempCanvas.getContext('2d');
    }

    const drawFrame = (timestamp: number): void => {
        if (thisAnimId !== previewAnimId || !previewCtx) return;

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
    };

    requestAnimationFrame(drawFrame);
}

function stopPreview(): void {
    previewAnimId++;
    if (previewCtx && previewCanvas) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setError(message: string | null): void {
    if (!message) {
        errEl.textContent = '';
        errEl.hidden = true;
        return;
    }

    errEl.textContent = message;
    errEl.hidden = false;
}

function formatLabel(value: string | undefined | null): string {
    if (!value) return '-';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatGenderLabel(value: Gender | string | undefined): string {
    if (value === 'female') return 'Feminino';
    if (value === 'male') return 'Masculino';
    return '-';
}

function setStepperActive(step: number): void {
    document.querySelectorAll<HTMLElement>('[data-step-indicator]').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.stepIndicator === String(step));
    });
}

function getDefaultSpriteForVocation(vocationId: string): string {
    const outfit =
        outfitPresets.find(
            (o) => o.vocationId === vocationId && o.gender === 'male' && o.showInCreation !== false
        ) ?? outfitPresets.find((o) => o.vocationId === vocationId);

    return outfit?.spriteSheetUrl ?? `tiles/characters/vocations/male/${vocationId}.png`;
}

function updatePreviewInfo(): void {
    const currentName = (document.getElementById('charName') as HTMLInputElement | null)?.value.trim();
    const selectedVocationId = presetSelect?.value || selectedVocation;
    const selectedGenderValue = genderSelect?.value as Gender;
    const outfit = findOutfitPreset(outfitPresets, outfitSelect?.value || '');
    const vocConfig = getRuntimeVocations()[selectedVocationId];

    if (previewNameEl) previewNameEl.textContent = currentName || charName || 'Novo herói';
    if (previewVocationEl) {
        previewVocationEl.textContent = vocConfig?.name ?? formatLabel(selectedVocationId);
    }
    if (previewGenderEl) previewGenderEl.textContent = formatGenderLabel(selectedGenderValue);
    if (previewOutfitEl) previewOutfitEl.textContent = outfit?.name ?? '-';
}

function populateVocationPresetSelect(source?: VocationsMap): void {
    if (!presetSelect) return;

    fillVocationSelect(presetSelect, source ?? (getRuntimeVocations() as VocationsMap), {
        includeKeyInLabel: true,
    });

    renderVocationCards();
}

function renderVocationCards(): void {
    if (!vocationCardsEl || !presetSelect) return;

    vocationCardsEl.innerHTML = '';
    const vocations = getRuntimeVocations() as VocationsMap;

    for (const option of Array.from(presetSelect.options)) {
        const vocationId = option.value;
        const vocConfig = vocations[vocationId];
        const displayName = vocConfig?.name ?? option.textContent ?? vocationId;
        const meta = VOCATION_PRESENTATION[vocationId] ?? {
            description: 'Escolha esta vocação para sua jornada.',
            difficulty: 'medium' as const,
        };

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'create-vocation-card' + (vocationId === presetSelect.value ? ' is-selected' : '');
        button.dataset.vocationCard = vocationId;

        button.innerHTML = `
      <span class="create-vocation-card__sprite-wrap">
        <canvas class="create-vocation-card__sprite" width="64" height="64"></canvas>
      </span>
      <strong class="create-vocation-card__title">${escapeHtml(displayName.toUpperCase())}</strong>
      <p class="create-vocation-card__desc">${escapeHtml(meta.description)}</p>
      <span class="create-vocation-card__badge create-vocation-card__badge--${meta.difficulty}">
        ${DIFFICULTY_LABELS[meta.difficulty]}
      </span>
    `;

        vocationCardsEl.appendChild(button);

        const canvas = button.querySelector('.create-vocation-card__sprite') as HTMLCanvasElement | null;
        if (canvas) {
            void drawStaticCharacterPreview(canvas, getDefaultSpriteForVocation(vocationId));
        }
    }
}

function syncVocationCards(): void {
    if (!vocationCardsEl || !presetSelect) return;

    vocationCardsEl.querySelectorAll<HTMLButtonElement>('[data-vocation-card]').forEach((button) => {
        button.classList.toggle('is-selected', button.dataset.vocationCard === presetSelect.value);
    });
}

function renderGenderCards(): void {
    if (!genderCardsEl || !genderSelect) return;

    genderCardsEl.querySelectorAll<HTMLButtonElement>('[data-gender-card]').forEach((button) => {
        button.classList.toggle('is-selected', button.dataset.genderCard === genderSelect.value);
    });
}

function renderOutfitCards(availableOutfits: OutfitPreset[]): void {
    if (!outfitCardsEl || !outfitSelect) return;

    outfitCardsEl.innerHTML = '';

    for (const outfit of availableOutfits) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'create-outfit-card' + (outfit.id === outfitSelect.value ? ' is-selected' : '');
        button.dataset.outfitCard = outfit.id;

        button.innerHTML = `
      <strong>${escapeHtml(outfit.name)}</strong>
    `;

        outfitCardsEl.appendChild(button);
    }
}

function syncOutfitCards(): void {
    if (!outfitCardsEl || !outfitSelect) return;

    outfitCardsEl.querySelectorAll<HTMLButtonElement>('[data-outfit-card]').forEach((button) => {
        button.classList.toggle('is-selected', button.dataset.outfitCard === outfitSelect.value);
    });
}

function renderOutfitOptions(): void {
    if (!outfitSelect || !presetSelect || !genderSelect) return;

    const vocation = presetSelect.value as VocationId;
    const gender = genderSelect.value as Gender;

    const availableOutfits = filterOutfitsByVocationAndGender(outfitPresets, vocation, gender)
        .filter((outfit) => outfit.showInCreation !== false);

    outfitSelect.innerHTML = '';

    for (const outfit of availableOutfits) {
        const option = document.createElement('option');
        option.value = outfit.id;
        option.textContent = outfit.name;
        outfitSelect.appendChild(option);
    }

    renderOutfitCards(availableOutfits);
    syncVocationCards();
    renderGenderCards();
    updatePreviewInfo();

    if (availableOutfits.length === 0) {
        stopPreview();
        return;
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

    stepLabel.textContent = `Passo ${n} de 3 — ${
        n === 1 ? 'Nome' : n === 2 ? 'Vocação e aparência' : 'Confirmar'
    }`;

    setStepperActive(n);
    updatePreviewInfo();
}

async function init(): Promise<void> {
    await loadRuntimeVocations();
    populateVocationPresetSelect();

    window.addEventListener(VOCATIONS_UPDATED_EVENT, (event) => {
        const { detail: { vocations } = {} } = event as CustomEvent<{ vocations: VocationsMap }>;
        if (vocations) {
            populateVocationPresetSelect(vocations);
            renderOutfitOptions();
            updatePreviewInfo();
        }
    });

    try {
        outfitPresets = await loadOutfitPresets();
    } catch (e) {
        console.error('Falha ao carregar outfit presets:', e);
        setError('Não foi possível carregar os visuais disponíveis.');
    }

    presetSelect?.addEventListener('change', () => {
        renderOutfitOptions();
        syncVocationCards();
        updatePreviewInfo();
    });

    genderSelect?.addEventListener('change', () => {
        renderOutfitOptions();
        renderGenderCards();
        updatePreviewInfo();
    });

    outfitSelect?.addEventListener('change', () => {
        syncOutfitCards();
        updatePreviewInfo();
        void updatePreview();
    });

    vocationCardsEl?.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-vocation-card]');
        if (!button || !presetSelect) return;

        presetSelect.value = button.dataset.vocationCard ?? presetSelect.value;
        presetSelect.dispatchEvent(new Event('change'));
    });

    genderCardsEl?.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-gender-card]');
        if (!button || !genderSelect) return;

        genderSelect.value = button.dataset.genderCard as Gender;
        genderSelect.dispatchEvent(new Event('change'));
    });

    outfitCardsEl?.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-outfit-card]');
        if (!button || !outfitSelect) return;

        outfitSelect.value = button.dataset.outfitCard ?? outfitSelect.value;
        outfitSelect.dispatchEvent(new Event('change'));
    });

    document.getElementById('charName')?.addEventListener('input', () => {
        updatePreviewInfo();
    });

    renderOutfitOptions();
    renderGenderCards();
    renderVocationCards();
    updatePreviewInfo();
}

document.getElementById('next1')?.addEventListener('click', () => {
    setError(null);

    const name = (document.getElementById('charName') as HTMLInputElement).value;
    const err = validateCharacterName(name);

    if (err) {
        setError(err);
        return;
    }

    charName = name.trim();
    updatePreviewInfo();
    showStep(2);
});

document.getElementById('next2')?.addEventListener('click', () => {
    setError(null);

    selectedVocation = presetSelect.value as VocationId;
    selectedGender = genderSelect.value as Gender;
    selectedOutfitId = outfitSelect.value;

    const outfit = findOutfitPreset(outfitPresets, selectedOutfitId);

    if (!outfit) {
        setError('Selecione um visual válido.');
        return;
    }

    selectedSpriteSheetUrl = outfit.spriteSheetUrl;

    const vocationLabel =
        presetSelect.options[presetSelect.selectedIndex]?.textContent ?? selectedVocation;
    const genderLabel = formatGenderLabel(selectedGender);
    const outfitLabel = outfit.name;

    const summaryEl = document.getElementById('summaryName') as HTMLElement | null;

    if (summaryEl) {
        summaryEl.textContent = `${charName} — ${vocationLabel}, ${genderLabel}, Visual: ${outfitLabel}`;
    }

    updatePreviewInfo();
    showStep(3);
});

backToStep1Btn?.addEventListener('click', () => {
    setError(null);
    showStep(1);
});

backToStep2Btn?.addEventListener('click', () => {
    setError(null);
    showStep(2);
});

confirmCreateBtn?.addEventListener('click', async () => {
    setError(null);

    if (!confirmCreateBtn) return;

    const originalText = confirmCreateBtn.textContent ?? 'Criar e voltar';

    try {
        confirmCreateBtn.disabled = true;
        confirmCreateBtn.textContent = 'Criando...';

        await createCharacter(
            session.userId,
            charName,
            selectedVocation,
            selectedGender,
            selectedOutfitId,
            selectedSpriteSheetUrl
        );

        track('character_created', {
            preset: selectedOutfitId,
            gender: selectedGender,
            vocation: selectedVocation,
        });

        location.href = 'characters.html';
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar personagem.');
        confirmCreateBtn.disabled = false;
        confirmCreateBtn.textContent = originalText;
    }
});

void init();
showStep(1);
