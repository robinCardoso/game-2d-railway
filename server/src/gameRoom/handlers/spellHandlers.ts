import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import { buildRoomKey } from '../../../../shared/roomKey.js';
import { listEquippedSpellIds } from '../../../../shared/spellBar.js';
import { validateCharacterSpellBar } from '../../../../shared/spellSlots.js';
import type { VocationId } from '../../../../shared/types/character.js';
import type { BroadcastCreatureEvent } from '../contextTypes.js';
import {
    grantKillExperience,
    scaleMobKillXpReward,
} from '../../game/grantKillExperience.js';
import { replaceCharacterSpellSlots } from '../../db/repositories/spellSlots.repo.js';
import { isDatabaseConfigured } from '../../db/pool.js';
import { loadServerSpellCatalog } from '../../game/serverSpellCatalog.js';
import type { ProgressPersistence } from '../../game/ProgressPersistence.js';
import type { RoomCreatureManager } from '../../game/RoomCreatureManager.js';
import type { SpellCatalogStore } from '../../game/SpellCatalogStore.js';
import type { VocationStore } from '../../game/VocationStore.js';
import { syncPlayerLearnedSpells } from '../playerLoadout.js';
import { recalcPlayerMaxStats } from '../playerVitals.js';
import { spellCastErrorMessage } from '../spellMessages.js';
import type { ConnectedPlayer } from '../types.js';

export interface SpellHandlerContext {
    getPlayerBySocket: (socket: WebSocket) => ConnectedPlayer | undefined;
    roomKey: (player: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>) => string;
    send: (socket: WebSocket, message: ServerMessage) => void;
    broadcastToRoom: (room: string, message: ServerMessage) => void;
    broadcastCreatureEvent: BroadcastCreatureEvent;
    sendPlayerResources: (player: ConnectedPlayer, force?: boolean) => void;
    creatures: RoomCreatureManager;
    spellCatalog: SpellCatalogStore;
    vocations: VocationStore;
    progressPersistence: ProgressPersistence;
}

export function handleCastSpell(
    ctx: SpellHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'cast_spell' }>
): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    const room = buildRoomKey(msg.mapId, msg.instanceId);
    if (ctx.roomKey(player) !== room) return;

    const spell = ctx.spellCatalog.getSpell(msg.spellId);
    if (!spell) {
        ctx.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: 'SPELL_NOT_FOUND',
            message: 'Magia desconhecida.',
        });
        return;
    }

    const vocationId = (player.appearance.vocationId || 'knight') as VocationId;
    const vocationConfig = ctx.vocations.get(vocationId);
    const now = Date.now();

    const outcome = ctx.creatures.processSpellCast(
        room,
        spell,
        {
            playerId: player.id,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
            level: player.level,
            vocationId,
            mana: player.mana,
            spellCooldownUntil: player.spellCooldownUntil,
            groupCooldownUntil: player.groupCooldownUntil,
            equippedSpellIds: listEquippedSpellIds(player.spellBar),
            learnedSpellIds: player.learnedSpellIds,
        },
        msg.creatureId,
        now,
        vocationConfig
    );

    if (!outcome.ok) {
        ctx.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code: outcome.code ?? 'SPELL_CAST_FAILED',
            message: spellCastErrorMessage(outcome.code),
        });
        ctx.sendPlayerResources(player, true);
        return;
    }

    if (outcome.newMana !== undefined) player.mana = outcome.newMana;
    if (outcome.spellCooldownUntil) player.spellCooldownUntil = outcome.spellCooldownUntil;
    if (outcome.groupCooldownUntil) player.groupCooldownUntil = outcome.groupCooldownUntil;
    ctx.sendPlayerResources(player);

    if (outcome.damaged) {
        ctx.broadcastCreatureEvent(room, msg.creatureId, outcome.damaged);
    }

    if (outcome.died) {
        const scaledXp = scaleMobKillXpReward(outcome.died.xpReward);
        const diedMsg = { ...outcome.died, xpReward: scaledXp };
        ctx.broadcastCreatureEvent(room, msg.creatureId, diedMsg, {
            tileX: diedMsg.tileX,
            tileY: diedMsg.tileY,
            z: diedMsg.z,
        });

        grantKillExperience(player, scaledXp, {
            send: ctx.send,
            progressPersistence: ctx.progressPersistence,
            onAfterGrant: () => {
                recalcPlayerMaxStats(player, ctx.vocations);
                ctx.sendPlayerResources(player);
                void syncPlayerLearnedSpells(player);
            },
        });
    }
}

export function handleSpellBarSync(
    ctx: Pick<SpellHandlerContext, 'getPlayerBySocket'>,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'spell_bar_sync' }>
): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    const catalogDoc = loadServerSpellCatalog();
    const validated = validateCharacterSpellBar(msg, catalogDoc, {
        vocationId: player.appearance.vocationId || 'knight',
        level: player.level,
        learnedSpellIds: player.learnedSpellIds,
    });
    if (!validated.ok) {
        console.warn(
            `[GameRoom] spell_bar_sync rejeitado para ${player.name}:`,
            validated.errors.join('; ')
        );
        return;
    }

    player.spellBar = validated.value;

    if (player.characterId && player.accountId && isDatabaseConfigured()) {
        void replaceCharacterSpellSlots(
            player.characterId,
            player.accountId,
            validated.value
        ).catch((err) => {
            console.warn(
                `[GameRoom] falha ao persistir spell bar de ${player.characterId}:`,
                err
            );
        });
    }
}
