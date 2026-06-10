import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CreatureDiedMessage } from '../../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import type { RoomCreatureManager } from '../../game/RoomCreatureManager.js';
import type { ConnectedPlayer } from '../types.js';
import { applyCreatureKillRewards } from './creatureKillRewards.js';

const grantKillExperience = vi.fn();
const grantMobAutoloot = vi.fn().mockResolvedValue(undefined);

vi.mock('../../game/grantKillExperience.js', () => ({
    grantKillExperience: (...args: unknown[]) => grantKillExperience(...args),
}));

vi.mock('../../game/grantAutoloot.js', () => ({
    grantMobAutoloot: (...args: unknown[]) => grantMobAutoloot(...args),
}));

function mockPlayer(id: string, tileX: number, tileY: number): ConnectedPlayer {
    return {
        id,
        name: id,
        tileX,
        tileY,
        z: 0,
        health: 100,
        mapId: 'mainland',
        socket: {} as ConnectedPlayer['socket'],
    } as ConnectedPlayer;
}

const diedMsg: CreatureDiedMessage = {
    type: 'creature_died',
    v: PROTOCOL_VERSION,
    creatureId: 'mob1',
    mapId: 'mainland',
    tileX: 10,
    tileY: 10,
    z: 0,
    xpReward: 100,
    killerPlayerId: 'p2',
};

describe('applyCreatureKillRewards', () => {
    beforeEach(() => {
        grantKillExperience.mockClear();
        grantMobAutoloot.mockClear();
    });

    it('concede XP e loot a todos os elegíveis no AOI', () => {
        const p1 = mockPlayer('p1', 10, 11);
        const p2 = mockPlayer('p2', 10, 12);
        const creatures = {
            getCreatureKillRewardData: () => ({
                damageByPlayer: new Map([
                    ['p1', 50],
                    ['p2', 50],
                ]),
                maxHealth: 100,
                creatureTile: { tileX: 10, tileY: 10, z: 0 },
                loot: [{ itemId: 'gold_coin', chance: 100, quantity: 1 }],
            }),
            getCreatureLoot: () => [],
        } as unknown as RoomCreatureManager;

        applyCreatureKillRewards(
            {
                creatures,
                room: 'mainland',
                creatureId: 'mob1',
                send: vi.fn(),
                progressPersistence: {} as never,
                getPlayerById: (id) => (id === 'p1' ? p1 : id === 'p2' ? p2 : undefined),
                getPlayersInRoom: () => [p1, p2],
            },
            p2,
            diedMsg
        );

        expect(grantKillExperience).toHaveBeenCalledTimes(2);
        expect(grantMobAutoloot).toHaveBeenCalledTimes(2);
    });

    it('exclui jogador fora do AOI mesmo com dano alto', () => {
        const killer = mockPlayer('p2', 10, 12);
        const far = mockPlayer('far', 80, 80);
        const creatures = {
            getCreatureKillRewardData: () => ({
                damageByPlayer: new Map([
                    ['far', 90],
                    ['p2', 10],
                ]),
                maxHealth: 100,
                creatureTile: { tileX: 10, tileY: 10, z: 0 },
                loot: [],
            }),
            getCreatureLoot: () => [],
        } as unknown as RoomCreatureManager;

        applyCreatureKillRewards(
            {
                creatures,
                room: 'mainland',
                creatureId: 'mob1',
                send: vi.fn(),
                progressPersistence: {} as never,
                getPlayerById: (id) =>
                    id === 'p2' ? killer : id === 'far' ? far : undefined,
                getPlayersInRoom: () => [killer, far],
            },
            killer,
            diedMsg
        );

        expect(grantKillExperience).toHaveBeenCalledTimes(1);
        expect(grantKillExperience.mock.calls[0]?.[0]).toBe(killer);
    });
});
