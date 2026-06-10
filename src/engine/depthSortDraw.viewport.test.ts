import { describe, expect, it } from 'vitest';
import { GameEntity } from '../character/entity';
import {
    collectNpcDepthDrawables,
    collectRemoteDepthDrawables,
    type RemotePlayerDepthEntry,
} from './depthSortDraw';

const TILE = 32;

function makeLoadedMonster(id: string, tileX: number, tileY: number): GameEntity {
    return Object.assign(Object.create(GameEntity.prototype), {
        id,
        name: 'Mob',
        type: 'monster',
        isDead: false,
        worldZ: 0,
        tileX,
        tileY,
        worldX: tileX * TILE,
        worldY: tileY * TILE,
        animController: {
            isLoaded: true,
            image: {},
            config: { drawScale: 1 },
            currentState: 'idle',
            currentDirection: 'down',
        },
        getDrawSourceRect: () => ({ sx: 0, sy: 0, sw: 32, sh: 32, ax: 0, ay: 0 }),
        getDrawPlacement: () => ({ drawX: 0, drawY: 0, drawW: 32, drawH: 32 }),
        draw: () => {},
    }) as GameEntity;
}

function makeRemote(id: string, tileX: number, tileY: number): RemotePlayerDepthEntry {
    return {
        id,
        tileX,
        tileY,
        z: 0,
        name: 'Remote',
        worldX: tileX * TILE,
        worldY: tileY * TILE,
    };
}

describe('depthSortDraw viewport cull', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { startX: 5, endX: 15, startY: 5, endY: 15 };

    it('collectNpcDepthDrawables ignora NPCs fora do viewport', () => {
        const inside = collectNpcDepthDrawables(
            [makeLoadedMonster('near', 10, 10)],
            0,
            camera,
            TILE,
            { viewport, nowMs: 1000 }
        );
        const outside = collectNpcDepthDrawables(
            [makeLoadedMonster('far', 50, 50)],
            0,
            camera,
            TILE,
            { viewport, nowMs: 1000 }
        );

        expect(inside).toHaveLength(1);
        expect(outside).toHaveLength(0);
    });

    it('collectRemoteDepthDrawables ignora remotos fora do viewport', () => {
        const inside = collectRemoteDepthDrawables(
            [makeRemote('near', 10, 10)],
            0,
            camera,
            TILE,
            1000,
            { viewport }
        );
        const outside = collectRemoteDepthDrawables(
            [makeRemote('far', 80, 80)],
            0,
            camera,
            TILE,
            1000,
            { viewport }
        );

        expect(inside).toHaveLength(1);
        expect(outside).toHaveLength(0);
    });
});
