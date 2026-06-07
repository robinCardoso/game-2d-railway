import { describe, expect, it } from 'vitest';
import { GameEntity } from '../character/entity';
import { findMonsterAtWorldPoint, worldPointToTile } from './playCombat';

const TILE = 32;

function makeMonster(
    id: string,
    tileX: number,
    tileY: number,
    opts?: {
        worldZ?: number;
        isDead?: boolean;
        worldX?: number;
        worldY?: number;
        stepDestTileX?: number;
        stepDestTileY?: number;
    }
): GameEntity {
    return Object.assign(Object.create(GameEntity.prototype), {
        id,
        name: 'Mob',
        type: 'monster',
        isDead: opts?.isDead ?? false,
        worldZ: opts?.worldZ ?? 0,
        tileX,
        tileY,
        worldX: opts?.worldX ?? tileX * TILE,
        worldY: opts?.worldY ?? tileY * TILE,
        stepDestTileX: opts?.stepDestTileX,
        stepDestTileY: opts?.stepDestTileY,
    }) as GameEntity;
}

function worldAtTileCenter(tileX: number, tileY: number): { worldX: number; worldY: number } {
    return {
        worldX: tileX * TILE + TILE / 2,
        worldY: tileY * TILE + TILE / 2,
    };
}

describe('findMonsterAtWorldPoint (SQM Tibia)', () => {
    it('worldPointToTile converte centro do tile', () => {
        expect(worldPointToTile(5 * TILE + 16, 7 * TILE + 16, TILE)).toEqual({
            tileX: 5,
            tileY: 7,
        });
    });

    it('seleciona mob quando clique cai no SQM ocupado', () => {
        const mob = makeMonster('m1', 5, 5);
        const { worldX, worldY } = worldAtTileCenter(5, 5);
        const picked = findMonsterAtWorldPoint([mob], worldX, worldY, 0, TILE);
        expect(picked?.id).toBe('m1');
    });

    it('não seleciona mob em tile vizinho (overlap visual do sprite grande)', () => {
        const mob = makeMonster('m1', 5, 5);
        const { worldX, worldY } = worldAtTileCenter(4, 5);
        const picked = findMonsterAtWorldPoint([mob], worldX, worldY, 0, TILE);
        expect(picked).toBeNull();
    });

    it('não seleciona tile acima quando só o chapéu do sprite invade o SQM', () => {
        const mob = makeMonster('m1', 5, 6);
        const { worldX, worldY } = worldAtTileCenter(5, 5);
        const picked = findMonsterAtWorldPoint([mob], worldX, worldY, 0, TILE);
        expect(picked).toBeNull();
    });

    it('seleciona tile de destino durante passo (occupied)', () => {
        const mob = makeMonster('m1', 5, 5, {
            stepDestTileX: 6,
            stepDestTileY: 5,
            worldX: 5.5 * TILE,
            worldY: 5 * TILE,
        });

        const dest = worldAtTileCenter(6, 5);
        const pickedDest = findMonsterAtWorldPoint([mob], dest.worldX, dest.worldY, 0, TILE);
        expect(pickedDest?.id).toBe('m1');

        const origin = worldAtTileCenter(5, 5);
        const pickedOrigin = findMonsterAtWorldPoint([mob], origin.worldX, origin.worldY, 0, TILE);
        expect(pickedOrigin?.id).toBe('m1');
    });

    it('ignora mob morto ou em outro andar', () => {
        const dead = makeMonster('dead', 5, 5, { isDead: true });
        const otherZ = makeMonster('z1', 5, 5, { worldZ: 1 });

        const { worldX, worldY } = worldAtTileCenter(5, 5);
        expect(findMonsterAtWorldPoint([dead], worldX, worldY, 0, TILE)).toBeNull();
        expect(findMonsterAtWorldPoint([otherZ], worldX, worldY, 0, TILE)).toBeNull();
    });
});
