import { apiFetch } from '../shared/apiFetch';
import { ENGINE_CONFIG } from '../engine/config';
import { toast, popup } from '../utils/popup';
import type { CalibrationResult } from './characterCalibratorModal';
import { sanitizeMapSpriteCategory } from './mapSpriteEditor';

const BATCH_CHUNK_SIZE = 40;

export interface MapSpriteFramePosition {
    col: number;
    row: number;
}

export interface MapSpriteBatchCalibration {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    cols: number;
    rows: number;
}

export interface MapSpriteBatchExportDefaults {
    namePrefix: string;
    category: string;
    variantGroup: string;
    walkable: boolean;
    speedModifier: number;
    excludeVariantGroup: boolean;
}

function padFrameIndex(index: number, total: number): string {
    const digits = Math.max(2, String(total).length);
    return String(index).padStart(digits, '0');
}

function sanitizeNamePrefix(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '');
}

function sanitizeVariantGroup(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '');
}

/** Grupo inferido ao exportar strip com "Sem grupo" — espelha tileRegistry.inferVariantGroupForStrip. */
function inferVariantGroupFromExportName(stripBaseName: string, hintGroup: string): string | undefined {
    const base = stripBaseName.toLowerCase().replace(/-/g, '_');
    if (/grama|grass/.test(base)) return 'grass';
    if (/pedra|stone|ground_pedra|ground/.test(base)) return 'stone';
    if (/dirt|terra|earth/.test(base)) return 'dirt';
    if (/sand|areia/.test(base)) return 'sand';
    if (/water|agua/.test(base)) return 'water';
    const fromHint = sanitizeVariantGroup(hintGroup);
    if (fromHint) return fromHint;
    const sanitized = base.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return sanitized || undefined;
}

function cropFrameToDataUrl(
    image: HTMLImageElement,
    sx: number,
    sy: number,
    frameWidth: number,
    frameHeight: number,
    targetW: number,
    targetH: number
): string {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/png');
}

function getVisibleGridSize(
    imageW: number,
    imageH: number,
    calibration: MapSpriteBatchCalibration
): { cols: number; rows: number } {
    const cols = Math.floor(
        (imageW - calibration.offsetX) / (calibration.frameWidth + calibration.gapX)
    );
    const rows = Math.floor(
        (imageH - calibration.offsetY) / (calibration.frameHeight + calibration.gapY)
    );
    return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

export function calibrationResultToBatchGrid(
    image: HTMLImageElement,
    result: CalibrationResult
): MapSpriteBatchCalibration {
    const imageW = image.naturalWidth || image.width;
    const imageH = image.naturalHeight || image.height;
    const visible = getVisibleGridSize(imageW, imageH, {
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        gapX: result.gapX,
        gapY: result.gapY,
        cols: 0,
        rows: 0,
    });

    return {
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        gapX: result.gapX,
        gapY: result.gapY,
        cols: visible.cols,
        rows: visible.rows,
    };
}

function resolveStripBaseName(rawPrefix: string, variantGroup: string): string {
    let base = sanitizeNamePrefix(rawPrefix)
        .replace(/_variants$/, ''); // Apenas remove o sufixo _variants se já houver
    if (!base || /^\d+$/.test(base)) {
        base = sanitizeVariantGroup(variantGroup) || 'tile';
    }
    return base;
}

function buildVariantStripDataUrl(
    image: HTMLImageElement,
    calibration: MapSpriteBatchCalibration,
    frames: MapSpriteFramePosition[],
    targetW: number,
    targetH: number
): string {
    const canvas = document.createElement('canvas');
    canvas.width = frames.length * targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;

    frames.forEach(({ col, row }, index) => {
        const sx =
            calibration.offsetX + col * (calibration.frameWidth + calibration.gapX);
        const sy =
            calibration.offsetY + row * (calibration.frameHeight + calibration.gapY);
        ctx.drawImage(
            image,
            sx,
            sy,
            calibration.frameWidth,
            calibration.frameHeight,
            index * targetW,
            0,
            targetW,
            targetH
        );
    });

    return canvas.toDataURL('image/png');
}

async function saveVariantStripSprite(options: {
    stripBaseName: string;
    category: string;
    spriteBase64: string;
    frameCount: number;
    variantGroup: string;
    walkable: boolean;
    speedModifier: number;
    includeVariantGroup: boolean;
    frameWidth: number;
    frameHeight: number;
}): Promise<void> {
    const filename = `${options.stripBaseName}_variants`;
    const group = options.includeVariantGroup
        ? sanitizeVariantGroup(options.variantGroup)
        : '';

    const properties: Record<string, unknown> = {
        walkable: options.walkable,
        speedModifier: options.speedModifier,
        isStair: false,
        variantStripFrames: options.frameCount,
        frameWidth: options.frameWidth,
        frameHeight: options.frameHeight,
        gridCols: options.frameCount,
        gridRows: 1,
        offsetX: 0,
        offsetY: 0,
        gapX: 0,
        gapY: 0,
        sheetLayout: 'horizontal',
        nameOverride: `${options.stripBaseName.replace(/_/g, ' ')} (${options.frameCount} var.)`,
    };
    if (group) {
        properties.variantGroup = group;
    } else {
        const inferred = inferVariantGroupFromExportName(options.stripBaseName, options.variantGroup);
        if (inferred) properties.variantGroup = inferred;
    }

    const response = await apiFetch('/api/save-map-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: filename,
            assetType: 'terrain',
            category: options.category,
            spriteBase64: options.spriteBase64,
            properties,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Falha ao salvar variant strip.');
    }
}

export async function exportSelectedVariantStrip(options: {
    image: HTMLImageElement;
    calibration: MapSpriteBatchCalibration;
    selectedFrames: MapSpriteFramePosition[];
    namePrefix: string;
    category: string;
    variantGroup: string;
    walkable: boolean;
    speedModifier: number;
    includeVariantGroup: boolean;
}): Promise<{ frameCount: number; fileName: string }> {
    const frames = options.selectedFrames;
    if (frames.length < 1) {
        throw new Error('Selecione pelo menos 1 frame.');
    }

    const targetSize = ENGINE_CONFIG.TILE_SIZE;
    const isCustomSize = options.calibration.frameWidth !== targetSize || options.calibration.frameHeight !== targetSize;
    let keepOriginal = false;
    if (isCustomSize) {
        keepOriginal = await popup.confirm(
            `As variantes selecionadas têm tamanho ${options.calibration.frameWidth}×${options.calibration.frameHeight} px.<br><br>Deseja <strong>manter o tamanho original</strong> no PNG exportado, ou redimensioná-las para 32×32 px?`,
            'Manter tamanho original?'
        );
    }

    const finalWidth = keepOriginal ? options.calibration.frameWidth : targetSize;
    const finalHeight = keepOriginal ? options.calibration.frameHeight : targetSize;

    const stripBaseName = resolveStripBaseName(options.namePrefix, options.variantGroup);
    const spriteBase64 = buildVariantStripDataUrl(
        options.image,
        options.calibration,
        frames,
        finalWidth,
        finalHeight
    );

    if (!spriteBase64) {
        throw new Error('Não foi possível montar a imagem das variantes.');
    }

    await saveVariantStripSprite({
        stripBaseName,
        category: options.category,
        spriteBase64,
        frameCount: frames.length,
        variantGroup: options.variantGroup,
        walkable: options.walkable,
        speedModifier: options.speedModifier,
        includeVariantGroup: options.includeVariantGroup,
        frameWidth: finalWidth,
        frameHeight: finalHeight,
    });

    return { frameCount: frames.length, fileName: `${stripBaseName}_variants` };
}

async function saveSpriteChunk(
    category: string,
    sprites: Array<{
        name: string;
        spriteBase64: string;
        properties: Record<string, unknown>;
    }>
): Promise<void> {
    const response = await apiFetch('/api/save-map-sprites-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            assetType: 'terrain',
            category,
            sprites,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Falha ao salvar lote de sprites.');
    }
}

export async function exportMapSpriteFrames(options: {
    image: HTMLImageElement;
    calibration: MapSpriteBatchCalibration;
    namePrefix: string;
    category: string;
    variantGroup: string;
    walkable: boolean;
    speedModifier: number;
    includeVariantGroup: boolean;
    /** Se informado, exporta só estes frames (ordem de clique preservada) */
    selectedFrames?: MapSpriteFramePosition[];
    onProgress?: (current: number, total: number) => void;
}): Promise<{ saved: number; failed: number }> {
    const {
        image,
        calibration,
        namePrefix,
        category,
        variantGroup,
        walkable,
        speedModifier,
        includeVariantGroup,
        selectedFrames,
        onProgress,
    } = options;

    const targetSize = ENGINE_CONFIG.TILE_SIZE;
    const isCustomSize = calibration.frameWidth !== targetSize || calibration.frameHeight !== targetSize;
    let keepOriginal = false;
    if (isCustomSize) {
        keepOriginal = await popup.confirm(
            `Os frames da grade têm tamanho ${calibration.frameWidth}×${calibration.frameHeight} px.<br><br>Deseja <strong>manter o tamanho original</strong> para todos os arquivos exportados ou redimensioná-los para 32×32 px?`,
            'Manter tamanho original?'
        );
    }

    const finalWidth = keepOriginal ? calibration.frameWidth : targetSize;
    const finalHeight = keepOriginal ? calibration.frameHeight : targetSize;

    const framesToExport: MapSpriteFramePosition[] =
        selectedFrames && selectedFrames.length > 0
            ? [...selectedFrames]
            : (() => {
                  const all: MapSpriteFramePosition[] = [];
                  for (let row = 0; row < calibration.rows; row++) {
                      for (let col = 0; col < calibration.cols; col++) {
                          all.push({ col, row });
                      }
                  }
                  return all;
              })();

    const total = framesToExport.length;
    if (total < 1) {
        throw new Error('Nenhum frame para exportar.');
    }

    const prefix = sanitizeNamePrefix(namePrefix);
    if (!prefix) {
        throw new Error('Informe um prefixo válido para os nomes (ex.: grama).');
    }

    const sanitizedCategory = sanitizeMapSpriteCategory(category);
    const group = includeVariantGroup ? sanitizeVariantGroup(variantGroup) : '';

    let saved = 0;
    let failed = 0;
    let frameIndex = 0;
    let chunk: Array<{
        name: string;
        spriteBase64: string;
        properties: Record<string, unknown>;
    }> = [];

    const flushChunk = async (): Promise<number> => {
        if (chunk.length === 0) return 0;
        const count = chunk.length;
        await saveSpriteChunk(sanitizedCategory, chunk);
        chunk = [];
        return count;
    };

    for (const { col, row } of framesToExport) {
        frameIndex++;
        const sx =
            calibration.offsetX + col * (calibration.frameWidth + calibration.gapX);
        const sy =
            calibration.offsetY + row * (calibration.frameHeight + calibration.gapY);

        const displayName = `${padFrameIndex(frameIndex, total)}-${prefix.replace(/_/g, '-')}`;
        const spriteBase64 = cropFrameToDataUrl(
            image,
            sx,
            sy,
            calibration.frameWidth,
            calibration.frameHeight,
            finalWidth,
            finalHeight
        );

        if (!spriteBase64) {
            failed++;
            onProgress?.(frameIndex, total);
            continue;
        }

        const properties: Record<string, unknown> = {
            walkable,
            speedModifier,
            isStair: false,
            frameWidth: finalWidth,
            frameHeight: finalHeight,
        };
        if (group) {
            properties.variantGroup = group;
        }

        chunk.push({ name: displayName, spriteBase64, properties });

        if (chunk.length >= BATCH_CHUNK_SIZE) {
            saved += await flushChunk();
        }

        onProgress?.(frameIndex, total);
    }

    saved += await flushChunk();

    return { saved, failed };
}

/** Alias para exportação da grade completa */
export async function exportAllMapSpriteFrames(options: {
    image: HTMLImageElement;
    calibration: MapSpriteBatchCalibration;
    namePrefix: string;
    category: string;
    variantGroup: string;
    walkable: boolean;
    speedModifier: number;
    includeVariantGroup: boolean;
    onProgress?: (current: number, total: number) => void;
}): Promise<{ saved: number; failed: number }> {
    return exportMapSpriteFrames(options);
}

export function openMapSpriteBatchExportModal(
    image: HTMLImageElement,
    calibration: MapSpriteBatchCalibration,
    defaults: MapSpriteBatchExportDefaults,
    onComplete?: () => void | Promise<void>,
    options?: {
        scope?: 'all' | 'selected';
        selectedFrames?: MapSpriteFramePosition[];
    }
): void {
    const modal = document.getElementById('mapSpriteBatchExportModal');
    const modalTitle = modal?.querySelector('.calibrator-title');
    const closeBtn = document.getElementById('mapSpriteBatchExportCloseBtn');
    const confirmBtn = document.getElementById('mapSpriteBatchExportConfirmBtn') as HTMLButtonElement | null;
    const prefixInput = document.getElementById('mapSpriteBatchPrefixInput') as HTMLInputElement | null;
    const categoryInput = document.getElementById('mapSpriteBatchCategoryInput') as HTMLInputElement | null;
    const variantGroupInput = document.getElementById('mapSpriteBatchVariantGroupInput') as HTMLInputElement | null;
    const excludeCheckbox = document.getElementById('mapSpriteBatchVariantGroupExclude') as HTMLInputElement | null;
    const walkableCheckbox = document.getElementById('mapSpriteBatchWalkable') as HTMLInputElement | null;
    const speedInput = document.getElementById('mapSpriteBatchSpeed') as HTMLInputElement | null;
    const summaryEl = document.getElementById('mapSpriteBatchSummary');
    const progressEl = document.getElementById('mapSpriteBatchProgress');

    const cancelBtn = document.getElementById('mapSpriteBatchExportCancelBtn');

    if (
        !modal ||
        !cancelBtn ||
        !confirmBtn ||
        !prefixInput ||
        !categoryInput ||
        !variantGroupInput ||
        !excludeCheckbox
    ) {
        toast.error('Modal de exportação em lote não encontrado no HTML.');
        return;
    }

    const scope = options?.scope ?? 'all';
    const selectedFrames = options?.selectedFrames;
    const total =
        scope === 'selected' && selectedFrames && selectedFrames.length > 0
            ? selectedFrames.length
            : calibration.cols * calibration.rows;

    if (modalTitle) {
        modalTitle.textContent =
            scope === 'selected'
                ? `✅ 1 sprite · ${total} variantes`
                : '📦 Exportar todos os frames';
    }

    prefixInput.value = resolveStripBaseName(defaults.namePrefix || 'grama', defaults.variantGroup || 'grass');
    categoryInput.value = defaults.category || 'grass';
    variantGroupInput.value = defaults.variantGroup || 'grass';
    excludeCheckbox.checked = defaults.excludeVariantGroup;
    variantGroupInput.disabled = defaults.excludeVariantGroup;
    if (walkableCheckbox) walkableCheckbox.checked = defaults.walkable;
    if (speedInput) speedInput.value = String(defaults.speedModifier);

    if (summaryEl) {
        if (scope === 'selected') {
            summaryEl.textContent = `${total} variantes em 1 PNG (${total}×${ENGINE_CONFIG.TILE_SIZE} px de largura) · grupo → pincel 🎲 na aba Tile`;
        } else {
            summaryEl.textContent = `${calibration.cols}×${calibration.rows} = ${total} arquivos PNG separados · ${calibration.frameWidth}×${calibration.frameHeight} px cada`;
        }
    }
    if (progressEl) {
        progressEl.textContent = '';
        progressEl.style.display = 'none';
    }

    const syncExclude = (): void => {
        variantGroupInput.disabled = excludeCheckbox.checked;
        if (excludeCheckbox.checked) {
            variantGroupInput.value = '';
        }
    };
    excludeCheckbox.onchange = syncExclude;

    const closeModal = (): void => {
        modal.classList.remove('is-open');
    };

    cancelBtn.onclick = closeModal;
    closeBtn?.addEventListener('click', closeModal);

    confirmBtn.disabled = false;
    confirmBtn.textContent =
        scope === 'selected' ? `Exportar 1 sprite (${total} var.)` : `Exportar ${total} PNGs`;

    confirmBtn.onclick = async () => {
        if (!prefixInput.value.trim()) {
            toast.error('O Prefixo do Nome é obrigatório.');
            prefixInput.focus();
            return;
        }
        if (!categoryInput.value.trim()) {
            toast.error('A Subpasta (Categoria) é obrigatória.');
            categoryInput.focus();
            return;
        }

        if (total < 1) {
            toast.error('Nenhum frame para exportar.');
            return;
        }
        if (scope === 'selected' && (!selectedFrames || selectedFrames.length < 1)) {
            toast.error('Nenhum frame selecionado. Use seleção múltipla no calibrador.');
            return;
        }
        if (scope === 'all' && total < 2) {
            toast.error('A grade precisa ter pelo menos 2 frames para exportação em lote.');
            return;
        }

        const confirmTitle =
            scope === 'selected' ? 'Exportar variantes selecionadas' : 'Exportar spritesheet inteira';
        const confirmBody =
            scope === 'selected'
                ? `Será criado <strong>1 PNG</strong> (<code>${resolveStripBaseName(prefixInput.value, variantGroupInput.value)}_variants.png</code>) com <strong>${total}</strong> variantes em <code>tiles/maps/${sanitizeMapSpriteCategory(categoryInput.value) || '…'}</code>.`
                : `Serão criados <strong>${total}</strong> PNGs separados em <code>tiles/maps/${sanitizeMapSpriteCategory(categoryInput.value) || '…'}</code>.<br><br>Use isto só para exportar a sheet inteira — para variantes aleatórias prefira <strong>seleção múltipla</strong> + Exportar selecionados.`;

        const ok = await popup.confirm(`${confirmBody}<br><br>Continuar?`, confirmTitle);
        if (!ok) return;

        confirmBtn.disabled = true;
        const originalLabel = confirmBtn.textContent;
        if (progressEl) {
            progressEl.style.display = 'block';
            progressEl.textContent = scope === 'selected' ? 'Montando strip…' : '';
        }

        try {
            if (scope === 'selected' && selectedFrames) {
                const strip = await exportSelectedVariantStrip({
                    image,
                    calibration,
                    selectedFrames,
                    namePrefix: prefixInput.value,
                    category: categoryInput.value,
                    variantGroup: variantGroupInput.value,
                    walkable: walkableCheckbox?.checked ?? true,
                    speedModifier: parseFloat(speedInput?.value ?? '1') || 1,
                    includeVariantGroup: !excludeCheckbox.checked,
                });

                closeModal();
                const groupMsg =
                    !excludeCheckbox.checked && variantGroupInput.value.trim()
                        ? ` Grupo «${sanitizeVariantGroup(variantGroupInput.value)}» — pincel 🎲 na aba Tile.`
                        : '';
                toast.success(
                    `Sprite «${strip.fileName}» salvo com ${strip.frameCount} variantes.${groupMsg}`
                );
            } else {
                const result = await exportMapSpriteFrames({
                    image,
                    calibration,
                    namePrefix: prefixInput.value,
                    category: categoryInput.value,
                    variantGroup: variantGroupInput.value,
                    walkable: walkableCheckbox?.checked ?? true,
                    speedModifier: parseFloat(speedInput?.value ?? '1') || 1,
                    includeVariantGroup: !excludeCheckbox.checked,
                    onProgress: (current, tot) => {
                        confirmBtn.textContent = `Exportando ${current}/${tot}…`;
                        if (progressEl) {
                            progressEl.textContent = `${current} de ${tot} PNGs`;
                        }
                    },
                });

                closeModal();
                const groupMsg =
                    !excludeCheckbox.checked && variantGroupInput.value.trim()
                        ? ` Grupo «${sanitizeVariantGroup(variantGroupInput.value)}» — pincel 🎲 disponível na aba Tile.`
                        : '';
                toast.success(`${result.saved} tiles exportados.${groupMsg}`);
            }

            if (onComplete) {
                await onComplete();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(msg);
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalLabel ?? 'Exportar';
        }
    };

    modal.classList.add('is-open');
}
