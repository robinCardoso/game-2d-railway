import type { WebSocket } from 'ws';
import type { CreatureDiedMessage, ServerMessage } from '../../../../shared/protocol.js';
import { resolveLootEligiblePlayerIds } from '../../../../shared/lootEligibility.js';
import { grantMobAutoloot } from '../../game/grantAutoloot.js';
import {
    grantKillExperience,
    type GrantKillExperienceContext,
} from '../../game/grantKillExperience.js';
import type { RoomCreatureManager } from '../../game/RoomCreatureManager.js';
import type { ConnectedPlayer } from '../types.js';

export interface CreatureKillRewardsContext {
    creatures: RoomCreatureManager;
    room: string;
    creatureId: string;
    send: (socket: WebSocket, message: ServerMessage) => void;
    progressPersistence: GrantKillExperienceContext['progressPersistence'];
    onAfterXp?: GrantKillExperienceContext['onAfterGrant'];
    getPlayerById: (playerId: string) => ConnectedPlayer | undefined;
    getPlayersInRoom: (room: string) => ConnectedPlayer[];
}

/** XP + autoloot pessoal para cada participante elegível. */
export function applyCreatureKillRewards(
    ctx: CreatureKillRewardsContext,
    killerPlayer: ConnectedPlayer,
    diedMsg: CreatureDiedMessage
): void {
    const killData = ctx.creatures.getCreatureKillRewardData(ctx.room, ctx.creatureId);
    const lootTable = killData?.loot ?? ctx.creatures.getCreatureLoot(ctx.room, ctx.creatureId);

    let recipientIds: string[] = [];
    if (killData) {
        const candidates = ctx.getPlayersInRoom(ctx.room).map((p) => ({
            playerId: p.id,
            tileX: p.tileX,
            tileY: p.tileY,
            z: p.z,
            health: p.health,
        }));
        recipientIds = resolveLootEligiblePlayerIds(candidates, {
            creatureTile: killData.creatureTile,
            maxHealth: killData.maxHealth,
            damageByPlayer: killData.damageByPlayer,
        });
    }

    if (recipientIds.length === 0) {
        recipientIds = [killerPlayer.id];
    }

    const seen = new Set<string>();
    for (const playerId of recipientIds) {
        if (seen.has(playerId)) continue;
        seen.add(playerId);

        const player = ctx.getPlayerById(playerId);
        if (!player) continue;

        grantKillExperience(player, diedMsg.xpReward, {
            send: ctx.send,
            progressPersistence: ctx.progressPersistence,
            onAfterGrant: ctx.onAfterXp,
        });

        void grantMobAutoloot(player, lootTable, { send: ctx.send }).catch((err) => {
            console.error('[grantMobAutoloot] Falha ao conceder loot:', err);
        });
    }
}
