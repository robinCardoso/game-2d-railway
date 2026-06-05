import type { AnimationDef, CharacterSpriteConfig } from '../character/spriteAnimation';
import { resolveAnimationSourceRect } from '../character/sheetFrameLayout';
import { removeChromaKey } from '../utils/imageProcessor';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function normalizeSpriteUrl(url: string): string {
    if (url.startsWith('data:')) return url;
    return url.startsWith('/') ? url : `/${url}`;
}

function cacheKey(config: CharacterSpriteConfig): string {
    const chroma = config.chromaKey ? `:ck${config.chromaKeyTolerance ?? 50}` : '';
    return `${normalizeSpriteUrl(config.spriteSheetUrl)}${chroma}`;
}

async function loadSpriteImage(config: CharacterSpriteConfig): Promise<HTMLImageElement | null> {
    const url = config.spriteSheetUrl?.trim();
    if (!url) return null;

    const key = cacheKey(config);
    let pending = imageCache.get(key);
    if (!pending) {
        pending = (async () => {
            try {
                const src = normalizeSpriteUrl(url);
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
                    img.src = src;
                });
                if (config.chromaKey) {
                    return await removeChromaKey(img, undefined, config.chromaKeyTolerance ?? 50);
                }
                return img;
            } catch (err) {
                console.warn('[CreatureThumbnail] Sprite não carregado:', url, err);
                return null;
            }
        })();
        imageCache.set(key, pending);
    }
    return pending;
}

function pickPreviewAnimation(config: CharacterSpriteConfig): AnimationDef | null {
    const preferred = ['idle_down', 'walk_down', 'idle_up', 'idle_left', 'idle_right'];
    for (const key of preferred) {
        if (config.animations[key]) return config.animations[key];
    }
    const first = Object.values(config.animations)[0];
    return first ?? null;
}

/** Desenha o primeiro frame idle/walk no canvas (pés perto da base). */
export async function drawCreaturePresetThumbnail(
    canvas: HTMLCanvasElement,
    config: CharacterSpriteConfig
): Promise<boolean> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const anim = pickPreviewAnimation(config);
    const img = anim ? await loadSpriteImage(config) : null;
    if (!anim || !img) {
        drawCreatureThumbnailFallback(ctx, canvas.width, canvas.height);
        return false;
    }

    const imageW = img.naturalWidth || img.width;
    const imageH = img.naturalHeight || img.height;
    const { sx, sy, sw, sh } = resolveAnimationSourceRect(config, anim, 0, imageW, imageH);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = 2;
    const maxW = canvas.width - pad * 2;
    const maxH = canvas.height - pad * 2;
    const drawScale = config.drawScale ?? 1;
    const displayW = sw * drawScale;
    const displayH = sh * drawScale;
    const fit = Math.min(maxW / displayW, maxH / displayH);
    const drawW = displayW * fit;
    const drawH = displayH * fit;
    const drawX = (canvas.width - drawW) / 2;
    const drawY = canvas.height - drawH - pad;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, drawW, drawH);
    return true;
}

export function drawCreatureThumbnailFallback(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color = '#3f4452',
    emoji = '👾'
): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, width, height);
    const r = Math.min(width, height) * 0.35;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.font = `${Math.round(r)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, width / 2, height / 2 + 1);
}

export function invalidateCreatureThumbnailCache(): void {
    imageCache.clear();
}
