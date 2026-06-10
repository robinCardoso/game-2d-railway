import { describe, expect, it } from 'vitest';
import { GameEntity } from '../character/entity';
import { isPlayerInAttackRange, resolvePlayerAttackProfile } from '../../shared/playerAttack';
import { resolveAuthoritativeMonsterTile, resolveMonsterTileForAttackRange } from './playCombat';

const TILE = 32;

function makeMonster(
    id: string,
    tileX: number,
    tileY: number,
    opts?: { worldX?: number; worldY?: number; worldZ?: number }
): GameEntity {
    return Object.assign(Object.create(GameEntity.prototype), {
        id,
        name: 'Mob',
        type: 'monster',
        isDead: false,
        worldZ: opts?.worldZ ?? 0,
        tileX,
        tileY,
        worldX: opts?.worldX ?? tileX * TILE,
        worldY: opts?.worldY ?? tileY * TILE,
    }) as GameEntity;
}

describe('resolveMonsterTileForAttackRange', () => {
    it('usa tile autoritativo quando informado (deslize visual ≠ servidor)', () => {
        const mob = makeMonster('m1', 12, 10, {
            worldX: 11 * TILE,
            worldY: 10 * TILE,
        });

        const foot = resolveMonsterTileForAttackRange(mob);
        expect(foot).toEqual({ tileX: 11, tileY: 10, z: 0 });

        const auth = resolveMonsterTileForAttackRange(mob, { tileX: 12, tileY: 10, z: 0 });
        expect(auth).toEqual({ tileX: 12, tileY: 10, z: 0 });
    });

    it('tile autoritativo afasta alcance melee como no servidor', () => {
        const mob = makeMonster('m1', 12, 10, {
            worldX: 11 * TILE,
            worldY: 10 * TILE,
        });
        const player = { tileX: 10, tileY: 10, z: 0 };
        const profile = resolvePlayerAttackProfile('knight');

        const footTile = resolveMonsterTileForAttackRange(mob);
        const authTile = resolveMonsterTileForAttackRange(mob, { tileX: 12, tileY: 10, z: 0 });

        expect(
            isPlayerInAttackRange(player, { tileX: footTile.tileX, tileY: footTile.tileY, z: 0 }, profile)
        ).toBe(true);
        expect(
            isPlayerInAttackRange(player, { tileX: authTile.tileX, tileY: authTile.tileY, z: 0 }, profile)
        ).toBe(false);
    });

    it('tile autoritativo permite alcance melee quando pé visual ainda está longe (deslize)', () => {
        const mob = makeMonster('m1', 11, 10, {
            worldX: 12 * TILE,
            worldY: 10 * TILE,
        });
        const player = { tileX: 10, tileY: 10, z: 0 };
        const meleeSpellProfile = { attackType: 'melee' as const, range: 1, requiresLineOfSight: false };

        const footTile = resolveMonsterTileForAttackRange(mob);
        const authTile = resolveAuthoritativeMonsterTile(mob, {
            multiplayerConfigured: true,
            wsConnected: true,
            sendAttack: () => {},
            getCreatureAuthoritativeTile: () => ({ tileX: 11, tileY: 10, z: 0 }),
        });

        expect(
            isPlayerInAttackRange(player, { tileX: footTile.tileX, tileY: footTile.tileY, z: 0 }, meleeSpellProfile)
        ).toBe(false);
        expect(
            isPlayerInAttackRange(player, { tileX: authTile.tileX, tileY: authTile.tileY, z: 0 }, meleeSpellProfile)
        ).toBe(true);
    });
});
