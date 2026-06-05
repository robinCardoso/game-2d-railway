/** Tamanhos de pincel estilo editor Tibia (quantidade de tiles por carimbo). */
export const PAINT_BRUSH_SIZE_OPTIONS = [1, 2, 4, 6, 8, 10] as const;

export type PaintBrushSize = (typeof PAINT_BRUSH_SIZE_OPTIONS)[number];

export function isPaintBrushSize(value: number): value is PaintBrushSize {
    return (PAINT_BRUSH_SIZE_OPTIONS as readonly number[]).includes(value);
}

/** Quadrado N×N centrado no clique (1→1×1, 2→2×2, 4→4×4, …). */
export function getBrushFootprint(size: PaintBrushSize): { w: number; h: number } {
    return { w: size, h: size };
}

export function* iterBrushCells(
    centerX: number,
    centerY: number,
    size: PaintBrushSize,
    mapSize: number
): Generator<{ x: number; y: number }> {
    const { w, h } = getBrushFootprint(size);
    const startX = centerX - Math.floor(w / 2);
    const startY = centerY - Math.floor(h / 2);

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const x = startX + dx;
            const y = startY + dy;
            if (x >= 0 && x < mapSize && y >= 0 && y < mapSize) {
                yield { x, y };
            }
        }
    }
}
