/**
 * Texto flutuante de XP no jogador local (estilo Tibia).
 * Reutiliza animação/fonte de floatingCombatText — sem balão, verde, segue o sprite.
 */

import {
    createFloatingXpEntry,
    createFloatingDamageEntry,
    drawFloatingDamages,
    pruneFloatingDamages,
    type FloatingDamageEntry,
    type FloatingDamageMotion,
} from './floatingCombatText';

export interface LocalPlayerFloatingText {
    spawnXp(xp: number, nowMs: number): void;
    spawnDamage(damage: number, nowMs: number): void;
    tick(nowMs: number): void;
    getActiveCount(): number;
    draw(
        ctx: CanvasRenderingContext2D,
        anchorCenterX: number,
        anchorTopY: number,
        nowMs: number,
        motion?: FloatingDamageMotion
    ): void;
}

export function createLocalPlayerFloatingText(): LocalPlayerFloatingText {
    let entries: FloatingDamageEntry[] = [];

    return {
        spawnXp(xp: number, nowMs: number): void {
            if (xp <= 0) return;
            entries = pruneFloatingDamages(entries, nowMs);
            entries.push(createFloatingXpEntry(xp, nowMs, entries.length));
        },

        spawnDamage(damage: number, nowMs: number): void {
            if (damage <= 0) return;
            entries = pruneFloatingDamages(entries, nowMs);
            entries.push(createFloatingDamageEntry(damage, nowMs, entries.length));
        },

        tick(nowMs: number): void {
            entries = pruneFloatingDamages(entries, nowMs);
        },

        getActiveCount(): number {
            return entries.length;
        },

        draw(ctx, anchorCenterX, anchorTopY, nowMs, motion = 'linear'): void {
            if (entries.length === 0) return;
            drawFloatingDamages(ctx, entries, anchorCenterX, anchorTopY, nowMs, motion);
        },
    };
}
