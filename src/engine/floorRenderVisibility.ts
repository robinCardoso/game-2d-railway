import { ENGINE_CONFIG } from './config';
import { getLayerCell, type LayerMap } from './mapPaintLayers';
import type { WorldMap } from './types';

export interface FloorTileLayerRefs {
    grassOverlay?: LayerMap;
    itemsOverlay?: LayerMap;
    borderOverlay?: LayerMap;
}

/** Tile sólido no andar (chão, grama ou item) — usado para ponte/teto acima do jogador. */
export function floorHasSolidTileAt(
    worldMap: WorldMap,
    z: number,
    x: number,
    y: number,
    layers?: FloorTileLayerRefs
): boolean {
    const emptyId = ENGINE_CONFIG.EMPTY_TILE_ID;
    const base = worldMap[z]?.[y]?.[x];
    if (base !== undefined && base !== emptyId && base !== -1) return true;
    if (layers?.grassOverlay && getLayerCell(layers.grassOverlay, z, x, y, emptyId) !== emptyId) {
        return true;
    }
    if (layers?.itemsOverlay && getLayerCell(layers.itemsOverlay, z, x, y, emptyId) !== emptyId) {
        return true;
    }
    return false;
}

function solidOnUpper(
    worldMap: WorldMap,
    floorZ: number,
    x: number,
    y: number,
    layers?: FloorTileLayerRefs
): boolean {
    return floorHasSolidTileAt(worldMap, floorZ, x, y, layers);
}

/**
 * Tibia/OTC: em andares acima do jogador, não desenhar o tile exatamente sobre a posição
 * dele quando há terreno sólido nesse andar (ex. ponte) — evita ocultar o personagem.
 */
export function shouldSkipUpperFloorTileOverPlayer(
    floorZ: number,
    playerWorldZ: number,
    playerTileX: number,
    playerTileY: number,
    tileX: number,
    tileY: number,
    worldMap: WorldMap,
    layers?: FloorTileLayerRefs
): boolean {
    if (floorZ <= playerWorldZ) return false;
    if (tileX !== playerTileX || tileY !== playerTileY) return false;
    return floorHasSolidTileAt(worldMap, floorZ, playerTileX, playerTileY, layers);
}

/** Há teto sólido no andar superior exatamente sobre o jogador. */
export function isPlayerUnderSolidUpperFloor(
    floorZ: number,
    playerWorldZ: number,
    playerTileX: number,
    playerTileY: number,
    worldMap: WorldMap,
    layers?: FloorTileLayerRefs
): boolean {
    if (floorZ <= playerWorldZ) return false;
    return floorHasSolidTileAt(worldMap, floorZ, playerTileX, playerTileY, layers);
}

/**
 * Borda da saliência ao entrar/sair de ponte ou penhasco.
 * Usa o eixo do corredor (E-W vs N-S) para não tratar céu N/S de ponte fina como borda.
 */
export function isPlayerAtOverhangEdge(
    floorZ: number,
    playerTileX: number,
    playerTileY: number,
    worldMap: WorldMap,
    layers?: FloorTileLayerRefs
): boolean {
    const east = solidOnUpper(worldMap, floorZ, playerTileX + 1, playerTileY, layers);
    const west = solidOnUpper(worldMap, floorZ, playerTileX - 1, playerTileY, layers);
    const north = solidOnUpper(worldMap, floorZ, playerTileX, playerTileY - 1, layers);
    const south = solidOnUpper(worldMap, floorZ, playerTileX, playerTileY + 1, layers);
    const ewSpan = (east ? 1 : 0) + (west ? 1 : 0);
    const nsSpan = (north ? 1 : 0) + (south ? 1 : 0);

    if (ewSpan >= nsSpan) {
        return !east || !west;
    }
    return !north || !south;
}

export type PlayUpperFloorRenderMode = 'normal' | 'translucent' | 'hidden';

/**
 * Modo de desenho de andar acima do jogador (ponte / penhasco).
 * - normal: fora da sombra ou sem teto sobre o jogador
 * - translucent: parcialmente sob saliência (borda)
 * - hidden: totalmente sob teto contínuo — não desenhar o andar
 */
export function getPlayUpperFloorRenderMode(
    floorZ: number,
    playerWorldZ: number,
    playerTileX: number,
    playerTileY: number,
    worldMap: WorldMap,
    layers?: FloorTileLayerRefs
): PlayUpperFloorRenderMode {
    if (floorZ <= playerWorldZ) return 'normal';
    if (
        !isPlayerUnderSolidUpperFloor(
            floorZ,
            playerWorldZ,
            playerTileX,
            playerTileY,
            worldMap,
            layers
        )
    ) {
        return 'normal';
    }
    if (isPlayerAtOverhangEdge(floorZ, playerTileX, playerTileY, worldMap, layers)) {
        return 'translucent';
    }
    return 'hidden';
}

/** Andares abaixo do jogador não são desenhados, exceto se houver entidade remota/NPC. */
export function shouldRenderPlayFloorZ(
    z: number,
    playerWorldZ: number,
    occupiedFloorZs?: ReadonlySet<number>
): boolean {
    if (z >= playerWorldZ) return true;
    return occupiedFloorZs?.has(z) ?? false;
}
