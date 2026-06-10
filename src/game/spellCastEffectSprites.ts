/**
 * Strips de VFX de magia — `tiles/effects/spells/cast/{kind}.png` + JSON.
 * Mesmo contrato visual do anel de alvo (`combatTargetRing.ts`).
 */
import { removeChromaKey } from '../utils/imageProcessor';
import { resolveApiUrl } from '../shared/apiUrl';
import type { SpellCastEffectKind } from './spellCastEffects';

export interface SpellCastSpriteConfig {
    sheetUrl: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    fps: number;
    /** Escala no chão (1 = largura de um tile). */
    drawScale?: number;
    /** Rotação do sprite na direção caster→alvo. */
    rotateToTarget?: boolean;
    durationMs?: number;
}

const MAGENTA_KEY = { r: 255, g: 0, b: 255 };

const DEFAULT_CONFIG: SpellCastSpriteConfig = {
    sheetUrl: 'tiles/effects/spells/cast/melee_default.png',
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
    fps: 12,
    drawScale: 1.15,
    rotateToTarget: true,
    durationMs: 320,
};

const KINDS: SpellCastEffectKind[] = [
    'knight_brutal_strike',
    'knight_ground_slam',
    'knight_front_sweep',
    'melee_default',
    'magic_default',
];

interface LoadedSheet {
    config: SpellCastSpriteConfig;
    image: HTMLImageElement | null;
    loadStarted: boolean;
}

const sheets = new Map<SpellCastEffectKind, LoadedSheet>();

function getSheet(kind: SpellCastEffectKind): LoadedSheet {
    let entry = sheets.get(kind);
    if (!entry) {
        entry = {
            config: {
                ...DEFAULT_CONFIG,
                sheetUrl: `tiles/effects/spells/cast/${kind}.png`,
            },
            image: null,
            loadStarted: false,
        };
        sheets.set(kind, entry);
    }
    return entry;
}

function applySheetFromImage(
    kind: SpellCastEffectKind,
    img: HTMLImageElement,
    json?: Partial<SpellCastSpriteConfig> | null
): void {
    const entry = getSheet(kind);
    const config = { ...DEFAULT_CONFIG, ...json };
    if (img.naturalWidth > 0 && config.frameCount > 0) {
        config.frameWidth = Math.floor(img.naturalWidth / config.frameCount);
        config.frameHeight = img.naturalHeight;
    }
    entry.config = config;
    void removeChromaKey(img, MAGENTA_KEY, 48).then((processed) => {
        entry.image = processed;
    });
}

function loadKind(kind: SpellCastEffectKind): void {
    const entry = getSheet(kind);
    if (entry.loadStarted) return;
    entry.loadStarted = true;

    const jsonUrl = resolveApiUrl(`/tiles/effects/spells/cast/${kind}.json`);
    void fetch(jsonUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((json: Partial<SpellCastSpriteConfig> | null) => {
            const img = new Image();
            img.onload = () => applySheetFromImage(kind, img, json);
            img.onerror = () => {
                console.warn('[spellCastEffectSprites] PNG não encontrado:', kind);
            };
            const sheetUrl =
                (json?.sheetUrl as string | undefined) ??
                `tiles/effects/spells/cast/${kind}.png`;
            img.src = resolveApiUrl('/' + sheetUrl.replace(/^\//, ''));
        })
        .catch(() => {
            const img = new Image();
            img.onload = () => applySheetFromImage(kind, img);
            img.src = resolveApiUrl(`/tiles/effects/spells/cast/${kind}.png`);
        });
}

export function ensureSpellCastSpritesLoaded(): void {
    for (const kind of KINDS) {
        loadKind(kind);
    }
}

export function getSpellCastSpriteDurationMs(kind: SpellCastEffectKind): number {
    const cfg = getSheet(kind).config;
    if (cfg.durationMs && cfg.durationMs > 0) return cfg.durationMs;
    const frameMs = 1000 / Math.max(1, cfg.fps);
    return Math.round(frameMs * Math.max(1, cfg.frameCount));
}

export function isSpellCastSpriteReady(kind: SpellCastEffectKind): boolean {
    const img = getSheet(kind).image;
    return Boolean(img?.complete && img.naturalWidth > 0);
}

export function spellCastSpriteRotatesToTarget(kind: SpellCastEffectKind): boolean {
    return getSheet(kind).config.rotateToTarget !== false;
}

/** Desenha frame da strip no pé do alvo (ou caster quando `atCaster`). */
export function drawSpellCastSprite(
    ctx: CanvasRenderingContext2D,
    kind: SpellCastEffectKind,
    screenX: number,
    screenY: number,
    tileSize: number,
    startedAtMs: number,
    nowMs: number,
    angleRad: number,
    atCaster = false
): boolean {
    const entry = getSheet(kind);
    const img = entry.image;
    if (!img?.complete || img.naturalWidth <= 0) return false;

    const { config } = entry;
    const frameCount = Math.max(1, config.frameCount);
    const frameMs = 1000 / Math.max(1, config.fps);
    const elapsed = nowMs - startedAtMs;
    const frame = Math.min(frameCount - 1, Math.floor(elapsed / frameMs));

    const { frameWidth, frameHeight } = config;
    const sx = frame * frameWidth;
    const scale = config.drawScale ?? 1;
    const drawW = tileSize * scale;
    const drawH = tileSize * scale;

    const cx = screenX + tileSize / 2;
    const cy = screenY + tileSize - (atCaster ? tileSize * 0.12 : 0);
    const drawX = cx - drawW / 2;
    const drawY = cy - drawH;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.95;
    if (config.rotateToTarget && !atCaster) {
        ctx.translate(cx, cy);
        ctx.rotate(angleRad);
        ctx.drawImage(img, sx, 0, frameWidth, frameHeight, -drawW / 2, -drawH, drawW, drawH);
    } else {
        ctx.drawImage(img, sx, 0, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
    return true;
}

export function resetSpellCastSpriteCache(): void {
    sheets.clear();
}
