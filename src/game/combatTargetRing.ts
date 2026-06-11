/**
 * Anel de seleção de alvo no chão (estilo Tibia) — strip 3 frames em
 * `tiles/effects/combat/target_ring.png` + JSON de config.
 */
import { assetLoader } from '../game-data/assetLoader';
import { removeChromaKey } from '../utils/imageProcessor';

export interface CombatTargetRingConfig {
    sheetUrl: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    fps: number;
    /** Escala visual no chão (1 = largura de um tile). */
    drawScale?: number;
}

const DEFAULT_CONFIG: CombatTargetRingConfig = {
    sheetUrl: 'tiles/effects/combat/target_ring.png',
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 3,
    fps: 8,
    drawScale: 1,
};

let config: CombatTargetRingConfig = { ...DEFAULT_CONFIG };
let sheetImage: HTMLImageElement | null = null;
let loadStarted = false;

const BLACK_KEY = { r: 0, g: 0, b: 0 };

function applySheetFromImage(img: HTMLImageElement, json?: Partial<CombatTargetRingConfig> | null): void {
    if (json) {
        config = { ...DEFAULT_CONFIG, ...json };
    }
    if (img.naturalWidth > 0 && config.frameCount > 0) {
        config.frameWidth = Math.floor(img.naturalWidth / config.frameCount);
        config.frameHeight = img.naturalHeight;
    }
    void removeChromaKey(img, BLACK_KEY, 48).then((processed) => {
        sheetImage = processed;
    });
}

export function ensureCombatTargetRingLoaded(): void {
    if (loadStarted) return;
    loadStarted = true;

    void (async () => {
        await assetLoader.initialize();
        const json = await assetLoader.fetchJson<Partial<CombatTargetRingConfig>>(
            'tiles/effects/combat/target_ring.json'
        );
        const sheetUrl = (json?.sheetUrl as string | undefined) ?? DEFAULT_CONFIG.sheetUrl;
        const img = await assetLoader.loadImageElement('/' + sheetUrl.replace(/^\//, ''));
        if (img.naturalWidth > 0) {
            applySheetFromImage(img, json);
            return;
        }
        console.warn('[combatTargetRing] PNG não encontrado:', sheetUrl);
    })();
}

function drawProceduralRing(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    tileSize: number,
    phase: number
): void {
    const rx = tileSize * 0.42;
    const ry = tileSize * 0.22;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -phase * 9;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fef9c3';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
}

/** Desenha anel centrado no pé do mob (chão do tile). */
export function drawCombatTargetRing(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    cameraX: number,
    cameraY: number,
    tileSize: number,
    _zoom: number,
    nowMs: number
): void {
    const frameCount = Math.max(1, config.frameCount);
    const frameMs = 1000 / Math.max(1, config.fps);
    const phase = Math.floor(nowMs / frameMs) % frameCount;

    const centerX = worldX + tileSize / 2 - cameraX;
    const centerY = worldY + tileSize - cameraY;

    if (sheetImage?.complete && sheetImage.naturalWidth > 0) {
        const { frameWidth, frameHeight } = config;
        const sx = phase * frameWidth;
        const scale = config.drawScale ?? 1;
        const drawW = tileSize * scale;
        const drawH = tileSize * scale;
        const drawX = centerX - drawW / 2;
        const drawY = centerY - drawH;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(
            sheetImage,
            sx,
            0,
            frameWidth,
            frameHeight,
            drawX,
            drawY,
            drawW,
            drawH
        );
        ctx.restore();
        return;
    }

    drawProceduralRing(ctx, centerX, centerY, tileSize, phase);
}
