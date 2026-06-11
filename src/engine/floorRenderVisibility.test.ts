import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from './config';
import { createEmptyLayerMap, setLayerCell } from './mapPaintLayers';
import {
    floorHasSolidTileAt,
    getPlayUpperFloorRenderMode,
    isPlayerAtOverhangEdge,
    shouldRenderPlayFloorZ,
} from './floorRenderVisibility';
import { floorHasVisibleContentInView } from './floorViewportVisibility';
import { createEmptyWorldMap, ensureAllFloors } from './worldMap';

const emptyId = ENGINE_CONFIG.EMPTY_TILE_ID;
const SOLID = 42;

function horizontalBridgeMap(bridgeY: number, bridgeXStart: number, bridgeXEnd: number) {
    const worldMap = ensureAllFloors(createEmptyWorldMap(16));
    for (let x = bridgeXStart; x <= bridgeXEnd; x++) {
        worldMap[1]![bridgeY]![x] = SOLID;
        worldMap[0]![bridgeY]![x] = SOLID;
    }
    return worldMap;
}

describe('floorHasSolidTileAt', () => {
    it('detecta chão base e grama', () => {
        const worldMap = ensureAllFloors(createEmptyWorldMap(8));
        const grass = createEmptyLayerMap(8);
        worldMap[1]![2]![3] = SOLID;
        expect(floorHasSolidTileAt(worldMap, 1, 3, 2)).toBe(true);

        worldMap[1]![2]![3] = emptyId;
        setLayerCell(grass, 1, 3, 2, 7, 8);
        expect(floorHasSolidTileAt(worldMap, 1, 3, 2, { grassOverlay: grass })).toBe(true);
    });
});

describe('getPlayUpperFloorRenderMode', () => {
    it('normal quando não há teto sobre o jogador', () => {
        const worldMap = horizontalBridgeMap(4, 0, 10);
        expect(getPlayUpperFloorRenderMode(1, 0, 5, 6, worldMap)).toBe('normal');
    });

    it('translucent na borda da ponte (vizinho cardinal vazio no +1)', () => {
        const worldMap = horizontalBridgeMap(4, 5, 10);
        expect(getPlayUpperFloorRenderMode(1, 0, 5, 4, worldMap)).toBe('translucent');
        expect(getPlayUpperFloorRenderMode(1, 0, 10, 4, worldMap)).toBe('translucent');
    });

    it('hidden totalmente sob teto contínuo', () => {
        const worldMap = horizontalBridgeMap(4, 0, 10);
        expect(getPlayUpperFloorRenderMode(1, 0, 5, 4, worldMap)).toBe('hidden');
    });
});

describe('isPlayerAtOverhangEdge', () => {
    it('centro de ponte larga não é borda', () => {
        const worldMap = horizontalBridgeMap(4, 0, 10);
        expect(isPlayerAtOverhangEdge(1, 5, 4, worldMap)).toBe(false);
    });

    it('ponta da ponte é borda', () => {
        const worldMap = horizontalBridgeMap(4, 5, 10);
        expect(isPlayerAtOverhangEdge(1, 5, 4, worldMap)).toBe(true);
    });
});

describe('shouldRenderPlayFloorZ', () => {
    it('não desenha andares abaixo do jogador sem entidades', () => {
        expect(shouldRenderPlayFloorZ(-1, 0)).toBe(false);
        expect(shouldRenderPlayFloorZ(-3, 0)).toBe(false);
        expect(shouldRenderPlayFloorZ(0, 0)).toBe(true);
        expect(shouldRenderPlayFloorZ(1, 0)).toBe(true);
    });

    it('desenha andar inferior ocupado por entidade', () => {
        const occupied = new Set<number>([-2]);
        expect(shouldRenderPlayFloorZ(-2, 0, occupied)).toBe(true);
    });
});

describe('floorHasVisibleContentInView + shouldRenderPlayFloorZ', () => {
    it('pula andares inferiores vazios mesmo com tiles fora do viewport', () => {
        const worldMap = ensureAllFloors(createEmptyWorldMap(8));
        worldMap[-1]![0]![0] = SOLID;
        expect(
            floorHasVisibleContentInView({
                z: -1,
                startX: 2,
                endX: 5,
                startY: 2,
                endY: 5,
                playerWorldZ: 0,
                worldMap,
            })
        ).toBe(false);
    });
});
