import type { WebSocket } from 'ws';
import type { ClientMessage, PlayerSnapshot, ServerMessage } from '../../../../shared/protocol.js';
import {
    isValidTile,
    MIN_SERVER_STEP_DURATION_MS,
    parseStepDurationMs,
    PROTOCOL_VERSION,
} from '../../../../shared/protocol.js';
import { canAdjacentStep } from '../../../../shared/tileWalkable.js';
import {
    clearSteppingDest,
    computeSteppingDestExpiresAtMs,
} from '../../../../shared/steppingDestReserve.js';
import { isInstancedMap } from '../../mapRegistry.js';
import type { MapInstanceStore } from '../../MapInstanceStore.js';
import { resolveServerPlayerStepDurationMs } from '../../game/playerMovement.js';
import type { SpectatorTile } from '../../../../shared/creatureSpectatorRange.js';
import type { ConnectedPlayer } from '../types.js';

/** Tolerância de jitter de rede no intervalo mínimo entre passos (0.85 = 15% mais rápido que o step). */
const MOVE_RATE_LIMIT_TOLERANCE = 0.85;
/** Intervalo mínimo entre `error` + `position_correction` por rejeição de movimento (anti-spam). */
const MOVE_REJECTION_THROTTLE_MS = 400;

export interface MoveHandlerContext {
    getPlayerBySocket: (socket: WebSocket) => ConnectedPlayer | undefined;
    send: (socket: WebSocket, message: ServerMessage) => void;
    broadcastToRoom: (room: string, message: ServerMessage, exceptId?: string) => void;
    broadcastToPlayerSpectators: (
        room: string,
        message: ServerMessage,
        event: SpectatorTile,
        exceptId?: string
    ) => void;
    roomKey: (player: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>) => string;
    isWalkable: (mapId: string, tileX: number, tileY: number, z: number) => boolean;
    rejectMove: (player: ConnectedPlayer, code: string, message: string, logDetail?: string) => void;
    persistPlayerPosition: (player: ConnectedPlayer, immediate?: boolean) => void;
    sendCreatureSync: (
        socket: WebSocket,
        room: string,
        mapId: string,
        instanceId?: string
    ) => void;
    toSnapshot: (player: ConnectedPlayer) => PlayerSnapshot;
    instances: MapInstanceStore;
}

export function handleMove(
    ctx: MoveHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'move' } | { type: 'map_change' }>,
    isMapChange: boolean
): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    if (!isValidTile(msg.mapId, msg.tileX, msg.tileY, msg.z)) {
        ctx.rejectMove(
            player,
            'INVALID_TILE',
            'Movimento rejeitado: coordenadas fora dos limites.'
        );
        return;
    }

    let { instanceId } = msg;
    if (isInstancedMap(msg.mapId)) {
        if (!instanceId && player.instanceId) {
            instanceId = player.instanceId;
        }
        if (!instanceId) {
            instanceId = ctx.instances.resolveInstanceId(msg.mapId);
        }
    } else {
        instanceId = undefined;
    }

    const steppingDestTileX = msg.type === 'move' ? msg.steppingDestTileX : undefined;
    const steppingDestTileY = msg.type === 'move' ? msg.steppingDestTileY : undefined;
    const isSteppingReserveOnly =
        !isMapChange &&
        msg.type === 'move' &&
        steppingDestTileX !== undefined &&
        steppingDestTileY !== undefined &&
        msg.tileX === player.tileX &&
        msg.tileY === player.tileY &&
        msg.z === player.z &&
        player.mapId === msg.mapId &&
        (player.instanceId ?? undefined) === (instanceId ?? undefined);

    if (isSteppingReserveOnly) {
        if (!isValidTile(msg.mapId, steppingDestTileX, steppingDestTileY, msg.z)) {
            return;
        }
        if (!ctx.isWalkable(msg.mapId, steppingDestTileX, steppingDestTileY, msg.z)) {
            return;
        }
        const sameDest =
            player.steppingDestTileX === steppingDestTileX &&
            player.steppingDestTileY === steppingDestTileY;
        player.steppingDestTileX = steppingDestTileX;
        player.steppingDestTileY = steppingDestTileY;
        const reserveStepMs = parseStepDurationMs(msg.stepDurationMs);
        if (reserveStepMs !== undefined) {
            player.lastStepDurationMs = reserveStepMs;
        }
        player.steppingDestExpiresAtMs = computeSteppingDestExpiresAtMs(
            reserveStepMs ?? player.lastStepDurationMs
        );
        if (msg.direction) {
            player.direction = msg.direction;
        }
        if (sameDest) {
            return;
        }
        ctx.broadcastToPlayerSpectators(
            ctx.roomKey(player),
            {
                type: 'player_moved',
                v: PROTOCOL_VERSION,
                playerId: player.id,
                tileX: steppingDestTileX,
                tileY: steppingDestTileY,
                z: player.z,
                mapId: player.mapId,
                instanceId: player.instanceId,
                direction: player.direction,
                stepDurationMs: player.lastStepDurationMs,
            },
            { tileX: steppingDestTileX, tileY: steppingDestTileY, z: player.z },
            player.id
        );
        return;
    }

    clearSteppingDest(player);

    if (!ctx.isWalkable(msg.mapId, msg.tileX, msg.tileY, msg.z)) {
        ctx.rejectMove(player, 'NOT_WALKABLE', 'Movimento rejeitado: tile bloqueado.');
        return;
    }

    const from = {
        tileX: player.tileX,
        tileY: player.tileY,
        z: player.z,
    };
    const to = { tileX: msg.tileX, tileY: msg.tileY, z: msg.z };

    if (!isMapChange) {
        const sameMap = player.mapId === msg.mapId && player.instanceId === instanceId;
        if (
            sameMap &&
            !canAdjacentStep(from, to, (x, y, z) => ctx.isWalkable(msg.mapId, x, y, z))
        ) {
            ctx.rejectMove(
                player,
                'INVALID_STEP',
                'Movimento rejeitado: passo inválido (adjacente, diagonal ou canto bloqueado).'
            );
            return;
        }

        const tileChanged =
            from.tileX !== to.tileX || from.tileY !== to.tileY || from.z !== to.z;
        if (tileChanged) {
            const now = Date.now();
            const claimedStep =
                parseStepDurationMs(msg.stepDurationMs) ??
                player.lastStepDurationMs ??
                MIN_SERVER_STEP_DURATION_MS;
            const serverFloorStep = resolveServerPlayerStepDurationMs(player);
            const stepMs = Math.max(claimedStep, serverFloorStep);
            const claimedMin = Math.round(stepMs * MOVE_RATE_LIMIT_TOLERANCE);
            const floorMin = Math.round(MIN_SERVER_STEP_DURATION_MS * MOVE_RATE_LIMIT_TOLERANCE);
            let minInterval = Math.max(1, claimedMin);
            if (player.lastObservedMoveIntervalMs > 0) {
                const observedMin = Math.round(
                    player.lastObservedMoveIntervalMs * MOVE_RATE_LIMIT_TOLERANCE
                );
                minInterval = Math.min(claimedMin, Math.max(floorMin, observedMin));
            }
            const elapsed = now - player.lastMoveAcceptedAtMs;
            if (player.lastMoveAcceptedAtMs > 0 && elapsed < minInterval) {
                ctx.rejectMove(
                    player,
                    'MOVEMENT_TOO_FAST',
                    'Movimento rejeitado: aguarde o intervalo do passo.',
                    `movimento rápido demais: ${player.name} ` +
                        `${elapsed}ms < ${minInterval}ms (step ${stepMs}ms, obs ${player.lastObservedMoveIntervalMs}ms)`
                );
                return;
            }
        }
    }

    const oldRoom = ctx.roomKey(player);
    const mapChanged = player.mapId !== msg.mapId || player.instanceId !== instanceId;

    player.mapId = msg.mapId;
    player.instanceId = instanceId;
    player.tileX = msg.tileX;
    player.tileY = msg.tileY;
    player.z = msg.z;
    if (msg.direction) {
        player.direction = msg.direction;
    }
    const stepMs = parseStepDurationMs(msg.stepDurationMs);
    if (stepMs !== undefined) {
        player.lastStepDurationMs = stepMs;
    }

    const newRoom = ctx.roomKey(player);

    if (isMapChange && !isInstancedMap(player.mapId)) {
        ctx.persistPlayerPosition(player, true);
    } else if (!isInstancedMap(player.mapId)) {
        ctx.persistPlayerPosition(player);
    }

    if (
        isInstancedMap(player.mapId) &&
        player.instanceId &&
        (mapChanged || instanceId !== msg.instanceId)
    ) {
        ctx.send(socket, {
            type: 'instance_assigned',
            v: PROTOCOL_VERSION,
            mapId: player.mapId,
            instanceId: player.instanceId,
        });
    }

    const payload: ServerMessage = {
        type: 'player_moved',
        v: PROTOCOL_VERSION,
        playerId: player.id,
        tileX: player.tileX,
        tileY: player.tileY,
        z: player.z,
        mapId: player.mapId,
        instanceId: player.instanceId,
        direction: player.direction,
        stepDurationMs: player.lastStepDurationMs,
    };

    const eventTile: SpectatorTile = {
        tileX: player.tileX,
        tileY: player.tileY,
        z: player.z,
    };

    if (mapChanged || oldRoom !== newRoom) {
        ctx.broadcastToPlayerSpectators(
            oldRoom,
            { type: 'player_left', v: PROTOCOL_VERSION, playerId: player.id },
            from,
            player.id
        );
        ctx.broadcastToPlayerSpectators(newRoom, payload, eventTile, player.id);
        ctx.broadcastToPlayerSpectators(
            newRoom,
            {
                type: 'player_joined',
                v: PROTOCOL_VERSION,
                player: ctx.toSnapshot(player),
            },
            eventTile,
            player.id
        );
        ctx.sendCreatureSync(player.socket, newRoom, player.mapId, player.instanceId);
    } else {
        ctx.broadcastToPlayerSpectators(newRoom, payload, eventTile, player.id);
    }

    const acceptedAt = Date.now();
    if (isMapChange || mapChanged) {
        player.lastMoveAcceptedAtMs = 0;
        player.lastObservedMoveIntervalMs = 0;
    } else {
        if (player.lastMoveAcceptedAtMs > 0) {
            player.lastObservedMoveIntervalMs = acceptedAt - player.lastMoveAcceptedAtMs;
        }
        player.lastMoveAcceptedAtMs = acceptedAt;
    }
}

export { MOVE_REJECTION_THROTTLE_MS };
