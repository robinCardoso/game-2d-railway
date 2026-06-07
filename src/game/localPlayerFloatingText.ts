/**
 * Texto flutuante de XP no jogador local (estilo Tibia).
 * Reutiliza animação/fonte de floatingCombatText — sem balão, verde, segue o sprite.
 */

import {
    createFloatingXpEntry,
    drawFloatingDamages,
    pruneFloatingDamages,
    type FloatingDamageEntry,
} from './floatingCombatText';

export interface LocalPlayerFloatingText {
    spawnXp(xp: number, nowMs: number): void;
    tick(nowMs: number): void;
    draw(
        ctx: CanvasRenderingContext2D,
        anchorCenterX: number,
        anchorTopY: number,
        nowMs: number
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

        tick(nowMs: number): void {
            entries = pruneFloatingDamages(entries, nowMs);
        },

        draw(ctx, anchorCenterX, anchorTopY, nowMs): void {
            if (entries.length === 0) return;
            drawFloatingDamages(ctx, entries, anchorCenterX, anchorTopY, nowMs);
        },
    };
}
