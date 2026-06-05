/** Resultado do cálculo de fatiamento por grade cols×rows. */
export interface GridDivisionResult {
    frameWidth: number;
    frameHeight: number;
    remainderX: number;
    remainderY: number;
    cols: number;
    rows: number;
}

/**
 * Calcula largura/altura de frame para dividir a área útil em cols×rows,
 * respeitando margem inicial e gap entre células (mesma lógica do calibrador).
 */
export function computeFrameDimensionsFromGrid(
    imageW: number,
    imageH: number,
    cols: number,
    rows: number,
    offsetX: number,
    offsetY: number,
    gapX: number,
    gapY: number
): GridDivisionResult {
    const safeCols = Math.max(1, Math.floor(cols) || 1);
    const safeRows = Math.max(1, Math.floor(rows) || 1);
    const ox = Math.max(0, Math.floor(offsetX) || 0);
    const oy = Math.max(0, Math.floor(offsetY) || 0);
    const gx = Math.max(0, Math.floor(gapX) || 0);
    const gy = Math.max(0, Math.floor(gapY) || 0);

    const usableW = Math.max(0, imageW - ox);
    const usableH = Math.max(0, imageH - oy);
    const gapTotalX = (safeCols - 1) * gx;
    const gapTotalY = (safeRows - 1) * gy;

    const frameWidth =
        safeCols > 0 ? Math.max(0, Math.floor((usableW - gapTotalX) / safeCols)) : 0;
    const frameHeight =
        safeRows > 0 ? Math.max(0, Math.floor((usableH - gapTotalY) / safeRows)) : 0;

    const gridW = safeCols * frameWidth + gapTotalX;
    const gridH = safeRows * frameHeight + gapTotalY;

    return {
        frameWidth,
        frameHeight,
        remainderX: usableW - gridW,
        remainderY: usableH - gridH,
        cols: safeCols,
        rows: safeRows,
    };
}
