import { computeBorderMaskFromGrassNeighbors } from '../engine/borderMaskBits';
import { getPreviewCellCaption, INNER_CORNER_4_SLOTS } from './borderNeighborSlots';
import type { BorderSetCellAssignment } from './borderSetCalibratorUi';

export const PREVIEW_GRID = 3;
export const PREVIEW_TILE_PX = 32;
const GRASS_CENTER_X = 1;
const GRASS_CENTER_Y = 1;

const grassCenterProbe = {
    hasGrass: (_z: number, x: number, y: number) => x === GRASS_CENTER_X && y === GRASS_CENTER_Y,
};

/** Máscara que o motor usa na célula (gx, gy) da prévia 3×3. */
export function getRequiredMaskForPreviewCell(gridX: number, gridY: number): number {
    if (gridX < 0 || gridX >= PREVIEW_GRID || gridY < 0 || gridY >= PREVIEW_GRID) return 0;
    if (gridX === GRASS_CENTER_X && gridY === GRASS_CENTER_Y) return 0;
    return computeBorderMaskFromGrassNeighbors(grassCenterProbe, 0, gridX, gridY);
}

export interface BorderSetPreviewOptions {
    canvas: HTMLCanvasElement;
    image: HTMLImageElement;
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    cells: BorderSetCellAssignment[];
    tilePx?: number;
    statusEl?: HTMLElement | null;
    /** Célula da prévia a destacar (mesma grade 3×3 do motor). */
    highlightPreviewCell?: { x: number; y: number } | null;
}

/** Converte clique na prévia em célula 0..2 (x,y). */
export function pickPreviewGridCell(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    tilePx = PREVIEW_TILE_PX
): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    const x = Math.floor(px / tilePx);
    const y = Math.floor(py / tilePx);
    if (x < 0 || x >= PREVIEW_GRID || y < 0 || y >= PREVIEW_GRID) return null;
    return { x, y };
}

export interface BorderSetPreviewResult {
    missingMasks: number[];
    assignedCount: number;
}

function buildMaskSourceIndex(
    cells: BorderSetCellAssignment[]
): Map<number, { col: number; row: number }> {
    const index = new Map<number, { col: number; row: number }>();
    for (const cell of cells) {
        if (cell.mask <= 0) continue;
        if (!index.has(cell.mask)) {
            index.set(cell.mask, { col: cell.sourceCol, row: cell.sourceRow });
        }
    }
    return index;
}

function applyBlackChromaKey(ctx: CanvasRenderingContext2D, size: number): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 24 && data[i + 1] < 24 && data[i + 2] < 24) {
            data[i + 3] = 0;
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function drawStoneBase(ctx: CanvasRenderingContext2D, dx: number, dy: number, size: number): void {
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(dx, dy, size, size);
    ctx.fillStyle = '#6b7280';
    const brick = Math.max(4, Math.floor(size / 8));
    for (let y = 0; y < size; y += brick) {
        const offset = (Math.floor(y / brick) % 2) * Math.floor(brick / 2);
        for (let x = -offset; x < size; x += brick) {
            ctx.fillRect(dx + x, dy + y, brick - 1, brick - 1);
        }
    }
}

function drawGrassFill(ctx: CanvasRenderingContext2D, dx: number, dy: number, size: number): void {
    ctx.fillStyle = '#166534';
    ctx.fillRect(dx, dy, size, size);
    ctx.fillStyle = '#22c55e';
    const step = Math.max(3, Math.floor(size / 10));
    for (let y = step; y < size; y += step) {
        for (let x = ((y / step) | 0) % 2 ? step : 0; x < size; x += step * 2) {
            ctx.fillRect(dx + x, dy + y, step - 1, step - 1);
        }
    }
}

function drawSheetFrame(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    sourceCol: number,
    sourceRow: number,
    frameWidth: number,
    frameHeight: number,
    offsetX: number,
    offsetY: number,
    gapX: number,
    gapY: number,
    dx: number,
    dy: number,
    size: number
): void {
    if (frameWidth < 1 || frameHeight < 1 || !image.complete) return;

    const sx = offsetX + sourceCol * (frameWidth + gapX);
    const sy = offsetY + sourceRow * (frameHeight + gapY);

    const scratch = document.createElement('canvas');
    scratch.width = size;
    scratch.height = size;
    const sctx = scratch.getContext('2d');
    if (!sctx) return;

    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, size, size);
    applyBlackChromaKey(sctx, size);
    ctx.drawImage(scratch, dx, dy);
}

function drawCellCaption(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    tilePx: number,
    caption: string
): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(dx + 1, dy + 1, tilePx - 2, 12);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(caption, dx + 3, dy + 10);
}

function drawMissingOverlay(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    size: number,
    mask: number
): void {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.fillRect(dx, dy, size, size);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx + 1, dy + 1, size - 2, size - 2);
    ctx.fillStyle = '#fecaca';
    ctx.font = `bold ${Math.max(9, Math.floor(size * 0.28))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`M${mask}`, dx + size / 2, dy + size / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

/** Mini-mapa 3×3: grama no centro, pedra + filetes nos vizinhos (mesma lógica do motor). */
export function renderBorderSetPreview(options: BorderSetPreviewOptions): BorderSetPreviewResult {
    const {
        canvas,
        image,
        frameWidth,
        frameHeight,
        offsetX,
        offsetY,
        gapX,
        gapY,
        cells,
        statusEl,
    } = options;

    const tilePx = options.tilePx ?? PREVIEW_TILE_PX;
    const size = PREVIEW_GRID * tilePx;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { missingMasks: [], assignedCount: 0 };
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    const maskIndex = buildMaskSourceIndex(cells);
    const missingMasks = new Set<number>();
    let assignedCount = 0;

    for (let y = 0; y < PREVIEW_GRID; y++) {
        for (let x = 0; x < PREVIEW_GRID; x++) {
            const dx = x * tilePx;
            const dy = y * tilePx;

            if (x === GRASS_CENTER_X && y === GRASS_CENTER_Y) {
                drawGrassFill(ctx, dx, dy, tilePx);
                drawCellCaption(ctx, dx, dy, tilePx, 'GRAMA');
                continue;
            }

            drawStoneBase(ctx, dx, dy, tilePx);

            const mask = getRequiredMaskForPreviewCell(x, y);
            const caption = getPreviewCellCaption(x, y);
            if (caption) {
                drawCellCaption(ctx, dx, dy, tilePx, caption);
            }
            if (mask === 0) continue;

            const source = maskIndex.get(mask);
            if (source) {
                drawSheetFrame(
                    ctx,
                    image,
                    source.col,
                    source.row,
                    frameWidth,
                    frameHeight,
                    offsetX,
                    offsetY,
                    gapX,
                    gapY,
                    dx,
                    dy,
                    tilePx
                );
                assignedCount++;
            } else {
                missingMasks.add(mask);
                drawMissingOverlay(ctx, dx, dy, tilePx, mask);
            }
        }
    }

    const highlight = options.highlightPreviewCell;
    if (
        highlight &&
        highlight.x >= 0 &&
        highlight.x < PREVIEW_GRID &&
        highlight.y >= 0 &&
        highlight.y < PREVIEW_GRID
    ) {
        const hx = highlight.x * tilePx;
        const hy = highlight.y * tilePx;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.strokeRect(hx + 2, hy + 2, tilePx - 4, tilePx - 4);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.fillRect(hx + 3, hy + 3, tilePx - 6, tilePx - 6);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < PREVIEW_GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tilePx + 0.5, 0);
        ctx.lineTo(i * tilePx + 0.5, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tilePx + 0.5);
        ctx.lineTo(size, i * tilePx + 0.5);
        ctx.stroke();
    }

    const missing = [...missingMasks].sort((a, b) => a - b);

    if (statusEl) {
        if (missing.length === 0) {
            statusEl.textContent =
                assignedCount > 0
                    ? `Prévia OK — ${assignedCount} filete(s) atribuído(s). Centro = grama.`
                    : 'Atribua máscaras e tiles na sheet para ver a prévia.';
            statusEl.classList.remove('is-error');
        } else {
            statusEl.textContent = `Faltam máscaras: ${missing.join(', ')} (células vermelhas). Use o slot «↑ Acima da grama» = M4, não M1.`;
            statusEl.classList.add('is-error');
        }
    }

    return { missingMasks: missing, assignedCount };
}

export const INNER_CORNER_PREVIEW_COLS = INNER_CORNER_4_SLOTS.length;

/** Clique na faixa de quinas L (4 células horizontais). */
export function pickInnerCornerPreviewIndex(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    tilePx = PREVIEW_TILE_PX
): number | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    const gx = Math.floor(px / tilePx);
    const gy = Math.floor(py / tilePx);
    if (gx < 0 || gx >= 3 || gy < 0 || gy >= 3) return null;

    if (gx === 0 && gy === 0) return 1; // M6
    if (gx === 2 && gy === 0) return 2; // M12
    if (gx === 0 && gy === 2) return 0; // M3
    if (gx === 2 && gy === 2) return 3; // M9
    return null;
}

export interface InnerCornerPreviewResult {
    missingMasks: number[];
    assignedCount: number;
}

/** Grade 3×3: quinas L nos cantos e grama no centro + cardinais. */
export function renderInnerCornerPreviewStrip(
    options: Omit<BorderSetPreviewOptions, 'highlightPreviewCell'> & {
        highlightMask?: number | null;
    }
): InnerCornerPreviewResult {
    const {
        canvas,
        image,
        frameWidth,
        frameHeight,
        offsetX,
        offsetY,
        gapX,
        gapY,
        cells,
        highlightMask,
    } = options;

    const tilePx = options.tilePx ?? PREVIEW_TILE_PX;
    const size = 3 * tilePx;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { missingMasks: [], assignedCount: 0 };
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    const maskIndex = buildMaskSourceIndex(cells);
    const missingMasks = new Set<number>();
    let assignedCount = 0;

    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            const dx = x * tilePx;
            const dy = y * tilePx;

            // Centro e cardinais são Grama
            if ((x === 1 && y === 1) || (x === 1 && y === 0) || (x === 1 && y === 2) || (x === 0 && y === 1) || (x === 2 && y === 1)) {
                drawGrassFill(ctx, dx, dy, tilePx);
                drawCellCaption(ctx, dx, dy, tilePx, 'GRAMA');
                continue;
            }

            // Cantos são slots de quinas L
            drawStoneBase(ctx, dx, dy, tilePx);

            let mask = 0;
            let label = '';
            if (x === 0 && y === 0) { mask = 6; label = 'L6'; }
            else if (x === 2 && y === 0) { mask = 12; label = 'L12'; }
            else if (x === 0 && y === 2) { mask = 3; label = 'L3'; }
            else if (x === 2 && y === 2) { mask = 9; label = 'L9'; }

            drawCellCaption(ctx, dx, dy, tilePx, label);

            const source = maskIndex.get(mask);
            if (source) {
                drawSheetFrame(
                    ctx,
                    image,
                    source.col,
                    source.row,
                    frameWidth,
                    frameHeight,
                    offsetX,
                    offsetY,
                    gapX,
                    gapY,
                    dx,
                    dy,
                    tilePx
                );
                assignedCount++;
            } else {
                missingMasks.add(mask);
                drawMissingOverlay(ctx, dx, dy, tilePx, mask);
            }

            if (highlightMask === mask) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3;
                ctx.strokeRect(dx + 2, dy + 2, tilePx - 4, tilePx - 4);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
                ctx.fillRect(dx + 3, dy + 3, tilePx - 6, tilePx - 6);
            }
        }
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tilePx + 0.5, 0);
        ctx.lineTo(i * tilePx + 0.5, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tilePx + 0.5);
        ctx.lineTo(size, i * tilePx + 0.5);
        ctx.stroke();
    }

    return {
        missingMasks: [...missingMasks].sort((a, b) => a - b),
        assignedCount,
    };
}

export function formatCombinedPreviewStatus(
    outer: BorderSetPreviewResult,
    inner: InnerCornerPreviewResult | null
): string {
    const parts: string[] = [];
    if (outer.assignedCount > 0) {
        parts.push(`${outer.assignedCount} borda(s) 3×3`);
    }
    if (inner && inner.assignedCount > 0) {
        parts.push(`${inner.assignedCount}/4 quina(s) L`);
    }
    const missing = [...outer.missingMasks];
    if (inner) {
        for (const m of inner.missingMasks) {
            if (!missing.includes(m)) missing.push(m);
        }
    }
    if (parts.length === 0) {
        return 'Atribua tiles na sheet (prévia 3×3 e quinas L abaixo).';
    }
    if (missing.length === 0) {
        return `Prévia OK — ${parts.join(' · ')}. Clique numa célula para calibrar.`;
    }
    return `Faltam máscaras: ${missing.sort((a, b) => a - b).join(', ')} (vermelho).`;
}
