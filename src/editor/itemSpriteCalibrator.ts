import { ENGINE_CONFIG } from '../engine/config';
import { applyItemCatalogDocument } from '../game-data/itemCatalog';
import { dispatchItemCatalogUpdated } from '../game-data/itemCatalogUi';
import type { ItemCatalogEntry, ItemSpriteCalibration } from '../game-data/itemCatalogTypes';
import {
    buildDefaultIdleAnimation,
    defaultItemIconUrl,
    resolveItemIconAnimationFrame,
} from '../../shared/itemSprite';
import { apiFetch } from '../shared/apiFetch';
import { toast } from '../utils/popup';

const TILE = ENGINE_CONFIG.TILE_SIZE;

let activeItem: ItemCatalogEntry | null = null;
let loadedImage: HTMLImageElement | null = null;
let onSavedCallback: (() => void) | null = null;
let session: AbortController | null = null;
let previewAnimFrameId = 0;

function getInputs() {
    return {
        modal: document.getElementById('itemSpriteCalibratorModal') as HTMLDivElement | null,
        canvas: document.getElementById('itemSpriteCalCanvas') as HTMLCanvasElement | null,
        fileInput: document.getElementById('itemSpriteFileInput') as HTMLInputElement | null,
        title: document.getElementById('itemSpriteCalTitle') as HTMLSpanElement | null,
        frameWidth: document.getElementById('itemSpriteFrameWidth') as HTMLInputElement | null,
        frameHeight: document.getElementById('itemSpriteFrameHeight') as HTMLInputElement | null,
        gridCols: document.getElementById('itemSpriteGridCols') as HTMLInputElement | null,
        gridRows: document.getElementById('itemSpriteGridRows') as HTMLInputElement | null,
        offsetX: document.getElementById('itemSpriteOffsetX') as HTMLInputElement | null,
        offsetY: document.getElementById('itemSpriteOffsetY') as HTMLInputElement | null,
        gapX: document.getElementById('itemSpriteGapX') as HTMLInputElement | null,
        gapY: document.getElementById('itemSpriteGapY') as HTMLInputElement | null,
        animEnabled: document.getElementById('itemSpriteAnimEnabled') as HTMLInputElement | null,
        animSpeedFps: document.getElementById('itemSpriteAnimSpeedFps') as HTMLInputElement | null,
        animLoop: document.getElementById('itemSpriteAnimLoop') as HTMLInputElement | null,
    };
}

function readCalibrationFromForm(itemId: string): ItemSpriteCalibration {
    const { frameWidth, frameHeight, gridCols, gridRows, offsetX, offsetY, gapX, gapY } = getInputs();
    const parse = (el: HTMLInputElement | null, fallback: number) => {
        const n = Number(el?.value);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };
    const parseOpt = (el: HTMLInputElement | null) => {
        const n = Number(el?.value);
        return Number.isFinite(n) ? Math.floor(n) : 0;
    };
    const gridColsVal = Math.max(1, parse(gridCols, 1));
    const gridRowsVal = Math.max(1, parse(gridRows, 1));
    const { animEnabled, animSpeedFps, animLoop } = getInputs();
    const speedFps = Number(animSpeedFps?.value);
    const calibration: ItemSpriteCalibration = {
        iconUrl: defaultItemIconUrl(itemId),
        frameWidth: parse(frameWidth, TILE),
        frameHeight: parse(frameHeight, TILE),
        gridCols: gridColsVal,
        gridRows: gridRowsVal,
        offsetX: parseOpt(offsetX),
        offsetY: parseOpt(offsetY),
        gapX: parseOpt(gapX),
        gapY: parseOpt(gapY),
    };

    if (animEnabled?.checked) {
        const animations = buildDefaultIdleAnimation(
            gridColsVal,
            gridRowsVal,
            Number.isFinite(speedFps) && speedFps > 0 ? speedFps : 8,
            animLoop?.checked !== false
        );
        if (animations) {
            calibration.animations = animations;
        }
    }

    return calibration;
}

function fillFormFromItem(item: ItemCatalogEntry): void {
    const sprite = item.sprite;
    const { frameWidth, frameHeight, gridCols, gridRows, offsetX, offsetY, gapX, gapY } = getInputs();
    if (frameWidth) frameWidth.value = String(sprite?.frameWidth ?? TILE);
    if (frameHeight) frameHeight.value = String(sprite?.frameHeight ?? TILE);
    if (gridCols) gridCols.value = String(sprite?.gridCols ?? 1);
    if (gridRows) gridRows.value = String(sprite?.gridRows ?? 1);
    if (offsetX) offsetX.value = String(sprite?.offsetX ?? 0);
    if (offsetY) offsetY.value = String(sprite?.offsetY ?? 0);
    if (gapX) gapX.value = String(sprite?.gapX ?? 0);
    if (gapY) gapY.value = String(sprite?.gapY ?? 0);

    const { animEnabled, animSpeedFps, animLoop } = getInputs();
    const idle = sprite?.animations?.idle;
    if (animEnabled) {
        animEnabled.checked = Boolean(idle && idle.frames.length > 1);
    }
    if (animSpeedFps) {
        animSpeedFps.value = String(idle?.speedFps ?? 8);
    }
    if (animLoop) {
        animLoop.checked = idle?.loop !== false;
    }
}

function redrawPreview(): void {
    const { canvas } = getInputs();
    if (!canvas || !loadedImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !activeItem) return;

    const cal = readCalibrationFromForm(activeItem.id);
    const offsetX = cal.offsetX ?? 0;
    const offsetY = cal.offsetY ?? 0;
    const gapX = cal.gapX ?? 0;
    const gapY = cal.gapY ?? 0;
    const maxW = offsetX + cal.gridCols * cal.frameWidth + (cal.gridCols - 1) * gapX;
    const maxH = offsetY + cal.gridRows * cal.frameHeight + (cal.gridRows - 1) * gapY;
    const scale = Math.min(1, 480 / Math.max(maxW, maxH, 1), 320 / Math.max(maxH, 1));

    canvas.width = Math.ceil(maxW * scale);
    canvas.height = Math.ceil(maxH * scale);

    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(loadedImage, 0, 0, maxW, maxH, 0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.85)';
    ctx.lineWidth = 1;
    for (let row = 0; row < cal.gridRows; row++) {
        for (let col = 0; col < cal.gridCols; col++) {
            const x = (offsetX + col * (cal.frameWidth + gapX)) * scale;
            const y = (offsetY + row * (cal.frameHeight + gapY)) * scale;
            const w = cal.frameWidth * scale;
            const h = cal.frameHeight * scale;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    scheduleIconPreviewAnimation();
}

function stopIconPreviewAnimation(): void {
    if (previewAnimFrameId) {
        cancelAnimationFrame(previewAnimFrameId);
        previewAnimFrameId = 0;
    }
}

function scheduleIconPreviewAnimation(): void {
    stopIconPreviewAnimation();
    const iconPreview = document.getElementById('itemSpriteIconPreview') as HTMLCanvasElement | null;
    if (!iconPreview || !loadedImage || !activeItem) return;

    const drawFrame = (nowMs: number) => {
        if (!activeItem || !loadedImage) return;
        const cal = readCalibrationFromForm(activeItem.id);
        const pctx = iconPreview.getContext('2d');
        if (!pctx) return;

        const frameIndex = resolveItemIconAnimationFrame(cal, nowMs);
        const col = frameIndex % cal.gridCols;
        const row = Math.floor(frameIndex / cal.gridCols);
        const offX = cal.offsetX ?? 0;
        const offY = cal.offsetY ?? 0;
        const gX = cal.gapX ?? 0;
        const gY = cal.gapY ?? 0;
        const sx = offX + col * (cal.frameWidth + gX);
        const sy = offY + row * (cal.frameHeight + gY);

        iconPreview.width = TILE;
        iconPreview.height = TILE;
        pctx.imageSmoothingEnabled = false;
        pctx.clearRect(0, 0, TILE, TILE);
        pctx.drawImage(loadedImage, sx, sy, cal.frameWidth, cal.frameHeight, 0, 0, TILE, TILE);

        if (cal.animations?.idle && cal.animations.idle.frames.length > 1) {
            previewAnimFrameId = requestAnimationFrame(drawFrame);
        }
    };

    previewAnimFrameId = requestAnimationFrame(drawFrame);
}

async function loadExistingIcon(item: ItemCatalogEntry): Promise<void> {
    const url = item.sprite?.iconUrl ?? defaultItemIconUrl(item.id);
    const src = url.startsWith('/') ? url : `/${url}`;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            loadedImage = img;
            redrawPreview();
            resolve();
        };
        img.onerror = () => resolve();
        img.src = `${src}?t=${Date.now()}`;
    });
}

function imageToPngBase64(img: HTMLImageElement): string {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
}

function closeModal(): void {
    stopIconPreviewAnimation();
    session?.abort();
    session = null;
    const { modal, fileInput } = getInputs();
    if (modal) modal.style.display = 'none';
    if (fileInput) fileInput.value = '';
    loadedImage = null;
    activeItem = null;
    onSavedCallback = null;
}

async function saveItemIcon(): Promise<void> {
    if (!activeItem || !loadedImage) {
        toast.error('Carregue um PNG antes de salvar.');
        return;
    }

    const sprite = readCalibrationFromForm(activeItem.id);
    const spriteBase64 = imageToPngBase64(loadedImage);

    try {
        const res = await apiFetch('/api/save-item-icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itemId: activeItem.id,
                spriteBase64,
                sprite,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Falha ao salvar ícone.');
        }
        const result = (await res.json()) as { catalog?: { items: ItemCatalogEntry[] } };
        if (result.catalog) {
            applyItemCatalogDocument(result.catalog);
            dispatchItemCatalogUpdated(result.catalog);
        }
        toast.success('Ícone salvo! Agora pode marcar Implementado no catálogo.');
        onSavedCallback?.();
        closeModal();
    } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar ícone.');
    }
}

export function initItemSpriteCalibrator(): void {
    const { fileInput } = getInputs();
    const bind = (id: string, handler: () => void) => {
        document.getElementById(id)?.addEventListener('click', handler);
    };

    bind('itemSpriteCalCloseBtn', closeModal);
    bind('itemSpriteCalCancelBtn', closeModal);
    document.getElementById('itemSpriteCalSaveBtn')?.addEventListener('click', () => {
        void saveItemIcon();
    });

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                loadedImage = img;
                redrawPreview();
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });

    for (const id of [
        'itemSpriteFrameWidth',
        'itemSpriteFrameHeight',
        'itemSpriteGridCols',
        'itemSpriteGridRows',
        'itemSpriteOffsetX',
        'itemSpriteOffsetY',
        'itemSpriteGapX',
        'itemSpriteGapY',
        'itemSpriteAnimEnabled',
        'itemSpriteAnimSpeedFps',
        'itemSpriteAnimLoop',
    ]) {
        const el = document.getElementById(id);
        el?.addEventListener('input', redrawPreview);
        el?.addEventListener('change', redrawPreview);
    }
}

export async function openItemSpriteCalibrator(
    item: ItemCatalogEntry,
    onSaved?: () => void
): Promise<void> {
    if (!item.id) {
        toast.error('Salve o item no catálogo antes de calibrar o sprite.');
        return;
    }

    activeItem = item;
    onSavedCallback = onSaved ?? null;
    loadedImage = null;

    const { modal, title } = getInputs();
    if (!modal) return;

    if (title) title.textContent = `Sprite — ${item.name} (${item.id})`;
    fillFormFromItem(item);
    modal.style.display = 'flex';

    await loadExistingIcon(item);
}
