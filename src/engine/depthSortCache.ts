import { ENGINE_CONFIG } from './config';
import type { DepthDrawable } from './depthSortDraw';

/** Fingerprint estável dos pés — quantizado por tile para cache durante deslize. */
export function computeDepthSortFingerprint(drawables: readonly DepthDrawable[]): number {
    const tile = ENGINE_CONFIG.TILE_SIZE;
    let h = drawables.length | 0;
    for (let i = 0; i < drawables.length; i++) {
        const d = drawables[i]!;
        const sortYTile = (d.sortY / tile) | 0;
        const sortXTile = (d.sortX / tile) | 0;
        const key = (Math.imul(sortYTile, 65537) + sortXTile) | 0;
        h = (h ^ key) | 0;
    }
    return h;
}

interface FloorSortState {
    fingerprint: number;
    /** Índices na ordem de coleta → ordem de desenho após sort. */
    drawOrder: number[];
}

function compareDepthDrawables(a: DepthDrawable, b: DepthDrawable): number {
    return a.sortY - b.sortY || a.sortX - b.sortX;
}

function applyDrawOrder(drawables: DepthDrawable[], drawOrder: number[]): void {
    if (drawOrder.length !== drawables.length) return;
    const snapshot = drawables.slice();
    for (let i = 0; i < drawOrder.length; i++) {
        drawables[i] = snapshot[drawOrder[i]!]!;
    }
}

function buildDrawOrder(drawables: readonly DepthDrawable[]): number[] {
    const indices = drawables.map((_, i) => i);
    indices.sort((a, b) =>
        compareDepthDrawables(drawables[a]!, drawables[b]!)
    );
    return indices;
}

/** Cache por andar Z — evita `.sort()` quando nenhum pé mudou desde o último frame. */
export class DepthSortFingerprintCache {
    private readonly byZ = new Map<number, FloorSortState>();
    private sortHits = 0;
    private sortMisses = 0;

    sortIfDirty(z: number, drawables: DepthDrawable[]): void {
        const fingerprint = computeDepthSortFingerprint(drawables);
        const cached = this.byZ.get(z);

        if (
            cached &&
            cached.fingerprint === fingerprint &&
            cached.drawOrder.length === drawables.length
        ) {
            applyDrawOrder(drawables, cached.drawOrder);
            this.sortHits += 1;
            return;
        }

        const drawOrder = buildDrawOrder(drawables);
        applyDrawOrder(drawables, drawOrder);
        this.byZ.set(z, { fingerprint, drawOrder });
        this.sortMisses += 1;
    }

    consumeSortStats(): { hits: number; misses: number } {
        const stats = { hits: this.sortHits, misses: this.sortMisses };
        this.sortHits = 0;
        this.sortMisses = 0;
        return stats;
    }

    clear(): void {
        this.byZ.clear();
        this.sortHits = 0;
        this.sortMisses = 0;
    }
}
