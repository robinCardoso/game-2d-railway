import type { AnimationDef, CharacterSpriteConfig } from './spriteAnimation';

export interface SheetGridSize {
    cols: number;
    rows: number;
}

export function getSheetGridSize(
    imageWidth: number,
    imageHeight: number,
    config: Pick<CharacterSpriteConfig, 'frameWidth' | 'frameHeight' | 'offsetX' | 'offsetY' | 'gapX' | 'gapY'>
): SheetGridSize {
    const ox = config.offsetX ?? 0;
    const oy = config.offsetY ?? 0;
    const gx = config.gapX ?? 0;
    const gy = config.gapY ?? 0;
    const w = Math.max(1, config.frameWidth);
    const h = Math.max(1, config.frameHeight);
    return {
        cols: Math.max(1, Math.floor((imageWidth - ox) / (w + gx))),
        rows: Math.max(1, Math.floor((imageHeight - oy) / (h + gy))),
    };
}

/** Índice linear na grade (row-major horizontal / column-major vertical). */
export function resolveAnimationFrameCell(
    anim: Pick<AnimationDef, 'row' | 'startFrame'>,
    frameIndex: number,
    sheetLayout: 'horizontal' | 'vertical',
    gridCols: number,
    gridRows: number
): { col: number; row: number } {
    const start = anim.startFrame ?? 0;
    const cols = Math.max(1, gridCols);
    const rows = Math.max(1, gridRows);

    if (sheetLayout === 'vertical') {
        const linear = anim.row * rows + start + frameIndex;
        return {
            col: Math.floor(linear / rows),
            row: linear % rows,
        };
    }

    const linear = anim.row * cols + start + frameIndex;
    return {
        col: linear % cols,
        row: Math.floor(linear / cols),
    };
}

export function resolveAnimationSourceRect(
    config: CharacterSpriteConfig,
    anim: AnimationDef,
    frameIndex: number,
    imageWidth: number,
    imageHeight: number
): { sx: number; sy: number; sw: number; sh: number } {
    const w = config.frameWidth;
    const h = config.frameHeight;
    const ox = config.offsetX ?? 0;
    const oy = config.offsetY ?? 0;
    const gx = config.gapX ?? 0;
    const gy = config.gapY ?? 0;
    const layout = config.sheetLayout ?? 'horizontal';
    const grid = getSheetGridSize(imageWidth, imageHeight, config);
    const { col, row } = resolveAnimationFrameCell(anim, frameIndex, layout, grid.cols, grid.rows);
    return {
        sx: ox + col * (w + gx),
        sy: oy + row * (h + gy),
        sw: w,
        sh: h,
    };
}

export function getAnimationFrameIndexAtCell(
    col: number,
    row: number,
    anim: Pick<AnimationDef, 'row' | 'startFrame' | 'frames'>,
    sheetLayout: 'horizontal' | 'vertical',
    gridCols: number,
    gridRows: number
): number | null {
    for (let i = 0; i < anim.frames; i++) {
        const cell = resolveAnimationFrameCell(anim, i, sheetLayout, gridCols, gridRows);
        if (cell.col === col && cell.row === row) return i;
    }
    return null;
}

export function isCellInAnimation(
    col: number,
    row: number,
    anim: Pick<AnimationDef, 'row' | 'startFrame' | 'frames'>,
    sheetLayout: 'horizontal' | 'vertical',
    gridCols: number,
    gridRows: number
): boolean {
    return getAnimationFrameIndexAtCell(col, row, anim, sheetLayout, gridCols, gridRows) !== null;
}
