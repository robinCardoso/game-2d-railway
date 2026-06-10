import { ENGINE_CONFIG } from './config';
import { getLayerCell, type LayerMap } from './mapPaintLayers';
import type { WorldMap } from './types';

export interface FloorViewportVisibilityOptions {
    z: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
    playerWorldZ: number;
    worldMap: WorldMap;
    grassOverlay?: LayerMap;
    itemsOverlay?: LayerMap;
    borderOverlay?: LayerMap;
    /** Andares com NPC/mob/jogador remoto — sempre desenhar se `z` estiver aqui. */
    occupiedFloorZs?: ReadonlySet<number>;
    /** Segundo andar sempre visível (ex. `editingFloor` no Studio). */
    extraVisibleFloorZ?: number;
}

/** Pula andares vazios no viewport — reduz loops de chão + Y-sort no Play/Studio. */
export function floorHasVisibleContentInView(options: FloorViewportVisibilityOptions): boolean {
    const {
        z,
        startX,
        endX,
        startY,
        endY,
        playerWorldZ,
        worldMap,
        grassOverlay,
        itemsOverlay,
        borderOverlay,
        occupiedFloorZs,
        extraVisibleFloorZ,
    } = options;

    if (z === playerWorldZ) return true;
    if (extraVisibleFloorZ !== undefined && z === extraVisibleFloorZ) return true;
    if (occupiedFloorZs?.has(z)) return true;

    const emptyId = ENGINE_CONFIG.EMPTY_TILE_ID;
    for (let y = startY; y <= endY; y++) {
        const row = worldMap[z]?.[y];
        if (!row) continue;
        for (let x = startX; x <= endX; x++) {
            const base = row[x];
            if (base !== emptyId && base !== -1) return true;
            if (grassOverlay && getLayerCell(grassOverlay, z, x, y, emptyId) !== emptyId) return true;
            if (itemsOverlay && getLayerCell(itemsOverlay, z, x, y, emptyId) !== emptyId) return true;
            if (borderOverlay && getLayerCell(borderOverlay, z, x, y, emptyId) !== emptyId) return true;
        }
    }
    return false;
}
