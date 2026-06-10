import type { ChatPlayerChannel } from '../../shared/chatConfig';
import type {
    ChatBroadcastMessage,
    ClientMessage,
    CreatureSnapshot,
    PlayerAppearance,
    PlayerSnapshot,
    ServerMessage,
} from '../../shared/protocol';
import { PROTOCOL_VERSION } from '../../shared/protocol';
import { sameRoom } from '../../shared/roomKey';
import { getMapEntry } from '../engine/mapRegistry';
import { recordPlayWsMessage } from '../game/debug/playPerformanceMonitor';
import { applyServerMessageToStore, recordPingSent, resetServerStateStore } from './serverStateStore';
import { detectRuntimePlatform } from '../game/runtime/platform';
import { getClientRuntimeConfig } from '../game/runtime/runtimeEnv';

export type NetStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Railway encerra WS após 15 min — reconectar proativamente antes disso. */
const PROACTIVE_RECONNECT_MS = 13 * 60 * 1000;
const PROACTIVE_CHECK_MS = 60_000;

export interface GameNetClientOptions {
    url: string;
    getEnterTicket?: () => string | undefined;
    /** Renova ticket antes de reconectar (Fase C). */
    refreshEnterTicket?: () => Promise<string | undefined>;
    getLocalState: () => {
        name: string;
        mapId: string;
        instanceId?: string | null;
        tileX: number;
        tileY: number;
        z: number;
        direction?: 'north' | 'south' | 'east' | 'west';
        appearance?: PlayerAppearance;
        stepDurationMs?: number;
        steppingDestTileX?: number;
        steppingDestTileY?: number;
        level?: number;
        experience?: number;
        spellBar?: { slot1?: string; slot2?: string; slot3?: string };
    };
    onStatusChange?: (status: NetStatus) => void;
    /** Servidor atribuiu instanceId (dungeon instanciada). */
    onServerInstanceId?: (instanceId: string | undefined) => void;
    /** Deslize em andamento — adia sync só de direção (tile ainda não mudou). */
    isMovementStepping?: () => boolean;
    /** Servidor corrigiu posição após movimento inválido. */
    onPositionCorrection?: (pos: {
        mapId: string;
        instanceId?: string;
        tileX: number;
        tileY: number;
        z: number;
    }) => void;
    /** Snapshot inicial ou resync de criaturas da sala. */
    onCreatureSync?: (payload: {
        mapId: string;
        instanceId?: string;
        creatures: CreatureSnapshot[];
    }) => void;
    /** Passo autoritativo de uma criatura. */
    onCreatureMoved?: (payload: {
        creatureId: string;
        mapId: string;
        instanceId?: string;
        tileX: number;
        tileY: number;
        z: number;
        direction?: CreatureSnapshot['direction'];
        stepDurationMs?: number;
    }) => void;
    onCreatureDamaged?: (payload: {
        creatureId: string;
        mapId: string;
        instanceId?: string;
        health: number;
        maxHealth: number;
        damage: number;
        attackerPlayerId?: string;
    }) => void;
    onAttackMiss?: (payload: {
        creatureId: string;
        mapId: string;
        instanceId?: string;
        code?: string;
    }) => void;
    onCreatureDied?: (payload: {
        creatureId: string;
        mapId: string;
        instanceId?: string;
        tileX: number;
        tileY: number;
        z: number;
        xpReward: number;
        killerPlayerId?: string;
    }) => void;
    onCreatureRespawned?: (payload: {
        creatureId: string;
        mapId: string;
        instanceId?: string;
        tileX: number;
        tileY: number;
        z: number;
        health: number;
        maxHealth: number;
    }) => void;
    onPlayerProgress?: (payload: {
        playerId: string;
        level: number;
        experience: number;
        leveledUp?: boolean;
        health?: number;
        maxHealth?: number;
    }) => void;
    onPlayerResources?: (payload: {
        playerId: string;
        health: number;
        maxHealth: number;
        mana: number;
        maxMana: number;
    }) => void;
    onPlayerDamaged?: (payload: {
        playerId: string;
        health: number;
        maxHealth: number;
        damage: number;
        attackerPlayerId?: string;
    }) => void;
    onPlayerDied?: (payload: {
        playerId: string;
        killerPlayerId?: string;
    }) => void;
    onPlayerRespawned?: (payload: {
        playerId: string;
        mapId: string;
        instanceId?: string;
        tileX: number;
        tileY: number;
        z: number;
        health: number;
        maxHealth: number;
        mana?: number;
        maxMana?: number;
    }) => void;
    onServerError?: (payload: { code: string; message: string; retryAfterMs?: number }) => void;
    onChatMessage?: (msg: ChatBroadcastMessage) => void;
    /** Após `welcome` — sincronizar XP local com o servidor (dev/mock). */
    onWelcome?: (payload: { health: number; maxHealth: number }) => void;
}

/**
 * Cliente WebSocket — join, salas mapId@instanceId, sync de tile.
 */
export class GameNetClient {
    private ws: WebSocket | null = null;
    private status: NetStatus = 'disconnected';
    private localPlayerId: string | null = null;
    /** instanceId da sala de rede (pode vir do servidor em mapas instanciados). */
    private networkInstanceId: string | undefined;
    private remotePlayers = new Map<string, PlayerSnapshot>();
    private lastSynced = {
        mapId: '',
        instanceId: undefined as string | undefined,
        tileX: -1,
        tileY: -1,
        z: -999,
        direction: undefined as 'north' | 'south' | 'east' | 'west' | undefined,
        steppingDestTileX: undefined as number | undefined,
        steppingDestTileY: undefined as number | undefined,
    };
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private proactiveTimer: ReturnType<typeof setInterval> | null = null;
    private connectedAt = 0;
    private shouldReconnect = false;
    private isProactiveReconnect = false;

    constructor(private readonly options: GameNetClientOptions) {}

    getStatus(): NetStatus {
        return this.status;
    }

    getLocalPlayerId(): string | null {
        return this.localPlayerId;
    }

    getNetworkInstanceId(): string | undefined {
        return this.networkInstanceId;
    }

    getRemotePlayers(mapId: string, instanceId?: string | null): PlayerSnapshot[] {
        const local = {
            mapId,
            instanceId: instanceId ?? this.networkInstanceId ?? undefined,
        };
        return [...this.remotePlayers.values()].filter(
            (p) =>
                p.playerId !== this.localPlayerId &&
                sameRoom(
                    { mapId: p.mapId, instanceId: p.instanceId },
                    local
                )
        );
    }

    isConnected(): boolean {
        return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
    }

    /** Intenção de ataque melee — combate autoritativo (Fase 3). */
    sendAttack(creatureId: string, mapId: string, instanceId?: string | null): void {
        if (!this.isConnected()) return;
        this.send({
            type: 'attack',
            v: PROTOCOL_VERSION,
            creatureId,
            mapId,
            instanceId: instanceId ?? this.networkInstanceId ?? undefined,
        });
    }

    /** Conjura magia em criatura — combate autoritativo (spell system). */
    sendCastSpell(
        spellId: string,
        creatureId: string,
        mapId: string,
        instanceId?: string | null
    ): void {
        if (!this.isConnected()) return;
        this.send({
            type: 'cast_spell',
            v: PROTOCOL_VERSION,
            spellId,
            creatureId,
            mapId,
            instanceId: instanceId ?? this.networkInstanceId ?? undefined,
        });
    }

    sendProgressSync(level: number, experience: number): void {
        if (!this.isConnected()) return;
        this.send({
            type: 'progress_sync',
            v: PROTOCOL_VERSION,
            level: Math.max(1, Math.floor(level)),
            experience: Math.max(0, Math.floor(experience)),
        });
    }

    sendSpellBarSync(spellBar: {
        slot1?: string;
        slot2?: string;
        slot3?: string;
    }): void {
        if (!this.isConnected()) return;
        this.send({
            type: 'spell_bar_sync',
            v: PROTOCOL_VERSION,
            slot1: spellBar.slot1,
            slot2: spellBar.slot2,
            slot3: spellBar.slot3,
        });
    }

    /** Pede snapshot da sala após aba voltar ao foco (creature_sync + state_sync). */
    requestRoomResync(): void {
        if (!this.isConnected()) return;
        this.send({ type: 'resync_request', v: PROTOCOL_VERSION });
    }

    sendChat(channel: ChatPlayerChannel, text: string): void {
        if (!this.isConnected()) return;
        const trimmed = text.trim();
        if (!trimmed) return;
        this.send({
            type: 'chat_send',
            v: PROTOCOL_VERSION,
            channel,
            text: trimmed,
        });
    }

    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
            return;
        }
        this.shouldReconnect = true;
        this.setStatus('connecting');

        const ws = new WebSocket(this.options.url);
        this.ws = ws;

        ws.onopen = () => {
            this.connectedAt = Date.now();
            this.setStatus('connected');
            this.startProactiveReconnectWatch();
            this.sendJoin();
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(String(ev.data)) as ServerMessage;
                this.handleServerMessage(msg);
            } catch (err) {
                console.warn('[GameNet] mensagem inválida:', err);
            }
        };

        ws.onerror = () => this.setStatus('error');

        ws.onclose = () => {
            this.stopProactiveReconnectWatch();
            this.ws = null;
            this.localPlayerId = null;
            this.networkInstanceId = undefined;
            this.remotePlayers.clear();
            this.connectedAt = 0;
            resetServerStateStore();
            this.setStatus('disconnected');

            if (this.isProactiveReconnect) {
                this.isProactiveReconnect = false;
                void this.reconnectWithFreshTicket();
                return;
            }
            this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.shouldReconnect = false;
        this.stopProactiveReconnectWatch();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({ type: 'leave', v: PROTOCOL_VERSION });
        }
        this.ws?.close();
        this.ws = null;
        this.localPlayerId = null;
        this.networkInstanceId = undefined;
        this.remotePlayers.clear();
        this.connectedAt = 0;
        this.setStatus('disconnected');
    }

    /** Chamar após movimento ou troca de mapa no loop do jogo. */
    syncPositionIfChanged(): void {
        if (!this.isConnected()) return;

        const state = this.options.getLocalState();
        const instanceId = state.instanceId ?? this.networkInstanceId ?? undefined;
        const {
            mapId,
            tileX,
            tileY,
            z,
            direction,
            stepDurationMs,
            steppingDestTileX,
            steppingDestTileY,
        } = state;
        const last = this.lastSynced;

        const tileChanged =
            last.tileX !== tileX || last.tileY !== tileY || last.z !== z;
        const directionChanged = last.direction !== direction;
        const steppingDestChanged =
            last.steppingDestTileX !== steppingDestTileX ||
            last.steppingDestTileY !== steppingDestTileY;

        if (
            last.mapId === mapId &&
            last.instanceId === instanceId &&
            !tileChanged &&
            !directionChanged &&
            !steppingDestChanged
        ) {
            return;
        }

        // Durante deslize: não envia mudança só de direção (evita divergência com servidor)
        if (
            this.options.isMovementStepping?.() &&
            !tileChanged &&
            directionChanged
        ) {
            return;
        }

        const mapChanged = last.mapId !== '' && (last.mapId !== mapId || last.instanceId !== instanceId);
        if (mapChanged && !getMapEntry(mapId)?.instanced) {
            this.networkInstanceId = undefined;
        }
        if (mapChanged) {
            this.send({
                type: 'map_change',
                v: PROTOCOL_VERSION,
                mapId,
                instanceId,
                tileX,
                tileY,
                z,
                direction,
                stepDurationMs,
            });
        } else {
            this.send({
                type: 'move',
                v: PROTOCOL_VERSION,
                mapId,
                instanceId,
                tileX,
                tileY,
                z,
                direction,
                stepDurationMs,
                steppingDestTileX,
                steppingDestTileY,
            });
        }

        this.lastSynced = {
            mapId,
            instanceId,
            tileX,
            tileY,
            z,
            direction,
            steppingDestTileX,
            steppingDestTileY,
        };
    }

    private async reconnectWithFreshTicket(): Promise<void> {
        if (this.options.refreshEnterTicket) {
            try {
                await this.options.refreshEnterTicket();
            } catch (err) {
                console.warn('[GameNet] falha ao renovar ticket WS:', err);
            }
        }
        this.connect();
    }

    private startProactiveReconnectWatch(): void {
        this.stopProactiveReconnectWatch();
        this.proactiveTimer = setInterval(() => {
            if (!this.isConnected() || !this.connectedAt) return;
            if (Date.now() - this.connectedAt < PROACTIVE_RECONNECT_MS) return;
            console.log('[GameNet] reconexão proativa antes do limite Railway (15 min)');
            this.isProactiveReconnect = true;
            this.ws?.close();
        }, PROACTIVE_CHECK_MS);
    }

    private stopProactiveReconnectWatch(): void {
        if (this.proactiveTimer) {
            clearInterval(this.proactiveTimer);
            this.proactiveTimer = null;
        }
    }

    private scheduleReconnect(): void {
        if (!this.shouldReconnect || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) {
                void this.reconnectWithFreshTicket();
            }
        }, 3000);
    }

    private setStatus(status: NetStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.options.onStatusChange?.(status);
    }

    private sendJoin(): void {
        const state = this.options.getLocalState();
        const instanceId = state.instanceId ?? this.networkInstanceId ?? undefined;
        this.lastSynced = {
            mapId: '',
            instanceId: undefined,
            tileX: -1,
            tileY: -1,
            z: -999,
            direction: undefined,
            steppingDestTileX: undefined,
            steppingDestTileY: undefined,
        };
        this.send({
            type: 'join',
            v: PROTOCOL_VERSION,
            name: state.name,
            mapId: state.mapId,
            instanceId,
            enterTicket: this.options.getEnterTicket?.(),
            tileX: state.tileX,
            tileY: state.tileY,
            z: state.z,
            direction: state.direction,
            appearance: state.appearance,
            level: state.level,
            experience: state.experience,
            platform: detectRuntimePlatform(),
            clientBuildVersion: getClientRuntimeConfig().buildVersion,
            spellBar: state.spellBar,
        });
    }

    private send(msg: ClientMessage): void {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        if (msg.type === 'ping') {
            recordPingSent(msg.t);
        }
        this.ws.send(JSON.stringify(msg));
    }

    private handleServerMessage(msg: ServerMessage): void {
        if (msg.v !== PROTOCOL_VERSION) {
            console.warn('[GameNet] versão de protocolo incompatível:', msg.v);
            return;
        }

        // Aplica estado autoritativo ANTES dos callbacks — garante consistência
        // mesmo se o render loop estiver pausado (Electron minimizado, browser throttlado).
        applyServerMessageToStore(msg);
        recordPlayWsMessage(msg.type);

        switch (msg.type) {
            case 'welcome':
                this.localPlayerId = msg.playerId;
                if (msg.instanceId) {
                    this.networkInstanceId = msg.instanceId;
                    this.options.onServerInstanceId?.(msg.instanceId);
                }
                this.remotePlayers.clear();
                for (const p of msg.players) {
                    this.remotePlayers.set(p.playerId, p);
                }
                {
                    const s = this.options.getLocalState();
                    const instanceId = s.instanceId ?? this.networkInstanceId;
                    this.lastSynced = {
                        mapId: s.mapId,
                        instanceId,
                        tileX: s.tileX,
                        tileY: s.tileY,
                        z: s.z,
                        direction: s.direction,
                        steppingDestTileX: s.steppingDestTileX,
                        steppingDestTileY: s.steppingDestTileY,
                    };
                }
                console.log(
                    `[GameNet] conectado como ${msg.playerId}` +
                        (msg.instanceId ? ` · sala inst_${msg.instanceId.slice(-8)}` : '') +
                        ` · ${msg.players.length} jogador(es) na sala` +
                        (msg.creatures ? ` · ${msg.creatures.length} criatura(s)` : '')
                );
                if (msg.creatures) {
                    const s = this.options.getLocalState();
                    this.options.onCreatureSync?.({
                        mapId: s.mapId,
                        instanceId: msg.instanceId ?? s.instanceId ?? undefined,
                        creatures: msg.creatures,
                    });
                }
                this.options.onWelcome?.({
                    health: msg.health,
                    maxHealth: msg.maxHealth,
                });
                break;
            case 'instance_assigned':
                this.networkInstanceId = msg.instanceId;
                this.options.onServerInstanceId?.(msg.instanceId);
                this.lastSynced.instanceId = msg.instanceId;
                console.log(
                    `[GameNet] sala instanciada: …${msg.instanceId.slice(-8)} (${msg.mapId})`
                );
                break;
            case 'player_joined':
                this.remotePlayers.set(msg.player.playerId, msg.player);
                break;
            case 'player_left':
                this.remotePlayers.delete(msg.playerId);
                break;
            case 'player_moved': {
                const existing = this.remotePlayers.get(msg.playerId);
                if (existing) {
                    existing.tileX = msg.tileX;
                    existing.tileY = msg.tileY;
                    existing.z = msg.z;
                    existing.mapId = msg.mapId;
                    existing.instanceId = msg.instanceId;
                    if (msg.direction) {
                        existing.direction = msg.direction;
                    }
                    if (msg.stepDurationMs !== undefined) {
                        existing.stepDurationMs = msg.stepDurationMs;
                    }
                } else {
                    this.remotePlayers.set(msg.playerId, {
                        playerId: msg.playerId,
                        name: 'Jogador',
                        mapId: msg.mapId,
                        instanceId: msg.instanceId,
                        tileX: msg.tileX,
                        tileY: msg.tileY,
                        z: msg.z,
                    });
                }
                break;
            }
            case 'state_sync':
                this.remotePlayers.clear();
                for (const p of msg.players) {
                    if (p.playerId !== this.localPlayerId) {
                        this.remotePlayers.set(p.playerId, p);
                    }
                }
                break;
            case 'position_correction':
                this.lastSynced = {
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                    direction: this.lastSynced.direction,
                    steppingDestTileX: undefined,
                    steppingDestTileY: undefined,
                };
                this.options.onPositionCorrection?.({
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                });
                break;
            case 'error':
                console.warn(`[GameNet] ${msg.code}: ${msg.message}`);
                this.options.onServerError?.({
                    code: msg.code,
                    message: msg.message,
                    retryAfterMs: msg.retryAfterMs,
                });
                break;
            case 'chat_message':
                this.options.onChatMessage?.(msg);
                break;
            case 'pong':
                break;
            case 'creature_sync': {
                this.options.onCreatureSync?.({
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    creatures: msg.creatures,
                });
                break;
            }
            case 'creature_moved':
                this.options.onCreatureMoved?.({
                    creatureId: msg.creatureId,
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                    direction: msg.direction,
                    stepDurationMs: msg.stepDurationMs,
                });
                break;
            case 'creature_damaged':
                this.options.onCreatureDamaged?.({
                    creatureId: msg.creatureId,
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    health: msg.health,
                    maxHealth: msg.maxHealth,
                    damage: msg.damage,
                    attackerPlayerId: msg.attackerPlayerId,
                });
                break;
            case 'attack_miss':
                this.options.onAttackMiss?.({
                    creatureId: msg.creatureId,
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    code: msg.code,
                });
                break;
            case 'creature_died':
                this.options.onCreatureDied?.({
                    creatureId: msg.creatureId,
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                    xpReward: msg.xpReward,
                    killerPlayerId: msg.killerPlayerId,
                });
                break;
            case 'creature_respawned':
                this.options.onCreatureRespawned?.({
                    creatureId: msg.creatureId,
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                    health: msg.health,
                    maxHealth: msg.maxHealth,
                });
                break;
            case 'player_progress':
                if (msg.playerId === this.localPlayerId) {
                    this.options.onPlayerProgress?.({
                        playerId: msg.playerId,
                        level: msg.level,
                        experience: msg.experience,
                        leveledUp: msg.leveledUp,
                        health: msg.health,
                        maxHealth: msg.maxHealth,
                    });
                }
                break;
            case 'player_resources':
                if (msg.playerId === this.localPlayerId) {
                    this.options.onPlayerResources?.({
                        playerId: msg.playerId,
                        health: msg.health,
                        maxHealth: msg.maxHealth,
                        mana: msg.mana,
                        maxMana: msg.maxMana,
                    });
                }
                break;
            case 'player_damaged': {
                const existing = this.remotePlayers.get(msg.playerId);
                if (existing) {
                    existing.health = msg.health;
                    existing.maxHealth = msg.maxHealth;
                }
                this.options.onPlayerDamaged?.({
                    playerId: msg.playerId,
                    health: msg.health,
                    maxHealth: msg.maxHealth,
                    damage: msg.damage,
                    attackerPlayerId: msg.attackerPlayerId,
                });
                break;
            }
            case 'player_died': {
                const existing = this.remotePlayers.get(msg.playerId);
                if (existing) {
                    existing.health = 0;
                }
                this.options.onPlayerDied?.({
                    playerId: msg.playerId,
                    killerPlayerId: msg.killerPlayerId,
                });
                break;
            }
            case 'player_respawned': {
                const existing = this.remotePlayers.get(msg.playerId);
                if (existing) {
                    existing.tileX = msg.tileX;
                    existing.tileY = msg.tileY;
                    existing.z = msg.z;
                    existing.mapId = msg.mapId;
                    existing.instanceId = msg.instanceId;
                    existing.health = msg.health;
                    existing.maxHealth = msg.maxHealth;
                    if (msg.mana !== undefined) existing.mana = msg.mana;
                    if (msg.maxMana !== undefined) existing.maxMana = msg.maxMana;
                } else {
                    this.remotePlayers.set(msg.playerId, {
                        playerId: msg.playerId,
                        name: '',
                        mapId: msg.mapId,
                        instanceId: msg.instanceId,
                        tileX: msg.tileX,
                        tileY: msg.tileY,
                        z: msg.z,
                        health: msg.health,
                        maxHealth: msg.maxHealth,
                        mana: msg.mana,
                        maxMana: msg.maxMana,
                    });
                }
                this.options.onPlayerRespawned?.({
                    playerId: msg.playerId,
                    mapId: msg.mapId,
                    instanceId: msg.instanceId,
                    tileX: msg.tileX,
                    tileY: msg.tileY,
                    z: msg.z,
                    health: msg.health,
                    maxHealth: msg.maxHealth,
                    mana: msg.mana,
                    maxMana: msg.maxMana,
                });
                break;
            }
        }
    }
}
