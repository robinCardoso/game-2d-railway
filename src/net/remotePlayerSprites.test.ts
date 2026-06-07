import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../../shared/protocol';
import { RemotePlayerSpriteManager } from './remotePlayerSprites';

function makeSnapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
    return {
        playerId: 'p_test',
        name: 'TestPlayer',
        mapId: 'mainland',
        tileX: 10,
        tileY: 11,
        z: 0,
        health: 80,
        maxHealth: 100,
        mana: 120,
        maxMana: 180,
        ...overrides,
    };
}

describe('RemotePlayerSpriteManager', () => {
    it('buildRemoteDepthEntries propaga id, HP, mana e posição de tile', () => {
        const mgr = new RemotePlayerSpriteManager();
        const entries = mgr.buildRemoteDepthEntries([makeSnapshot()]);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            id: 'p_test',
            tileX: 10,
            tileY: 11,
            z: 0,
            name: 'TestPlayer',
            health: 80,
            maxHealth: 100,
            mana: 120,
            maxMana: 180,
            worldX: 320,
            worldY: 352,
        });
    });

    it('spawnFloatingDamage enfileira dano quando state visual ainda não existe', () => {
        const mgr = new RemotePlayerSpriteManager();
        mgr.spawnFloatingDamage('p_test', 12, 1000);

        const pending = (
            mgr as unknown as { pendingDamages: Map<string, { damage: number; nowMs: number }[]> }
        ).pendingDamages.get('p_test');

        expect(pending).toHaveLength(1);
        expect(pending![0]).toEqual({ damage: 12, nowMs: 1000 });
    });

    it('clear remove fila de danos pendentes', () => {
        const mgr = new RemotePlayerSpriteManager();
        mgr.spawnFloatingDamage('p_test', 5, 500);
        mgr.clear();

        const pending = (
            mgr as unknown as { pendingDamages: Map<string, unknown[]> }
        ).pendingDamages.get('p_test');

        expect(pending).toBeUndefined();
    });
});
