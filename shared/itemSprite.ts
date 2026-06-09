import type { ItemCatalogDocument, ItemCatalogEntry } from '../src/game-data/itemCatalogTypes.js';

/** Clip de animação do ícone (strip horizontal ou grade). */
export interface ItemSpriteAnimationClip {
    frames: number[];
    speedFps: number;
    loop?: boolean;
}

/** Calibração visual do ícone de inventário (`tiles/items/icons/`). */
export interface ItemSpriteCalibration {
    iconUrl: string;
    frameWidth: number;
    frameHeight: number;
    gridCols: number;
    gridRows: number;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
    /** Ex.: `{ idle: { frames: [0,1,2,3], speedFps: 8, loop: true } }` */
    animations?: Record<string, ItemSpriteAnimationClip>;
}

const DEFAULT_FRAME = 32;

export function defaultItemIconUrl(itemId: string): string {
    const slug = itemId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return `tiles/items/icons/${slug}.png`;
}

export function sanitizeItemSpriteCalibration(raw: unknown, itemId: string): ItemSpriteCalibration | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const row = raw as Record<string, unknown>;

    const parseDim = (key: string, fallback: number): number => {
        const n = Number(row[key]);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };

    const parseOptionalDim = (key: string): number | undefined => {
        if (row[key] === undefined || row[key] === null || row[key] === '') return undefined;
        const n = Number(row[key]);
        return Number.isFinite(n) ? Math.floor(n) : undefined;
    };

    let iconUrl = typeof row.iconUrl === 'string' ? row.iconUrl.trim() : '';
    if (!iconUrl) {
        iconUrl = defaultItemIconUrl(itemId);
    }
    if (!iconUrl.startsWith('tiles/items/')) {
        return undefined;
    }

    const gridCols = Math.max(1, parseDim('gridCols', 1));
    const gridRows = Math.max(1, parseDim('gridRows', 1));
    const maxFrames = gridCols * gridRows;
    const animations = sanitizeItemSpriteAnimations(row.animations, maxFrames);

    const calibration: ItemSpriteCalibration = {
        iconUrl,
        frameWidth: parseDim('frameWidth', DEFAULT_FRAME),
        frameHeight: parseDim('frameHeight', DEFAULT_FRAME),
        gridCols,
        gridRows,
        offsetX: parseOptionalDim('offsetX'),
        offsetY: parseOptionalDim('offsetY'),
        gapX: parseOptionalDim('gapX'),
        gapY: parseOptionalDim('gapY'),
    };
    if (animations) calibration.animations = animations;
    return calibration;
}

function sanitizeItemSpriteAnimations(
    raw: unknown,
    maxFrames: number
): Record<string, ItemSpriteAnimationClip> | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const result: Record<string, ItemSpriteAnimationClip> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const clip = value as Record<string, unknown>;
        const framesRaw = clip.frames;
        if (!Array.isArray(framesRaw) || framesRaw.length === 0) continue;

        const frames = framesRaw
            .map((f) => Number(f))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < maxFrames);
        if (frames.length === 0) continue;

        const speedRaw = Number(clip.speedFps);
        result[key] = {
            frames,
            speedFps: Number.isFinite(speedRaw) && speedRaw > 0 ? speedRaw : 8,
            loop: clip.loop !== false,
        };
    }

    return Object.keys(result).length > 0 ? result : undefined;
}

/** Índice do frame a desenhar no instante `nowMs` (clip `idle` por padrão). */
export function resolveItemIconAnimationFrame(
    sprite: ItemSpriteCalibration,
    nowMs: number,
    clipName = 'idle'
): number {
    const clip = sprite.animations?.[clipName];
    if (!clip?.frames.length) return 0;

    const frameDurationMs = 1000 / clip.speedFps;
    const step = Math.floor(nowMs / frameDurationMs);
    const lastIndex = clip.frames.length - 1;

    if (!clip.loop) {
        return clip.frames[Math.min(step, lastIndex)] ?? 0;
    }

    return clip.frames[step % clip.frames.length] ?? 0;
}

export function itemSpriteHasAnimation(sprite: ItemSpriteCalibration, clipName = 'idle'): boolean {
    const clip = sprite.animations?.[clipName];
    return Boolean(clip && clip.frames.length > 1);
}

/** Gera clip `idle` com todos os frames da grade (ordem row-major). */
export function buildDefaultIdleAnimation(
    gridCols: number,
    gridRows: number,
    speedFps: number,
    loop = true
): Record<string, ItemSpriteAnimationClip> | undefined {
    const total = gridCols * gridRows;
    if (total <= 1) return undefined;
    return {
        idle: {
            frames: Array.from({ length: total }, (_, i) => i),
            speedFps: Math.max(1, Math.floor(speedFps)),
            loop,
        },
    };
}

export function itemHasSprite(entry: ItemCatalogEntry): boolean {
    return Boolean(entry.sprite?.iconUrl);
}

export function validateItemCatalogDocument(
    catalog: ItemCatalogDocument,
    options?: {
        /** Retorna true se o PNG do ícone existe no disco (servidor). */
        iconFileExists?: (iconUrl: string) => boolean;
    }
): { ok: true } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const checkFile = options?.iconFileExists;

    for (const item of catalog.items) {
        if (!item.implemented) continue;

        if (!item.sprite?.iconUrl) {
            errors.push(
                `Item "${item.id}": implemented=true exige bloco sprite.iconUrl no catálogo.`
            );
            continue;
        }

        if (checkFile && !checkFile(item.sprite.iconUrl)) {
            errors.push(
                `Item "${item.id}": PNG ausente em ${item.sprite.iconUrl} (obrigatório para implemented).`
            );
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
