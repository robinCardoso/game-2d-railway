import type { WebSocket } from 'ws';
import type { ServerMessage } from '../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../shared/protocol.js';
import { applyExpRate } from '../../../shared/gameRates.js';
import type { ExperienceGainResult } from '../../../src/game/experience.js';
import { applyExperienceGain } from '../../../src/game/experience.js';
import { getServerGameRates } from '../config/gameRates.js';
import type { ProgressPersistence } from './ProgressPersistence.js';
import type { ConnectedPlayer } from '../gameRoom/types.js';

export function scaleMobKillXpReward(baseXpReward: number): number {
    return applyExpRate(baseXpReward, getServerGameRates().rateExp);
}

export interface GrantKillExperienceContext {
    send: (socket: WebSocket, message: ServerMessage) => void;
    progressPersistence: ProgressPersistence;
    /** Ex.: recalc mana/HP após level up em spell kill. */
    onAfterGrant?: (player: ConnectedPlayer, gain: ExperienceGainResult) => void;
}

/** Aplica XP escalado, persiste e notifica o cliente. */
export function grantKillExperience(
    player: ConnectedPlayer,
    scaledXpReward: number,
    ctx: GrantKillExperienceContext
): ExperienceGainResult {
    const gain = applyExperienceGain(player.experience, scaledXpReward);
    player.experience = gain.experience;
    player.level = gain.level;

    ctx.send(player.socket, {
        type: 'player_progress',
        v: PROTOCOL_VERSION,
        playerId: player.id,
        level: gain.level,
        experience: gain.experience,
        leveledUp: gain.leveledUp,
    });

    if (player.characterId && player.accountId) {
        void ctx.progressPersistence.saveNow({
            characterId: player.characterId,
            accountId: player.accountId,
            level: gain.level,
            experience: gain.experience,
        });
    }

    ctx.onAfterGrant?.(player, gain);
    return gain;
}
