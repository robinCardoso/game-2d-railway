import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
    grantKillExperience,
    scaleMobKillXpReward,
} from './grantKillExperience.js';
import {
    resetServerGameRatesForTests,
    setServerGameRatesForTests,
} from '../config/gameRates.js';
import { createChatRateLimitState } from '../chat/chatService.js';
import { DEFAULT_APPEARANCE, type ConnectedPlayer } from '../gameRoom/types.js';
import { createEmptyEquipment } from '../../../shared/inventory.js';

function makePlayer(): ConnectedPlayer {
    return {
        id: 'p1',
        name: 'Hero',
        appearance: DEFAULT_APPEARANCE,
        mapId: 'mainland',
        tileX: 10,
        tileY: 10,
        z: 0,
        direction: 'south',
        level: 1,
        experience: 0,
        health: 100,
        maxHealth: 100,
        mana: 50,
        maxMana: 50,
        lastAttackAtMs: 0,
        lastMoveAcceptedAtMs: 0,
        lastObservedMoveIntervalMs: 0,
        lastMoveRejectionSentAtMs: 0,
        lastAckSeq: 0,
        spellCooldownUntil: {},
        groupCooldownUntil: {},
        equipment: createEmptyEquipment(),
        spellBar: {},
        learnedSpellIds: [],
        socket: { send: vi.fn() } as unknown as ConnectedPlayer['socket'],
        chatRateLimit: createChatRateLimitState(),
    };
}

describe('grantKillExperience', () => {
    beforeEach(() => {
        setServerGameRatesForTests({ rateExp: 2 });
    });

    afterEach(() => {
        resetServerGameRatesForTests();
    });

    it('scaleMobKillXpReward aplica rate do servidor', () => {
        expect(scaleMobKillXpReward(250)).toBe(500);
    });

    it('grantKillExperience atualiza player e envia player_progress', () => {
        const player = makePlayer();
        const send = vi.fn();
        const saveNow = vi.fn();

        const gain = grantKillExperience(player, 100, {
            send,
            progressPersistence: { saveNow } as never,
        });

        expect(gain.experience).toBe(100);
        expect(player.experience).toBe(100);
        expect(send).toHaveBeenCalledWith(
            player.socket,
            expect.objectContaining({
                type: 'player_progress',
                experience: 100,
            })
        );
    });
});
