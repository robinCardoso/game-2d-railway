import type { WebSocket } from 'ws';
import type {
    ClientMessage,
    PlayerAppearance,
    PlayerSnapshot,
    ServerMessage,
} from '../../shared/protocol.js';
import {
    isValidTile,
    MIN_SERVER_STEP_DURATION_MS,
    parseClientMessage,
    parseStepDurationMs,
    PROTOCOL_VERSION,
    SERVER_MAP_SIZE,
} from '../../shared/protocol.js';
import { buildRoomKey } from '../../shared/roomKey.js';
import { canAdjacentStep } from '../../shared/tileWalkable.js';
import type { MapCollisionStore } from './MapCollisionStore.js';
import type { MapInstanceStore } from './MapInstanceStore.js';
import { isInstancedMap, getServerMapEntry } from './mapRegistry.js';
import { processAttack } from './combat/combat.js';
import { verifyEnterTicket } from './enterTicket.js';
import {
    clearSteppingDest,
    computeSteppingDestExpiresAtMs,
    expireStaleSteppingDest,
} from '../../shared/steppingDestReserve.js';
import { PositionPersistence } from './game/PositionPersistence.js';
import { ProgressPersistence } from './game/ProgressPersistence.js';
import { RoomCreatureManager } from './game/RoomCreatureManager.js';
import type { CreaturePresetStore } from './game/CreaturePresetStore.js';
import type { VocationStore } from './game/VocationStore.js';
import { applyExperienceGain } from '../../src/game/experience.js';
import { getLevelFromExp, calculateStatsForLevel } from '../../src/engine/character/calculateStats.js';
import type { VocationId } from '../../shared/types/character.js';
import { ZoneType } from '../../src/engine/zones.js';
import { env } from './config/env.js';
import { shouldAcceptClientProgressSync } from '../../shared/progressSyncPolicy.js';

/** Tolerância de jitter de rede no intervalo mínimo entre passos (0.85 = 15% mais rápido que o step). */
const MOVE_RATE_LIMIT_TOLERANCE = 0.85;
/** Intervalo mínimo entre `error` + `position_correction` por rejeição de movimento (anti-spam). */
const MOVE_REJECTION_THROTTLE_MS = 400;
const DEFAULT_ATTACK_COOLDOWN_MS = 550;
const RESYNC_MIN_INTERVAL_MS = 2000;

/** Intervalo entre state_sync periódico (ms). 0 = desabilitado. */
const STATE_SNAPSHOT_INTERVAL_MS = Number(process.env['PLAYER_STATE_SNAPSHOT_INTERVAL_MS'] ?? 1000);
/** Intervalo entre creature_sync periódico (ms). 0 = desabilitado. */
const CREATURE_SNAPSHOT_INTERVAL_MS_CFG = Number(process.env['CREATURE_SNAPSHOT_INTERVAL_MS'] ?? 1000);

const DEFAULT_APPEARANCE: PlayerAppearance = {
    outfitId: 'knight',
    spriteSheetUrl: 'tiles/characters/vocations/male/knight.png',
    gender: 'male',
    vocationId: 'knight',
};

interface ConnectedPlayer {
    id: string;
    name: string;
    characterId?: string;
    accountId?: string;
    direction: 'north' | 'south' | 'east' | 'west';
    appearance: PlayerAppearance;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    /** Última duração de passo reportada pelo cliente (interpolação remota). */
    lastStepDurationMs?: number;
    /** 0 = primeiro passo após join sempre aceito. */
    lastMoveAcceptedAtMs: number;
    /** Intervalo real entre os últimos passos aceitos (ms) — calibra rate limit. */
    lastObservedMoveIntervalMs: number;
    /** Última rejeição de movimento com resposta ao cliente (throttle de spam). */
    /** Tile reservado durante deslize (colisão de mobs; posição autoritativa ainda é tileX/tileY). */
    steppingDestTileX?: number;
    steppingDestTileY?: number;
    steppingDestExpiresAtMs?: number;
    level: number;
    experience: number;
    health: number;
    maxHealth: number;
    lastAttackAtMs: number;
    lastMoveRejectionSentAtMs: number;
    socket: WebSocket;
}

export interface GameRoomOptions {
    requireWsTicket?: boolean;
    positionSaveIntervalMs?: number;
    creaturePresets: CreaturePresetStore;
    vocations: VocationStore;
}

export class GameRoom {
    private players = new Map<string, ConnectedPlayer>();
    private socketToPlayerId = new Map<WebSocket, string>();
    private readonly requireWsTicket: boolean;
    private readonly positionPersistence: PositionPersistence;
    private readonly progressPersistence: ProgressPersistence;
    private readonly creatures: RoomCreatureManager;
    private readonly vocations: VocationStore;
    private readonly lastResyncRequestAtMs = new Map<string, number>();
    private snapshotTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly collision: MapCollisionStore,
        private readonly instances: MapInstanceStore,
        options: GameRoomOptions
    ) {
        this.requireWsTicket = options.requireWsTicket ?? false;
        this.vocations = options.vocations;
        this.positionPersistence = new PositionPersistence(options.positionSaveIntervalMs ?? 20_000);
        this.progressPersistence = new ProgressPersistence();
        this.creatures = new RoomCreatureManager(
            this.collision,
            options.creaturePresets,
            options.vocations,
            (room, message) => this.broadcastToRoom(room, message),
            (room) => this.playersInRoomAsRefs(room)
        );
        this.creatures.start();
        this.startPeriodicSnapshots();
    }

    private playersInRoomAsRefs(room: string): Array<{
        tileX: number;
        tileY: number;
        z: number;
        steppingDestTileX?: number;
        steppingDestTileY?: number;
    }> {
        const out: Array<{
            tileX: number;
            tileY: number;
            z: number;
            steppingDestTileX?: number;
            steppingDestTileY?: number;
        }> = [];
        for (const p of this.players.values()) {
            if (this.roomKey(p) !== room) continue;
            expireStaleSteppingDest(p);
            out.push({
                tileX: p.tileX,
                tileY: p.tileY,
                z: p.z,
                steppingDestTileX: p.steppingDestTileX,
                steppingDestTileY: p.steppingDestTileY,
            });
        }
        return out;
    }

    private sendCreatureSync(socket: WebSocket, room: string, mapId: string, instanceId?: string): void {
        const snapshots = this.creatures.ensureRoom(room, mapId, instanceId);
        this.send(socket, {
            type: 'creature_sync',
            v: PROTOCOL_VERSION,
            mapId,
            instanceId,
            creatures: snapshots,
        });
    }

    private generatePlayerId(): string {
        return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private roomKey(p: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>): string {
        return buildRoomKey(p.mapId, p.instanceId);
    }

    private send(socket: WebSocket, message: ServerMessage): void {
        if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    private broadcastToRoom(room: string, message: ServerMessage, exceptId?: string): void {
        const payload = JSON.stringify(message);
        for (const p of this.players.values()) {
            if (exceptId && p.id === exceptId) continue;
            if (this.roomKey(p) !== room) continue;
            if (p.socket.readyState === p.socket.OPEN) {
                p.socket.send(payload);
            }
        }
    }

    private playersInRoom(room: string, exceptId?: string): PlayerSnapshot[] {
        const out: PlayerSnapshot[] = [];
        for (const p of this.players.values()) {
            if (this.roomKey(p) !== room) continue;
            if (exceptId && p.id === exceptId) continue;
            out.push(this.toSnapshot(p));
        }
        return out;
    }

    private toSnapshot(p: ConnectedPlayer): PlayerSnapshot {
        return {
            playerId: p.id,
            name: p.name,
            mapId: p.mapId,
            instanceId: p.instanceId,
            tileX: p.tileX,
            tileY: p.tileY,
            z: p.z,
            direction: p.direction,
            appearance: p.appearance,
            health: p.health,
            maxHealth: p.maxHealth,
        };
    }

    private recalcPlayerMaxHealth(player: ConnectedPlayer): void {
        const vocationId = (player.appearance.vocationId || 'knight') as VocationId;
        const vocationConfig = this.vocations.get(vocationId);
        const stats = vocationConfig
            ? calculateStatsForLevel(vocationConfig, player.level)
            : { health: 100 };
        player.maxHealth = stats.health;
    }

    private isWalkable(mapId: string, tileX: number, tileY: number, z: number): boolean {
        if (!this.collision.hasTemplate(mapId)) {
            return true;
        }
        return this.collision.isWalkable(mapId, tileX, tileY, z);
    }

    private sendPositionCorrection(player: ConnectedPlayer): void {
        this.send(player.socket, {
            type: 'position_correction',
            v: PROTOCOL_VERSION,
            mapId: player.mapId,
            instanceId: player.instanceId,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
        });
    }

    /**
     * Rejeita movimento com `error` + `position_correction`.
     * Throttle é **por jogador**, não por código — ex.: `MOVEMENT_TOO_FAST` seguido de
     * `NOT_WALKABLE` em <400ms também é ignorado. Intencional: anti-spam de rejeições.
     * Debug granular futuro: `lastMoveRejectionCode` ou contador por código.
     */
    private rejectMove(
        player: ConnectedPlayer,
        code: string,
        message: string,
        logDetail?: string
    ): void {
        const now = Date.now();
        if (
            player.lastMoveRejectionSentAtMs > 0 &&
            now - player.lastMoveRejectionSentAtMs < MOVE_REJECTION_THROTTLE_MS
        ) {
            return;
        }
        player.lastMoveRejectionSentAtMs = now;
        if (logDetail) {
            console.warn(`[GameRoom] ${logDetail}`);
        }
        this.send(player.socket, {
            type: 'error',
            v: PROTOCOL_VERSION,
            code,
            message,
        });
        this.sendPositionCorrection(player);
    }

    private persistPlayerPosition(player: ConnectedPlayer, immediate = false): void {
        if (!player.characterId || !player.accountId) return;
        const loc = {
            characterId: player.characterId,
            accountId: player.accountId,
            mapId: player.mapId,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
            direction: player.direction,
            health: player.health,
        };
        if (immediate) {
            void this.positionPersistence.saveNow(loc);
            return;
        }
        this.positionPersistence.queue(loc);
    }

    handleMessage(socket: WebSocket, raw: unknown): void {
        const msg = parseClientMessage(raw);
        if (!msg) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'INVALID_MESSAGE',
                message: 'Mensagem JSON inválida ou versão incompatível.',
            });
            return;
        }

        switch (msg.type) {
            case 'join':
                this.handleJoin(socket, msg);
                break;
            case 'move':
                this.handleMove(socket, msg, false);
                break;
            case 'map_change':
                this.handleMove(socket, msg, true);
                break;
            case 'attack':
                this.handleAttack(socket, msg);
                break;
            case 'progress_sync':
                this.handleProgressSync(socket, msg);
                break;
            case 'resync_request':
                this.handleResyncRequest(socket);
                break;
            case 'ping':
                this.send(socket, { type: 'pong', v: PROTOCOL_VERSION, t: msg.t });
                break;
            case 'leave':
                this.handleDisconnect(socket);
                break;
        }
    }

    private handleJoin(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'join' }>
    ): void {
        if (this.socketToPlayerId.has(socket)) {
            this.handleDisconnect(socket);
        }

        if (this.requireWsTicket && !msg.enterTicket) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'MISSING_TICKET',
                message: 'Ticket de entrada obrigatório. Use POST /api/ws-ticket.',
            });
            return;
        }

        let joinName = msg.name.slice(0, 32) || 'Jogador';
        let characterId: string | undefined;
        let accountId: string | undefined;
        let direction: ConnectedPlayer['direction'] = msg.direction ?? 'south';
        let appearance: PlayerAppearance = msg.appearance ?? DEFAULT_APPEARANCE;
        let joinMapId = msg.mapId;
        let joinTileX = msg.tileX;
        let joinTileY = msg.tileY;
        let joinZ = msg.z;
        let joinExperience = msg.experience ?? 0;

        if (msg.enterTicket) {
            const ticket = verifyEnterTicket(msg.enterTicket);
            if (!ticket) {
                this.send(socket, {
                    type: 'error',
                    v: PROTOCOL_VERSION,
                    code: 'INVALID_TICKET',
                    message: 'Ticket de entrada inválido ou expirado.',
                });
                return;
            }
            joinName = ticket.name.slice(0, 32);
            characterId = ticket.characterId;
            accountId = ticket.accountId;
            direction = ticket.direction;
            joinMapId = ticket.mapId;
            joinTileX = ticket.tileX;
            joinTileY = ticket.tileY;
            joinZ = ticket.z;
            joinExperience = ticket.experience;
            if (ticket.appearance) {
                appearance = ticket.appearance;
            }
        }

        if (characterId) {
            for (const existing of this.players.values()) {
                if (existing.characterId === characterId && existing.socket !== socket) {
                    existing.socket.close();
                    this.handleDisconnect(existing.socket);
                }
            }
        }

        if (!isValidTile(joinMapId, joinTileX, joinTileY, joinZ)) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'INVALID_TILE',
                message: `Tile inválido (${joinTileX},${joinTileY},${joinZ}) mapa ${SERVER_MAP_SIZE}×${SERVER_MAP_SIZE}.`,
            });
            return;
        }

        let { instanceId } = msg;
        if (isInstancedMap(joinMapId)) {
            instanceId = this.instances.resolveInstanceId(joinMapId, instanceId);
        } else {
            instanceId = undefined;
        }

        const resolvedJoin = this.collision.resolveJoinPosition(
            joinMapId,
            joinTileX,
            joinTileY,
            joinZ
        );
        joinTileX = resolvedJoin.tileX;
        joinTileY = resolvedJoin.tileY;
        joinZ = resolvedJoin.z;

        if (!this.isWalkable(joinMapId, joinTileX, joinTileY, joinZ)) {
            this.send(socket, {
                type: 'error',
                v: PROTOCOL_VERSION,
                code: 'NOT_WALKABLE',
                message: 'Posição inicial não é walkable no template do mapa.',
            });
            return;
        }

        const id = msg.playerId && !this.players.has(msg.playerId)
            ? msg.playerId.slice(0, 64)
            : this.generatePlayerId();

        const room = buildRoomKey(joinMapId, instanceId);
        const roomWasEmpty = this.playersInRoom(room).length === 0;
        const joinExp = Math.max(0, Math.floor(joinExperience));
        const joinLevelFromExp = getLevelFromExp(joinExp);

        const player: ConnectedPlayer = {
            id,
            name: joinName,
            characterId,
            accountId,
            direction,
            appearance,
            mapId: joinMapId,
            instanceId,
            tileX: joinTileX,
            tileY: joinTileY,
            z: joinZ,
            lastMoveAcceptedAtMs: 0,
            lastObservedMoveIntervalMs: 0,
            lastMoveRejectionSentAtMs: 0,
            level: joinLevelFromExp,
            experience: joinExp,
            health: 100, // will be overwritten below
            maxHealth: 100,
            lastAttackAtMs: 0,
            socket,
        };

        const pVocationId = (appearance.vocationId || 'knight') as VocationId;
        const pVocationConfig = this.vocations.get(pVocationId);
        const pStats = pVocationConfig ? calculateStatsForLevel(pVocationConfig, joinLevelFromExp) : { health: 100 };
        player.maxHealth = pStats.health;
        
        // Use health from ticket if valid, otherwise default to max health
        if (msg.enterTicket) {
            const ticket = verifyEnterTicket(msg.enterTicket);
            if (ticket && ticket.health !== undefined && ticket.health !== null && ticket.health > 0) {
                player.health = Math.min(ticket.health, player.maxHealth);
            } else {
                player.health = player.maxHealth;
            }
        } else {
            player.health = player.maxHealth;
        }

        this.players.set(id, player);
        this.socketToPlayerId.set(socket, id);
        this.instances.trackPlayer(instanceId, id);

        const platformLog = msg.platform ? `[${msg.platform}]` : '[web/unknown]';
        const versionLog = msg.clientBuildVersion ? `v${msg.clientBuildVersion}` : 'v?';
        console.log(`[GameRoom] ${joinName} (${id}) entrou em ${room} ${platformLog} ${versionLog}`);

        const others = this.playersInRoom(room, id);
        const joinNowMs = Date.now();
        const creatureSnapshots = this.creatures.ensureRoom(room, joinMapId, instanceId);
        if (roomWasEmpty) {
            this.creatures.armRoomWakeDelay(room, joinNowMs);
        }

        this.send(socket, {
            type: 'welcome',
            v: PROTOCOL_VERSION,
            playerId: id,
            instanceId,
            health: player.health,
            maxHealth: player.maxHealth,
            players: others,
            creatures: creatureSnapshots,
        });

        if (
            msg.tileX !== joinTileX ||
            msg.tileY !== joinTileY ||
            msg.z !== joinZ ||
            msg.mapId !== joinMapId
        ) {
            this.sendPositionCorrection(player);
        }

        if (resolvedJoin.corrected && characterId && accountId) {
            void this.positionPersistence.saveNow({
                characterId,
                accountId,
                mapId: joinMapId,
                tileX: joinTileX,
                tileY: joinTileY,
                z: joinZ,
                direction,
            });
        }

        this.broadcastToRoom(
            room,
            {
                type: 'player_joined',
                v: PROTOCOL_VERSION,
                player: this.toSnapshot(player),
            },
            id
        );

        console.log(
            `[GameRoom] ${player.name} (${id}) → sala ${room} @ ${joinTileX},${joinTileY},${joinZ} — ${this.players.size} online`
        );
    }

    private handleMove(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'move' } | { type: 'map_change' }>,
        isMapChange: boolean
    ): void {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (!player) return;

        if (!isValidTile(msg.mapId, msg.tileX, msg.tileY, msg.z)) {
            this.rejectMove(
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
                instanceId = this.instances.resolveInstanceId(msg.mapId);
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
            if (!this.isWalkable(msg.mapId, steppingDestTileX, steppingDestTileY, msg.z)) {
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
            this.broadcastToRoom(
                this.roomKey(player),
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
                player.id
            );
            return;
        }

        clearSteppingDest(player);

        if (!this.isWalkable(msg.mapId, msg.tileX, msg.tileY, msg.z)) {
            this.rejectMove(
                player,
                'NOT_WALKABLE',
                'Movimento rejeitado: tile bloqueado.'
            );
            return;
        }

        const from = {
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
        };
        const to = { tileX: msg.tileX, tileY: msg.tileY, z: msg.z };

        if (!isMapChange) {
            const sameMap =
                player.mapId === msg.mapId &&
                player.instanceId === instanceId;
            if (
                sameMap &&
                !canAdjacentStep(from, to, (x, y, z) =>
                    this.isWalkable(msg.mapId, x, y, z)
                )
            ) {
                this.rejectMove(
                    player,
                    'INVALID_STEP',
                    'Movimento rejeitado: passo inválido (adjacente, diagonal ou canto bloqueado).'
                );
                return;
            }

            const tileChanged =
                from.tileX !== to.tileX ||
                from.tileY !== to.tileY ||
                from.z !== to.z;
            if (tileChanged) {
                const now = Date.now();
                const stepMs =
                    parseStepDurationMs(msg.stepDurationMs) ??
                    player.lastStepDurationMs ??
                    MIN_SERVER_STEP_DURATION_MS;
                const claimedMin = Math.round(stepMs * MOVE_RATE_LIMIT_TOLERANCE);
                const floorMin = Math.round(
                    MIN_SERVER_STEP_DURATION_MS * MOVE_RATE_LIMIT_TOLERANCE
                );
                let minInterval = Math.max(1, claimedMin);
                if (player.lastObservedMoveIntervalMs > 0) {
                    const observedMin = Math.round(
                        player.lastObservedMoveIntervalMs * MOVE_RATE_LIMIT_TOLERANCE
                    );
                    // Não exigir mais que o ritmo real do cliente; floorMin impede speed hack
                    minInterval = Math.min(claimedMin, Math.max(floorMin, observedMin));
                }
                const elapsed = now - player.lastMoveAcceptedAtMs;
                if (player.lastMoveAcceptedAtMs > 0 && elapsed < minInterval) {
                    this.rejectMove(
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

        const oldRoom = this.roomKey(player);
        const mapChanged =
            player.mapId !== msg.mapId || player.instanceId !== instanceId;

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

        const newRoom = this.roomKey(player);

        if (isMapChange && !isInstancedMap(player.mapId)) {
            this.persistPlayerPosition(player, true);
        } else if (!isInstancedMap(player.mapId)) {
            this.persistPlayerPosition(player);
        }

        if (
            isInstancedMap(player.mapId) &&
            player.instanceId &&
            (mapChanged || instanceId !== msg.instanceId)
        ) {
            this.send(socket, {
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

        if (mapChanged || oldRoom !== newRoom) {
            this.broadcastToRoom(
                oldRoom,
                { type: 'player_left', v: PROTOCOL_VERSION, playerId: player.id },
                player.id
            );
            this.broadcastToRoom(newRoom, payload, player.id);
            this.broadcastToRoom(
                newRoom,
                {
                    type: 'player_joined',
                    v: PROTOCOL_VERSION,
                    player: this.toSnapshot(player),
                },
                player.id
            );
            this.sendCreatureSync(player.socket, newRoom, player.mapId, player.instanceId);
        } else {
            this.broadcastToRoom(newRoom, payload, player.id);
        }

        const acceptedAt = Date.now();
        if (isMapChange || mapChanged) {
            player.lastMoveAcceptedAtMs = 0;
            player.lastObservedMoveIntervalMs = 0;
        } else {
            if (player.lastMoveAcceptedAtMs > 0) {
                player.lastObservedMoveIntervalMs =
                    acceptedAt - player.lastMoveAcceptedAtMs;
            }
            player.lastMoveAcceptedAtMs = acceptedAt;
        }
    }

    private handleProgressSync(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'progress_sync' }>
    ): void {
        if (
            !shouldAcceptClientProgressSync({
                isProduction: env.isProduction,
                allowClientProgressSync: env.allowClientProgressSync,
                requireWsTicket: this.requireWsTicket,
            })
        ) {
            return;
        }

        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;
        const player = this.players.get(playerId);
        if (!player) return;

        const clientExp = Math.max(0, Math.floor(msg.experience));
        if (clientExp <= player.experience) return;

        player.experience = clientExp;
        player.level = getLevelFromExp(clientExp);

        this.send(player.socket, {
            type: 'player_progress',
            v: PROTOCOL_VERSION,
            playerId: player.id,
            level: player.level,
            experience: player.experience,
            leveledUp: false,
        });
    }

    private handleResyncRequest(socket: WebSocket): void {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;
        const player = this.players.get(playerId);
        if (!player) return;

        const nowMs = Date.now();
        const last = this.lastResyncRequestAtMs.get(playerId) ?? 0;
        if (nowMs - last < RESYNC_MIN_INTERVAL_MS) return;
        this.lastResyncRequestAtMs.set(playerId, nowMs);

        const room = this.roomKey(player);
        this.send(socket, {
            type: 'state_sync',
            v: PROTOCOL_VERSION,
            players: this.playersInRoom(room),
        });
        this.sendCreatureSync(socket, room, player.mapId, player.instanceId);
        this.sendPositionCorrection(player);
        this.send(socket, {
            type: 'player_progress',
            v: PROTOCOL_VERSION,
            playerId: player.id,
            level: player.level,
            experience: player.experience,
            leveledUp: false,
        });
    }

    private resolveAttackCooldownMs(vocationId: VocationId, level: number): number {
        const vocationConfig = this.vocations.get(vocationId);
        if (!vocationConfig) return DEFAULT_ATTACK_COOLDOWN_MS;
        const stats = calculateStatsForLevel(vocationConfig, level);
        return Math.max(200, stats.attackSpeed || DEFAULT_ATTACK_COOLDOWN_MS);
    }

    private handleAttack(
        socket: WebSocket,
        msg: Extract<ClientMessage, { type: 'attack' }>
    ): void {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (!player) return;

        let { instanceId } = msg;
        if (isInstancedMap(msg.mapId)) {
            instanceId = player.instanceId ?? instanceId;
        } else {
            instanceId = undefined;
        }

        if (player.mapId !== msg.mapId || (player.instanceId ?? undefined) !== (instanceId ?? undefined)) {
            return;
        }

        const room = this.roomKey(player);
        const vocationId = (player.appearance.vocationId || 'knight') as VocationId;

        // PvP Attack Interception
        if (msg.creatureId.startsWith('p_')) {
            const targetPlayer = this.players.get(msg.creatureId);
            if (!targetPlayer) return;

            if (targetPlayer.mapId !== player.mapId || targetPlayer.instanceId !== player.instanceId) {
                return;
            }

            // 1. Check PvP Map Property
            const mapEntry = getServerMapEntry(player.mapId);
            if (mapEntry && mapEntry.pvpEnabled === false) {
                this.send(player.socket, {
                    type: 'error',
                    v: PROTOCOL_VERSION,
                    code: 'NO_PVP_MAP',
                    message: 'Combate PvP não é permitido neste mapa.',
                });
                return;
            }

            // 2. Check PZ (Protection Zone) for attacker
            const attackerZone = this.collision.getZoneIdAt(player.mapId, player.tileX, player.tileY, player.z);
            if (attackerZone === ZoneType.PROTECTION_ZONE) {
                this.send(player.socket, {
                    type: 'error',
                    v: PROTOCOL_VERSION,
                    code: 'ATTACKER_IN_PZ',
                    message: 'Você não pode atacar dentro de uma Protection Zone (PZ).',
                });
                return;
            }

            // 3. Check PZ (Protection Zone) for target
            const targetZone = this.collision.getZoneIdAt(targetPlayer.mapId, targetPlayer.tileX, targetPlayer.tileY, targetPlayer.z);
            if (targetZone === ZoneType.PROTECTION_ZONE) {
                this.send(player.socket, {
                    type: 'error',
                    v: PROTOCOL_VERSION,
                    code: 'TARGET_IN_PZ',
                    message: 'O alvo está dentro de uma Protection Zone (PZ).',
                });
                return;
            }

            // 4. Attack Cooldown
            const now = Date.now();
            const cooldownMs = this.resolveAttackCooldownMs(vocationId, player.level);
            if (now - player.lastAttackAtMs < cooldownMs) {
                return;
            }

            // 5. Adjacency
            const dx = Math.abs(player.tileX - targetPlayer.tileX);
            const dy = Math.abs(player.tileY - targetPlayer.tileY);
            const dz = Math.abs(player.z - targetPlayer.z);
            if (dz !== 0 || dx > 1 || dy > 1) {
                return; // Enforce adjacency for standard melee PvP for now
            }

            // 6. Resolve combat stats and process damage
            const vocationConfig = this.vocations.get(vocationId);
            if (!vocationConfig) return;

            const targetVocationId = (targetPlayer.appearance.vocationId || 'knight') as VocationId;
            const targetVocationConfig = this.vocations.get(targetVocationId);
            const targetStats = targetVocationConfig ? calculateStatsForLevel(targetVocationConfig, targetPlayer.level) : { defense: 5 };

            const damageResult = processAttack(
                {
                    id: player.id,
                    name: player.name,
                    vocation: vocationId,
                    level: player.level,
                },
                {
                    id: targetPlayer.id,
                    name: targetPlayer.name,
                    health: targetPlayer.health,
                    maxHealth: targetPlayer.maxHealth,
                    defense: targetStats.defense || 5,
                },
                'melee',
                vocationConfig
            );

            player.lastAttackAtMs = now;
            targetPlayer.health = Math.max(0, targetPlayer.health - damageResult.finalDamage);

            this.broadcastToRoom(room, {
                type: 'player_damaged',
                v: PROTOCOL_VERSION,
                playerId: targetPlayer.id,
                health: targetPlayer.health,
                maxHealth: targetPlayer.maxHealth,
                damage: damageResult.finalDamage,
                attackerPlayerId: player.id,
            });

            this.persistPlayerPosition(targetPlayer);

            if (targetPlayer.health <= 0) {
                this.broadcastToRoom(room, {
                    type: 'player_died',
                    v: PROTOCOL_VERSION,
                    playerId: targetPlayer.id,
                    killerPlayerId: player.id,
                });

                const deathZone = this.collision.getZoneIdAt(
                    targetPlayer.mapId,
                    targetPlayer.tileX,
                    targetPlayer.tileY,
                    targetPlayer.z
                );
                if (deathZone !== ZoneType.PVP_ARENA) {
                    const lostXp = Math.floor(targetPlayer.experience * 0.1);
                    targetPlayer.experience = Math.max(0, targetPlayer.experience - lostXp);
                    targetPlayer.level = getLevelFromExp(targetPlayer.experience);
                    this.recalcPlayerMaxHealth(targetPlayer);
                }

                const spawn = this.collision.getMapSpawn(targetPlayer.mapId) ?? { x: 50, y: 50, z: 0 };
                targetPlayer.tileX = spawn.x;
                targetPlayer.tileY = spawn.y;
                targetPlayer.z = spawn.z;
                targetPlayer.health = targetPlayer.maxHealth;

                if (deathZone !== ZoneType.PVP_ARENA) {
                    this.send(targetPlayer.socket, {
                        type: 'player_progress',
                        v: PROTOCOL_VERSION,
                        playerId: targetPlayer.id,
                        level: targetPlayer.level,
                        experience: targetPlayer.experience,
                        leveledUp: false,
                        health: targetPlayer.health,
                        maxHealth: targetPlayer.maxHealth,
                    });

                    if (targetPlayer.characterId && targetPlayer.accountId) {
                        void this.progressPersistence.saveNow({
                            characterId: targetPlayer.characterId,
                            accountId: targetPlayer.accountId,
                            level: targetPlayer.level,
                            experience: targetPlayer.experience,
                        });
                    }
                }

                this.broadcastToRoom(room, {
                    type: 'player_respawned',
                    v: PROTOCOL_VERSION,
                    playerId: targetPlayer.id,
                    mapId: targetPlayer.mapId,
                    instanceId: targetPlayer.instanceId,
                    tileX: spawn.x,
                    tileY: spawn.y,
                    z: spawn.z,
                    health: targetPlayer.health,
                    maxHealth: targetPlayer.maxHealth,
                });

                this.sendPositionCorrection(targetPlayer);
                this.persistPlayerPosition(targetPlayer, true);
            }
            return;
        }

        const outcome = this.creatures.processAttack(
            room,
            {
                playerId: player.id,
                tileX: player.tileX,
                tileY: player.tileY,
                z: player.z,
                level: player.level,
                vocationId,
                lastAttackAtMs: player.lastAttackAtMs,
            },
            msg.creatureId,
            Date.now(),
            this.resolveAttackCooldownMs(vocationId, player.level)
        );

        if (!outcome.ok) return;

        if (outcome.newLastAttackAtMs !== undefined) {
            player.lastAttackAtMs = outcome.newLastAttackAtMs;
        }

        if (outcome.damaged) {
            this.broadcastToRoom(room, outcome.damaged);
        }

        if (outcome.died) {
            this.broadcastToRoom(room, outcome.died);

            const gain = applyExperienceGain(player.experience, outcome.died.xpReward);
            player.experience = gain.experience;
            player.level = gain.level;

            this.send(player.socket, {
                type: 'player_progress',
                v: PROTOCOL_VERSION,
                playerId: player.id,
                level: gain.level,
                experience: gain.experience,
                leveledUp: gain.leveledUp,
            });

            if (player.characterId && player.accountId) {
                void this.progressPersistence.saveNow({
                    characterId: player.characterId,
                    accountId: player.accountId,
                    level: gain.level,
                    experience: gain.experience,
                });
            }
        }
    }

    handleDisconnect(socket: WebSocket): void {
        const playerId = this.socketToPlayerId.get(socket);
        if (!playerId) return;

        const player = this.players.get(playerId);
        const room = player ? this.roomKey(player) : '';

        if (player?.characterId) {
            this.persistPlayerPosition(player, true);
        }

        this.players.delete(playerId);
        this.socketToPlayerId.delete(socket);
        this.lastResyncRequestAtMs.delete(playerId);

        if (player) {
            this.instances.untrackPlayer(player.instanceId, playerId);
            console.log(`[GameRoom] ${player.name} (${playerId}) saiu de ${room}`);
            this.broadcastToRoom(room, {
                type: 'player_left',
                v: PROTOCOL_VERSION,
                playerId,
            });
        }
    }

    getStats(): { online: number } {
        return { online: this.players.size };
    }

    dispose(): void {
        this.stopPeriodicSnapshots();
    }

    /**
     * Inicia envio periódico de state_sync + creature_sync para todas as salas.
     * Garante que clientes Electron minimizados recebam snapshots frequentes
     * sem depender exclusivamente de resync_request.
     *
     * Não manda snapshot se a sala estiver vazia — evita processamento desnecessário.
     */
    private startPeriodicSnapshots(): void {
        if (STATE_SNAPSHOT_INTERVAL_MS <= 0 && CREATURE_SNAPSHOT_INTERVAL_MS_CFG <= 0) return;

        const interval = Math.min(
            STATE_SNAPSHOT_INTERVAL_MS > 0 ? STATE_SNAPSHOT_INTERVAL_MS : Infinity,
            CREATURE_SNAPSHOT_INTERVAL_MS_CFG > 0 ? CREATURE_SNAPSHOT_INTERVAL_MS_CFG : Infinity
        );

        if (!Number.isFinite(interval) || interval <= 0) return;

        let lastStateSyncMs = 0;
        let lastCreatureSyncMs = 0;

        this.snapshotTimer = setInterval(() => {
            if (this.players.size === 0) return;

            const now = Date.now();

            // Coleta salas com jogadores
            const rooms = new Map<string, { mapId: string; instanceId?: string; players: string[] }>();
            for (const p of this.players.values()) {
                const key = this.roomKey(p);
                if (!rooms.has(key)) {
                    rooms.set(key, { mapId: p.mapId, instanceId: p.instanceId, players: [] });
                }
                rooms.get(key)!.players.push(p.id);
            }

            const sendState = STATE_SNAPSHOT_INTERVAL_MS > 0 &&
                now - lastStateSyncMs >= STATE_SNAPSHOT_INTERVAL_MS;
            const sendCreature = CREATURE_SNAPSHOT_INTERVAL_MS_CFG > 0 &&
                now - lastCreatureSyncMs >= CREATURE_SNAPSHOT_INTERVAL_MS_CFG;

            if (!sendState && !sendCreature) return;

            for (const [room, info] of rooms) {
                if (sendState) {
                    const payload = JSON.stringify({
                        type: 'state_sync',
                        v: PROTOCOL_VERSION,
                        players: this.playersInRoom(room),
                    });
                    for (const pid of info.players) {
                        const p = this.players.get(pid);
                        if (p && p.socket.readyState === p.socket.OPEN) {
                            p.socket.send(payload);
                        }
                    }
                }

                if (sendCreature) {
                    const snapshots = this.creatures.ensureRoom(room, info.mapId, info.instanceId);
                    if (snapshots.length > 0) {
                        const payload = JSON.stringify({
                            type: 'creature_sync',
                            v: PROTOCOL_VERSION,
                            mapId: info.mapId,
                            instanceId: info.instanceId,
                            creatures: snapshots,
                        });
                        for (const pid of info.players) {
                            const p = this.players.get(pid);
                            if (p && p.socket.readyState === p.socket.OPEN) {
                                p.socket.send(payload);
                            }
                        }
                    }
                }
            }

            if (sendState) lastStateSyncMs = now;
            if (sendCreature) lastCreatureSyncMs = now;
        }, interval);
    }

    private stopPeriodicSnapshots(): void {
        if (this.snapshotTimer) {
            clearInterval(this.snapshotTimer);
            this.snapshotTimer = null;
        }
    }
}
