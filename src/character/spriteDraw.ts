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

let highlightScratchCanvas: HTMLCanvasElement | null = null;
let highlightScratchCtx: CanvasRenderingContext2D | null = null;

/**
 * Pulso amarelo só nos pixels opacos do sprite (não tinge chão/chroma transparente).
 */
export function drawSpriteYellowPulseHighlight(
    drawCtx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    pulse: number
): void {
    const padW = Math.max(1, Math.ceil(drawW));
    const padH = Math.max(1, Math.ceil(drawH));

    if (!highlightScratchCanvas) {
        highlightScratchCanvas = document.createElement('canvas');
        highlightScratchCtx = highlightScratchCanvas.getContext('2d');
    }
    if (!highlightScratchCtx) return;

    if (highlightScratchCanvas.width < padW || highlightScratchCanvas.height < padH) {
        highlightScratchCanvas.width = Math.max(highlightScratchCanvas.width, padW);
        highlightScratchCanvas.height = Math.max(highlightScratchCanvas.height, padH);
    }

    const scratch = highlightScratchCtx;
    scratch.clearRect(0, 0, padW, padH);
    scratch.globalCompositeOperation = 'source-over';
    scratch.globalAlpha = 1;
    scratch.imageSmoothingEnabled = false;
    scratch.drawImage(image, sx, sy, sw, sh - 0.5, 0, 0, drawW, drawH);
    scratch.globalCompositeOperation = 'source-atop';
    scratch.fillStyle = `rgba(250, 204, 21, ${pulse})`;
    scratch.fillRect(0, 0, padW, padH);

    drawCtx.imageSmoothingEnabled = false;
    drawCtx.drawImage(highlightScratchCanvas, 0, 0, padW, padH, drawX, drawY, drawW, drawH);
}
