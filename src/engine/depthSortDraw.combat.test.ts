import { describe, expect, it } from 'vitest';
import { GameEntity } from '../character/entity';
import { collectCombatTargetRingDrawable, type RemotePlayerDepthEntry } from './depthSortDraw';

const TILE = 32;

function makeMonster(id: string, tileX: number, tileY: number): GameEntity {
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
    }) as GameEntity;
}

function makeRemote(id: string, tileX: number, tileY: number, z = 0): RemotePlayerDepthEntry {
    return {
        id,
        tileX,
        tileY,
        z,
        name: 'Remote',
        worldX: tileX * TILE,
        worldY: tileY * TILE,
    };
}

describe('collectCombatTargetRingDrawable', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const nowMs = 1000;

    it('retorna anel para monstro alvo na mesma camada Z', () => {
        const npcs = [makeMonster('spawn_1', 5, 5)];
        const drawables = collectCombatTargetRingDrawable(npcs, [], 'spawn_1', 0, camera, TILE, nowMs);
        expect(drawables).toHaveLength(1);
        expect(drawables[0].sortX).toBe(5 * TILE + TILE / 2);
    });

    it('retorna anel para jogador remoto quando não é mob', () => {
        const remotes = [makeRemote('p_remote', 8, 9)];
        const drawables = collectCombatTargetRingDrawable([], remotes, 'p_remote', 0, camera, TILE, nowMs);
        expect(drawables).toHaveLength(1);
        expect(drawables[0].sortY).toBe(9 * TILE + TILE - 0.5);
    });

    it('retorna vazio quando alvo remoto está em outro andar Z', () => {
        const remotes = [makeRemote('p_remote', 8, 9, 1)];
        const drawables = collectCombatTargetRingDrawable([], remotes, 'p_remote', 0, camera, TILE, nowMs);
        expect(drawables).toHaveLength(0);
    });

    it('prioriza mob quando id existe em npcs e remotes', () => {
        const npcs = [makeMonster('shared_id', 3, 3)];
        const remotes = [makeRemote('shared_id', 10, 10)];
        const drawables = collectCombatTargetRingDrawable(npcs, remotes, 'shared_id', 0, camera, TILE, nowMs);
        expect(drawables[0].sortX).toBe(3 * TILE + TILE / 2);
    });
});
