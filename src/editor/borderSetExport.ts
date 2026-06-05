import { ENGINE_CONFIG } from '../engine/config';
import type { BorderSetCellAssignment } from './borderSetCalibratorUi';
import { getNeighbor3x3SlotMeta } from './borderNeighborSlots';
import {
    BORDER_CARDINAL_MASKS,
    BORDER_DIAGONAL_MASKS,
    BORDER_INNER_CORNER_MASKS,
} from '../engine/borderMaskBits';

export interface BorderSetCalibrationPayload {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    /** Grade de fatiamento da spritesheet (frames na imagem). */
    gridCols: number;
    gridRows: number;
    /** Grade lógica de slots de máscara (3×3, 4×1, …). */
    borderSlotCols: number;
    borderSlotRows: number;
    borderSetCells: BorderSetCellAssignment[];
}

/**
 * Reorganiza células salvas para a grade 3×3 do preset «9 vizinhos»
 * (col/row do slot = posição na lista, máscara fixa por slot).
 */
export function normalizeBorderCellsToNeighbor3x3(
    cells: BorderSetCellAssignment[]
): BorderSetCellAssignment[] {
    const byMask = new Map<number, BorderSetCellAssignment>();
    for (const cell of cells) {
        if (cell.mask <= 0) continue;
        if (!byMask.has(cell.mask)) {
            byMask.set(cell.mask, cell);
        }
    }
    const out: BorderSetCellAssignment[] = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const meta = getNeighbor3x3SlotMeta(col, row);
            if (!meta) continue;
            const saved = byMask.get(meta.mask);
            out.push({
                col,
                row,
                mask: meta.mask,
                sourceCol: saved?.sourceCol ?? col,
                sourceRow: saved?.sourceRow ?? row,
            });
        }
    }
    return out;
}

/** Deduz tamanho da grade de slots a partir das células com máscara ativa. */
export function inferBorderSlotGrid(
    cells: BorderSetCellAssignment[]
): { cols: number; rows: number } {
    const active = cells.filter((c) => c.mask > 0);
    if (active.length === 0) {
        return { cols: 3, rows: 3 };
    }
    let maxCol = 0;
    let maxRow = 0;
    for (const c of active) {
        maxCol = Math.max(maxCol, c.col);
        maxRow = Math.max(maxRow, c.row);
    }
    return {
        cols: Math.max(maxCol + 1, 3),
        rows: Math.max(maxRow + 1, 1),
    };
}

export function getMissingCardinalBorderMasks(cells: BorderSetCellAssignment[]): number[] {
    const present = new Set(
        cells.filter((c) => c.mask > 0).map((c) => c.mask)
    );
    return BORDER_CARDINAL_MASKS.filter((m) => !present.has(m));
}

export function getMissingInnerCornerBorderMasks(cells: BorderSetCellAssignment[]): number[] {
    const present = new Set(cells.filter((c) => c.mask > 0).map((c) => c.mask));
    return BORDER_INNER_CORNER_MASKS.filter((m) => !present.has(m));
}

export function getMissingDiagonalBorderMasks(cells: BorderSetCellAssignment[]): number[] {
    const active = cells.filter((c) => c.mask > 0);
    const present = new Set(active.map((c) => c.mask));
    const hasAnyDiagonal = BORDER_DIAGONAL_MASKS.some((m) => present.has(m));
    if (!hasAnyDiagonal) return [];
    return BORDER_DIAGONAL_MASKS.filter((m) => !present.has(m));
}

export function getDuplicateBorderMasks(cells: BorderSetCellAssignment[]): number[] {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const cell of cells) {
        if (cell.mask <= 0) continue;
        if (seen.has(cell.mask)) dupes.add(cell.mask);
        seen.add(cell.mask);
    }
    return [...dupes].sort((a, b) => a - b);
}

export interface BorderMaskExport {
    mask: number;
    filename: string;
    spriteBase64: string;
    sourceCol: number;
    sourceRow: number;
}

export function cropFrameToBase64(
    image: HTMLImageElement,
    sx: number,
    sy: number,
    frameWidth: number,
    frameHeight: number,
    targetSize = ENGINE_CONFIG.TILE_SIZE,
    options?: { chromaKeyBlack?: boolean }
): string {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, targetSize, targetSize);

    if (options?.chromaKeyBlack) {
        const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r < 24 && g < 24 && b < 24) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL('image/png');
}

/** Extrai um PNG por máscara ativa a partir da sheet calibrada. */
export function buildBorderMaskExports(
    image: HTMLImageElement,
    cal: BorderSetCalibrationPayload,
    setId: string
): BorderMaskExport[] {
    const byMask = new Map<number, BorderSetCellAssignment>();
    for (const cell of cal.borderSetCells) {
        if (cell.mask <= 0) continue;
        if (!byMask.has(cell.mask)) {
            byMask.set(cell.mask, cell);
        }
    }

    const exports: BorderMaskExport[] = [];
    const sortedMasks = [...byMask.keys()].sort((a, b) => a - b);
    for (const mask of sortedMasks) {
        const cell = byMask.get(mask)!;
        const sx = cal.offsetX + cell.sourceCol * (cal.frameWidth + cal.gapX);
        const sy = cal.offsetY + cell.sourceRow * (cal.frameHeight + cal.gapY);
        const filename = `${setId}_mask_${mask}`;
        exports.push({
            mask,
            filename,
            spriteBase64: cropFrameToBase64(image, sx, sy, cal.frameWidth, cal.frameHeight, ENGINE_CONFIG.TILE_SIZE, {
                chromaKeyBlack: true,
            }),
            sourceCol: cell.sourceCol,
            sourceRow: cell.sourceRow,
        });
    }
    return exports;
}

export function calibrationFromCalibratorResult(result: {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX?: number;
    gapY?: number;
    gridCols?: number;
    gridRows?: number;
    borderSlotCols?: number;
    borderSlotRows?: number;
    borderSetCells?: BorderSetCellAssignment[];
}): BorderSetCalibrationPayload {
    const borderSetCells = result.borderSetCells ?? [];
    const slotGrid =
        result.borderSlotCols && result.borderSlotRows
            ? { cols: result.borderSlotCols, rows: result.borderSlotRows }
            : inferBorderSlotGrid(borderSetCells);
    return {
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        gapX: result.gapX ?? 0,
        gapY: result.gapY ?? 0,
        gridCols: result.gridCols ?? 1,
        gridRows: result.gridRows ?? 1,
        borderSlotCols: slotGrid.cols,
        borderSlotRows: slotGrid.rows,
        borderSetCells,
    };
}
