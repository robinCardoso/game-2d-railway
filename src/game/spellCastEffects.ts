import type { SpellDefinition } from '../game-data/spellCatalogTypes';
import {
    drawSpellCastSprite,
    getSpellCastSpriteDurationMs,
    isSpellCastSpriteReady,
    spellCastSpriteRotatesToTarget,
} from './spellCastEffectSprites';

export type SpellCastEffectKind =
    | 'knight_brutal_strike'
    | 'knight_ground_slam'
    | 'knight_front_sweep'
    | 'melee_default'
    | 'magic_default';

export interface SpellCastEffectSpawn {
    worldX: number;
    worldY: number;
    z: number;
    casterWorldX: number;
    casterWorldY: number;
}

interface ActiveSpellEffect extends SpellCastEffectSpawn {
    kind: SpellCastEffectKind;
    startedAtMs: number;
    durationMs: number;
    angleRad: number;
}

const KNOWN_KINDS: ReadonlySet<string> = new Set([
    'knight_brutal_strike',
    'knight_ground_slam',
    'knight_front_sweep',
    'melee_default',
    'magic_default',
]);

const FALLBACK_DURATION_MS: Record<SpellCastEffectKind, number> = {
    knight_brutal_strike: 280,
    knight_ground_slam: 520,
    knight_front_sweep: 380,
    melee_default: 300,
    magic_default: 420,
};

const activeEffects: ActiveSpellEffect[] = [];

export function resolveSpellCastEffectKind(spell: SpellDefinition): SpellCastEffectKind {
    const key = spell.castEffect?.trim() || spell.id;
    if (KNOWN_KINDS.has(key)) return key as SpellCastEffectKind;
    if (spell.damage?.type === 'melee') return 'melee_default';
    return 'magic_default';
}

function resolveAngleRad(spawn: SpellCastEffectSpawn): number {
    const dx = spawn.worldX - spawn.casterWorldX;
    const dy = spawn.worldY - spawn.casterWorldY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return Math.PI / 2;
    return Math.atan2(dy, dx);
}

function resolveDurationMs(kind: SpellCastEffectKind): number {
    try {
        return getSpellCastSpriteDurationMs(kind);
    } catch {
        return FALLBACK_DURATION_MS[kind];
    }
}

export function spawnSpellCastEffect(
    spell: SpellDefinition,
    spawn: SpellCastEffectSpawn,
    nowMs: number
): void {
    const kind = resolveSpellCastEffectKind(spell);
    activeEffects.push({
        kind,
        ...spawn,
        startedAtMs: nowMs,
        durationMs: resolveDurationMs(kind),
        angleRad: resolveAngleRad(spawn),
    });
}

export function pruneSpellCastEffects(nowMs: number): void {
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        if (nowMs - activeEffects[i].startedAtMs >= activeEffects[i].durationMs) {
            activeEffects.splice(i, 1);
        }
    }
}

export function getActiveSpellCastEffectCount(): number {
    return activeEffects.length;
}

/* --- Fallback procedural (só se PNG ainda não carregou) --- */

function easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t);
}

function drawBrutalStrikeFallback(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    tileSize: number,
    angleRad: number,
    t: number
): void {
    const alpha = 1 - t;
    const reach = tileSize * (0.35 + t * 0.55);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.globalAlpha = alpha * 0.95;
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tileSize * 0.05, 0);
    ctx.quadraticCurveTo(reach * 0.55, -tileSize * 0.22, reach, 0);
    ctx.stroke();
    ctx.restore();
}

function drawGroundSlamFallback(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    tileSize: number,
    t: number
): void {
    const ringT = easeOut(t);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, tileSize * (0.2 + ringT * 0.55), tileSize * (0.1 + ringT * 0.28), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawFrontSweepFallback(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    tileSize: number,
    angleRad: number,
    t: number
): void {
    const spread = 0.55 + t * 0.35;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.globalAlpha = (1 - t) * 0.92;
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, tileSize * 0.62, -spread, spread);
    ctx.stroke();
    ctx.restore();
}

function drawMagicFallback(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    tileSize: number,
    t: number
): void {
    const r = tileSize * (0.18 + t * 0.35);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.fillStyle = '#93c5fd';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawProceduralFallback(
    ctx: CanvasRenderingContext2D,
    kind: SpellCastEffectKind,
    targetCx: number,
    targetCy: number,
    tileSize: number,
    angleRad: number,
    t: number
): void {
    switch (kind) {
        case 'knight_brutal_strike':
        case 'melee_default':
            drawBrutalStrikeFallback(ctx, targetCx, targetCy, tileSize, angleRad, t);
            break;
        case 'knight_ground_slam':
            drawGroundSlamFallback(ctx, targetCx, targetCy, tileSize, t);
            break;
        case 'knight_front_sweep':
            drawFrontSweepFallback(ctx, targetCx, targetCy, tileSize, angleRad, t);
            break;
        default:
            drawMagicFallback(ctx, targetCx, targetCy, tileSize, t);
            break;
    }
}

export function drawSpellCastEffects(
    ctx: CanvasRenderingContext2D,
    options: {
        z: number;
        cameraX: number;
        cameraY: number;
        tileSize: number;
        nowMs: number;
    }
): void {
    pruneSpellCastEffects(options.nowMs);

    for (const effect of activeEffects) {
        if (effect.z !== options.z) continue;

        const elapsed = options.nowMs - effect.startedAtMs;
        const t = Math.min(1, elapsed / effect.durationMs);
        const targetScreenX = effect.worldX - options.cameraX;
        const targetScreenY = effect.worldY - options.cameraY;
        const casterScreenX = effect.casterWorldX - options.cameraX;
        const casterScreenY = effect.casterWorldY - options.cameraY;

        const targetCx = targetScreenX + options.tileSize / 2;
        const targetCy = targetScreenY + options.tileSize;

        if (isSpellCastSpriteReady(effect.kind)) {
            drawSpellCastSprite(
                ctx,
                effect.kind,
                targetScreenX,
                targetScreenY,
                options.tileSize,
                effect.startedAtMs,
                options.nowMs,
                effect.angleRad,
                false
            );
            if (t < 0.45 && spellCastSpriteRotatesToTarget(effect.kind)) {
                drawSpellCastSprite(
                    ctx,
                    effect.kind,
                    casterScreenX,
                    casterScreenY,
                    options.tileSize,
                    effect.startedAtMs,
                    options.nowMs,
                    effect.angleRad,
                    true
                );
            }
        } else {
            drawProceduralFallback(
                ctx,
                effect.kind,
                targetCx,
                targetCy,
                options.tileSize,
                effect.angleRad,
                t
            );
        }
    }
}

export function resetSpellCastEffects(): void {
    activeEffects.length = 0;
}
