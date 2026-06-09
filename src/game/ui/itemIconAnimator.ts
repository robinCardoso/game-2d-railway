import type { ItemSpriteCalibration } from '../../game-data/itemCatalogTypes';
import { drawItemIconFrame } from '../../game-data/itemIconRegistry';
import { itemSpriteHasAnimation, resolveItemIconAnimationFrame } from '../../../shared/itemSprite';

interface AnimatedInventorySlot {
    canvas: HTMLCanvasElement;
    img: HTMLImageElement;
    sprite: ItemSpriteCalibration;
}

let animatedSlots: AnimatedInventorySlot[] = [];
let animationFrameId = 0;

export function clearInventoryIconAnimations(): void {
    animatedSlots = [];
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
    }
}

export function registerInventoryIconAnimation(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    sprite: ItemSpriteCalibration
): void {
    if (!itemSpriteHasAnimation(sprite)) return;
    animatedSlots.push({ canvas, img, sprite });
    ensureInventoryIconAnimationLoop();
}

function ensureInventoryIconAnimationLoop(): void {
    if (animationFrameId) return;

    const tick = (nowMs: number): void => {
        const panel = document.getElementById('inventoryPanel');
        if (!panel || panel.hidden || animatedSlots.length === 0) {
            clearInventoryIconAnimations();
            return;
        }

        for (const slot of animatedSlots) {
            const ctx = slot.canvas.getContext('2d');
            if (!ctx) continue;
            const frameIndex = resolveItemIconAnimationFrame(slot.sprite, nowMs);
            drawItemIconFrame(
                ctx,
                slot.img,
                slot.sprite,
                0,
                0,
                slot.canvas.width,
                frameIndex
            );
        }

        animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
}
