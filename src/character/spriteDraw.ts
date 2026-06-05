/** Retângulo de origem + escala de desenho para sprites ancorados no tile. */
export interface SpriteSourceRect {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    ax?: number;
    ay?: number;
}

export interface SpriteTilePlacement {
    drawX: number;
    drawY: number;
    drawW: number;
    drawH: number;
}

/**
 * Posiciona sprite com pés no centro-inferior do tile (estilo Tibia).
 * `drawScale` altera só o tamanho visual; movimento permanece no grid `tileSize`.
 */
export function getSpriteTilePlacement(
    worldX: number,
    worldY: number,
    cameraX: number,
    cameraY: number,
    tileSize: number,
    rect: SpriteSourceRect,
    drawScale = 1,
    zoom = 1
): SpriteTilePlacement {
    const drawW = rect.sw * drawScale;
    const drawH = rect.sh * drawScale;
    const ax = (rect.ax ?? 0) * drawScale;
    const ay = (rect.ay ?? 0) * drawScale;
    const rawX = worldX - cameraX + (tileSize - drawW) / 2 + ax;
    const rawY = worldY - cameraY + (tileSize - drawH) + ay;
    return {
        drawX: Math.round(rawX * zoom) / zoom,
        drawY: Math.round(rawY * zoom) / zoom,
        drawW,
        drawH,
    };
}
