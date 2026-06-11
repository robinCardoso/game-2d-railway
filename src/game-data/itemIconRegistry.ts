import { assetLoader } from './assetLoader';
import type { ItemSpriteCalibration } from './itemCatalogTypes';

const iconCache = new Map<string, HTMLImageElement | null>();
const inflight = new Map<string, Promise<HTMLImageElement | null>>();

function iconSrc(iconUrl: string): string {
    const path = iconUrl.startsWith('/') ? iconUrl : `/${iconUrl}`;
    if (assetLoader.isPackaged()) {
        return assetLoader.resolveAssetUrl(path);
    }
    return `${assetLoader.resolveAssetUrl(path)}?v=${encodeURIComponent(iconUrl)}`;
}

export function invalidateItemIconCache(iconUrl?: string): void {
    if (iconUrl) {
        iconCache.delete(iconUrl);
        inflight.delete(iconUrl);
        return;
    }
    iconCache.clear();
    inflight.clear();
}

export async function fetchItemIconImage(iconUrl: string): Promise<HTMLImageElement | null> {
    if (iconCache.has(iconUrl)) {
        return iconCache.get(iconUrl) ?? null;
    }
    const pending = inflight.get(iconUrl);
    if (pending) return pending;

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            iconCache.set(iconUrl, img);
            inflight.delete(iconUrl);
            resolve(img);
        };
        img.onerror = () => {
            iconCache.set(iconUrl, null);
            inflight.delete(iconUrl);
            resolve(null);
        };
        img.src = iconSrc(iconUrl);
    });
    inflight.set(iconUrl, promise);
    return promise;
}

/** Desenha o frame 0 (ou `frameIndex`) do ícone no destino quadrado. */
export function drawItemIconFrame(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    sprite: ItemSpriteCalibration,
    destX: number,
    destY: number,
    destSize: number,
    frameIndex = 0
): void {
    const col = frameIndex % sprite.gridCols;
    const row = Math.floor(frameIndex / sprite.gridCols);
    const gapX = sprite.gapX ?? 0;
    const gapY = sprite.gapY ?? 0;
    const offsetX = sprite.offsetX ?? 0;
    const offsetY = sprite.offsetY ?? 0;
    const sx = offsetX + col * (sprite.frameWidth + gapX);
    const sy = offsetY + row * (sprite.frameHeight + gapY);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(destX, destY, destSize, destSize);
    ctx.drawImage(
        img,
        sx,
        sy,
        sprite.frameWidth,
        sprite.frameHeight,
        destX,
        destY,
        destSize,
        destSize
    );
}
