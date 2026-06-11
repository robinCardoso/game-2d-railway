import type { WebSocket } from 'ws';
import type { ClientMessage, PlayerSnapshot, ServerMessage } from '../../../../shared/protocol.js';
import {
    getVisualFacing,
    type Direction8,
} from '../../../../shared/movement/direction8.js';
import {
    isValidTile,
    MIN_SERVER_STEP_DURATION_MS,
    parseStepDurationMs,
    PROTOCOL_VERSION,
} from '../../../../shared/protocol.js';
import {
    clearSteppingDest,
    computeSteppingDestExpiresAtMs,
} from '../../../../shared/steppingDestReserve.js';
import { isInstancedMap } from '../../mapRegistry.js';
import type { MapInstanceStore } from '../../MapInstanceStore.js';
import { resolveServerPlayerStepDurationMs } from '../../game/playerMovement.js';
import type { SpectatorTile } from '../../../../shared/creatureSpectatorRange.js';
import type { ConnectedPlayer } from '../types.js';
import { checkMoveRateLimit } from '../movement/movementRateLimit.js';
import { getAuthoritativeStepDurationMs } from '../movement/movementTiming.js';
import {
    validatePlayerStep,
    validatePlayerStepToTile,
} from '../movement/movementValidator.js';

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
    isTileOccupied?: (
        mapId: string,
        tileX: number,
        tileY: number,
        z: number,
        exceptPlayerId?: string
    ) => boolean;
    rejectMove: (
        player: ConnectedPlayer,
        code: string,
        message: string,
        logDetail?: string,
        sendCorrection?: boolean
    ) => void;
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

function resolveMoveDirection8(
    msg: Extract<ClientMessage, { type: 'move' }>
): Direction8 | undefined {
    return msg.direction8;
}

function resolveVisualDirection(
    direction8: Direction8 | undefined,
    cardinal?: ConnectedPlayer['direction']
): ConnectedPlayer['direction'] | undefined {
    if (direction8) {
        return getVisualFacing(direction8);
    }
    return cardinal;
}

export function handleMove(
    ctx: MoveHandlerContext,
    socket: WebSocket,
    msg: Extract<ClientMessage, { type: 'move' } | { type: 'map_change' }>,
    isMapChange: boolean
): void {
    const player = ctx.getPlayerBySocket(socket);
    if (!player) return;

    const from = {
        tileX: player.tileX,
        tileY: player.tileY,
        z: player.z,
    };

    let destTileX = msg.tileX;
    let destTileY = msg.tileY;
    let destZ = msg.z;
    let moveDirection8: Direction8 | undefined;

    if (!isMapChange && msg.type === 'move') {
        moveDirection8 = resolveMoveDirection8(msg);
        if (moveDirection8) {
            if (msg.seq !== undefined && msg.seq <= player.lastAckSeq) {
                return;
            }
            const derived = validatePlayerStep({
                from,
                direction8: moveDirection8,
                isWalkable: (x, y, z) => ctx.isWalkable(msg.mapId, x, y, z),
                isOccupied: ctx.isTileOccupied
                    ? (x, y, z) =>
                          ctx.isTileOccupied!(msg.mapId, x, y, z, player.id)
                    : undefined,
            });
            if (!derived.ok) {
                ctx.rejectMove(
                    player,
                    derived.code ?? 'INVALID_STEP',
                    'Movimento rejeitado: passo inválido.',
                    undefined,
                    false
                );
                return;
            }
            destTileX = derived.to.tileX;
            destTileY = derived.to.tileY;
            destZ = derived.to.z;
        }
    }

    if (!isValidTile(msg.mapId, destTileX, destTileY, destZ)) {
        ctx.rejectMove(
            player,
            'INVALID_TILE',
            'Movimento rejeitado: coordenadas fora dos limites.',
            undefined,
            false
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
        destTileX === player.tileX &&
        destTileY === player.tileY &&
        destZ === player.z &&
        player.mapId === msg.mapId &&
        (player.instanceId ?? undefined) === (instanceId ?? undefined);

    if (isSteppingReserveOnly) {
        if (!isValidTile(msg.mapId, steppingDestTileX, steppingDestTileY, destZ)) {
            return;
        }
        if (!ctx.isWalkable(msg.mapId, steppingDestTileX, steppingDestTileY, destZ)) {
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
        const visDir = resolveVisualDirection(moveDirection8, msg.direction);
        if (visDir) {
            player.direction = visDir;
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
                direction8: moveDirection8,
                stepDurationMs: player.lastStepDurationMs,
            },
            { tileX: steppingDestTileX, tileY: steppingDestTileY, z: player.z },
            player.id
        );
        return;
    }

    clearSteppingDest(player);

    if (!ctx.isWalkable(msg.mapId, destTileX, destTileY, destZ)) {
        ctx.rejectMove(
            player,
            'NOT_WALKABLE',
            'Movimento rejeitado: tile bloqueado.',
            undefined,
            false
        );
        return;
    }

    const to = { tileX: destTileX, tileY: destTileY, z: destZ };

    if (!isMapChange) {
        const sameMap = player.mapId === msg.mapId && player.instanceId === instanceId;
        if (sameMap && !moveDirection8) {
            const stepCheck = validatePlayerStepToTile(
                from,
                to,
                (x, y, z) => ctx.isWalkable(msg.mapId, x, y, z),
                ctx.isTileOccupied
                    ? (x, y, z) =>
                          ctx.isTileOccupied!(msg.mapId, x, y, z, player.id)
                    : undefined
            );
            if (!stepCheck.ok) {
                ctx.rejectMove(
                    player,
                    stepCheck.code ?? 'INVALID_STEP',
                    'Movimento rejeitado: passo inválido (adjacente, diagonal ou canto bloqueado).',
                    undefined,
                    false
                );
                return;
            }
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
            const baseStepMs = Math.max(claimedStep, serverFloorStep);
            const stepMs = getAuthoritativeStepDurationMs(baseStepMs, moveDirection8);
            const rate = checkMoveRateLimit({
                lastMoveAcceptedAtMs: player.lastMoveAcceptedAtMs,
                lastObservedMoveIntervalMs: player.lastObservedMoveIntervalMs,
                authoritativeStepMs: stepMs,
                nowMs: now,
            });
            if (!rate.allowed) {
                ctx.rejectMove(
                    player,
                    'MOVEMENT_TOO_FAST',
                    'Movimento rejeitado: aguarde o intervalo do passo.',
                    `movimento rápido demais: ${player.name} ` +
                        `${rate.elapsedMs}ms < ${rate.minIntervalMs}ms (step ${stepMs}ms, obs ${player.lastObservedMoveIntervalMs}ms)`,
                    false
                );
                return;
            }
        }
    }

    const oldRoom = ctx.roomKey(player);
    const mapChanged = player.mapId !== msg.mapId || player.instanceId !== instanceId;

    player.mapId = msg.mapId;
    player.instanceId = instanceId;
    player.tileX = destTileX;
    player.tileY = destTileY;
    player.z = destZ;
    const visDir = resolveVisualDirection(
        moveDirection8,
        msg.direction ?? player.direction
    );
    if (visDir) {
        player.direction = visDir;
    }
    const claimedStepMs = parseStepDurationMs(msg.stepDurationMs);
    const serverFloorStep = resolveServerPlayerStepDurationMs(player);
    const baseStepMs = Math.max(
        claimedStepMs ?? player.lastStepDurationMs ?? MIN_SERVER_STEP_DURATION_MS,
        serverFloorStep
    );
    player.lastStepDurationMs = getAuthoritativeStepDurationMs(
        baseStepMs,
        moveDirection8
    );

    if (msg.type === 'move' && msg.seq !== undefined) {
        player.lastAckSeq = msg.seq;
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
        direction8: moveDirection8,
        seq: msg.type === 'move' ? msg.seq : undefined,
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

    if (!isMapChange && msg.type === 'move' && msg.seq !== undefined) {
        ctx.send(socket, payload);
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
