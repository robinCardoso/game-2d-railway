/**
 * Protocolo WebSocket — Fase 2 (localhost).
 * Compartilhado entre `server/` e `src/net/` (cliente).
 */

import { isChatPlayerChannel, parseChatSendText } from './chatConfig.js';
import { buildRoomKey } from './roomKey.js';
import { parseSpellBar } from './spellBar.js';
import type { ChatChannel, ChatMessageKind, ChatPlayerChannel } from './chatConfig.js';
import type { Gender } from './types/character.js';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_WS_PORT = 8787;

/** Limites alinhados à engine (validação no servidor). */
export const SERVER_MAP_SIZE = 256;
export const SERVER_MIN_Z = -7;
export const SERVER_MAX_Z = 7;

export type ClientMessage =
    | JoinMessage
    | MoveMessage
    | MapChangeMessage
    | AttackMessage
    | CastSpellMessage
    | ProgressSyncMessage
    | ResyncRequestMessage
    | PingMessage
    | LeaveMessage
    | ChatSendMessage
    | SpellBarSyncMessage;

export type ServerMessage =
    | WelcomeMessage
    | InstanceAssignedMessage
    | PlayerJoinedMessage
    | PlayerLeftMessage
    | PlayerMovedMessage
    | CreatureSyncMessage
    | CreatureMovedMessage
    | CreatureDamagedMessage
    | CreatureDiedMessage
    | CreatureRespawnedMessage
    | PlayerProgressMessage
    | StateSyncMessage
    | PositionCorrectionMessage
    | ErrorMessage
    | PongMessage
    | PlayerDamagedMessage
    | PlayerDiedMessage
    | PlayerRespawnedMessage
    | AttackMissMessage
    | PlayerResourcesMessage
    | ChatBroadcastMessage;

export interface PlayerAppearance {
    outfitId: string;
    spriteSheetUrl: string;
    gender: Gender;
    vocationId: string;
}

export type CreatureType = 'monster' | 'npc';

export interface CreatureSnapshot {
    /** ID estável do spawn no mapa (ex.: spawn_1780686038012_346). */
    creatureId: string;
    name: string;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    direction?: 'north' | 'south' | 'east' | 'west';
    stepDurationMs?: number;
    creatureType: CreatureType;
    /** Estado de combate autoritativo (Fase 3). */
    health?: number;
    maxHealth?: number;
    isDead?: boolean;
}

export interface PlayerSnapshot {
    playerId: string;
    name: string;
    /** mapId lógico (template / overworld). */
    mapId: string;
    /** Presente em dungeons instanciadas — sala = mapId@instanceId. */
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    direction?: 'north' | 'south' | 'east' | 'west';
    appearance?: PlayerAppearance;
    /** Última duração do passo em ms (interpolação remota). */
    stepDurationMs?: number;
    health?: number;
    maxHealth?: number;
    mana?: number;
    maxMana?: number;
}

export interface JoinMessage {
    type: 'join';
    v: number;
    playerId?: string;
    name: string;
    mapId: string;
    instanceId?: string;
    /** Ticket HMAC — quando presente, servidor usa nome/account/posição do ticket. */
    enterTicket?: string;
    tileX: number;
    tileY: number;
    z: number;
    direction?: 'north' | 'south' | 'east' | 'west';
    /** Usado em dev sem ticket; em prod vem do ticket assinado. */
    appearance?: PlayerAppearance;
    /** Dev sem ticket — servidor usa para combate autoritativo. */
    level?: number;
    experience?: number;
    /** Plataforma do cliente (web, electron, capacitor). Para logs e futuro client_update_required. */
    platform?: 'web' | 'electron' | 'capacitor' | 'unknown';
    /** Versão do build do cliente (ex.: '0.1.0'). */
    clientBuildVersion?: string;
    /** Magias equipadas nos slots F1–F3 (validação de cast no servidor). */
    spellBar?: { slot1?: string; slot2?: string; slot3?: string };
}

export interface SpellBarSyncMessage {
    type: 'spell_bar_sync';
    v: number;
    slot1?: string;
    slot2?: string;
    slot3?: string;
}

export interface AttackMessage {
    type: 'attack';
    v: number;
    creatureId: string;
    mapId: string;
    instanceId?: string;
}

export interface CastSpellMessage {
    type: 'cast_spell';
    v: number;
    spellId: string;
    creatureId: string;
    mapId: string;
    instanceId?: string;
}

export interface ProgressSyncMessage {
    type: 'progress_sync';
    v: number;
    level: number;
    experience: number;
}

export interface ResyncRequestMessage {
    type: 'resync_request';
    v: number;
}

export interface MoveMessage {
    type: 'move';
    v: number;
    tileX: number;
    tileY: number;
    z: number;
    mapId: string;
    instanceId?: string;
    direction?: 'north' | 'south' | 'east' | 'west';
    /** Duração do passo que acabou de ocorrer (ms), do cliente local. */
    stepDurationMs?: number;
    /** Destino do deslize em andamento — reserva colisão; tileX/tileY permanecem na origem. */
    steppingDestTileX?: number;
    steppingDestTileY?: number;
}

export interface MapChangeMessage {
    type: 'map_change';
    v: number;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    direction?: 'north' | 'south' | 'east' | 'west';
    stepDurationMs?: number;
}

export interface PingMessage {
    type: 'ping';
    v: number;
    t: number;
}

export interface LeaveMessage {
    type: 'leave';
    v: number;
}

export interface ChatSendMessage {
    type: 'chat_send';
    v: number;
    channel: ChatPlayerChannel;
    text: string;
}

export interface ChatBroadcastMessage {
    type: 'chat_message';
    v: number;
    messageId: string;
    channel: ChatChannel;
    kind: ChatMessageKind;
    text: string;
    senderName?: string;
    senderPlayerId?: string;
    sentAtMs: number;
}

export interface WelcomeMessage {
    type: 'welcome';
    v: number;
    playerId: string;
    /** instanceId atribuído pelo servidor (mapas instanciados). */
    instanceId?: string;
    /** Vida autoritativa do jogador local ao entrar. */
    health: number;
    maxHealth: number;
    players: PlayerSnapshot[];
    /** Criaturas autoritativas da sala (mobs compartilhados). */
    creatures?: CreatureSnapshot[];
}

/** Enviado ao entrar em mapa instanciado após `map_change` (já conectado). */
export interface InstanceAssignedMessage {
    type: 'instance_assigned';
    v: number;
    mapId: string;
    instanceId: string;
}

export interface PlayerJoinedMessage {
    type: 'player_joined';
    v: number;
    player: PlayerSnapshot;
}

export interface PlayerLeftMessage {
    type: 'player_left';
    v: number;
    playerId: string;
}

export interface PlayerMovedMessage {
    type: 'player_moved';
    v: number;
    playerId: string;
    tileX: number;
    tileY: number;
    z: number;
    mapId: string;
    instanceId?: string;
    direction?: 'north' | 'south' | 'east' | 'west';
    /** Duração autoritativa do passo para interpolação nos clientes remotos. */
    stepDurationMs?: number;
}

export interface CreatureSyncMessage {
    type: 'creature_sync';
    v: number;
    mapId: string;
    instanceId?: string;
    creatures: CreatureSnapshot[];
}

export interface CreatureMovedMessage {
    type: 'creature_moved';
    v: number;
    creatureId: string;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    direction?: 'north' | 'south' | 'east' | 'west';
    stepDurationMs?: number;
}

export interface CreatureDamagedMessage {
    type: 'creature_damaged';
    v: number;
    creatureId: string;
    mapId: string;
    instanceId?: string;
    health: number;
    maxHealth: number;
    damage: number;
    attackerPlayerId?: string;
}

/** Ataque rejeitado (fora de alcance, cooldown servidor, alvo morto, etc.). */
export interface AttackMissMessage {
    type: 'attack_miss';
    v: number;
    creatureId: string;
    mapId: string;
    instanceId?: string;
    code?: string;
}

export interface CreatureDiedMessage {
    type: 'creature_died';
    v: number;
    creatureId: string;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    xpReward: number;
    killerPlayerId?: string;
}

export interface CreatureRespawnedMessage {
    type: 'creature_respawned';
    v: number;
    creatureId: string;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    health: number;
    maxHealth: number;
}

export interface PlayerProgressMessage {
    type: 'player_progress';
    v: number;
    playerId: string;
    level: number;
    experience: number;
    leveledUp?: boolean;
    health?: number;
    maxHealth?: number;
}

/** HP/MP autoritativos — sincroniza HUD após cast, dano, cura, level up. */
export interface PlayerResourcesMessage {
    type: 'player_resources';
    v: number;
    playerId: string;
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
}

export interface StateSyncMessage {
    type: 'state_sync';
    v: number;
    players: PlayerSnapshot[];
}

export interface PositionCorrectionMessage {
    type: 'position_correction';
    v: number;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
}

export interface ErrorMessage {
    type: 'error';
    v: number;
    code: string;
    message: string;
    /** Tempo restante de cooldown (ms) — ex.: CHAT_COOLDOWN. */
    retryAfterMs?: number;
}

export interface PongMessage {
    type: 'pong';
    v: number;
    t: number;
}

export interface PlayerDamagedMessage {
    type: 'player_damaged';
    v: number;
    playerId: string;
    health: number;
    maxHealth: number;
    damage: number;
    attackerPlayerId?: string;
}

export interface PlayerDiedMessage {
    type: 'player_died';
    v: number;
    playerId: string;
    killerPlayerId?: string;
}

export interface PlayerRespawnedMessage {
    type: 'player_respawned';
    v: number;
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
}

export function playerRoomKey(p: Pick<PlayerSnapshot, 'mapId' | 'instanceId'>): string {
    return buildRoomKey(p.mapId, p.instanceId);
}

/**
 * Duração mínima aceita no servidor (ms).
 * 55 = `STEP_DURATION_BY_SPEED.AT_MAX_SPEED` — não subir sem atualizar a curva de speed.
 */
export const MIN_SERVER_STEP_DURATION_MS = 55;

/** Duração máxima aceita no servidor (ms), inclui diagonal (√2 × passo rápido). */
export const MAX_SERVER_STEP_DURATION_MS = 600;

/** Duração de passo em ms — clamp servidor/rede (55–600ms). */
export function parseStepDurationMs(raw: unknown): number | undefined {
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(
        MIN_SERVER_STEP_DURATION_MS,
        Math.min(MAX_SERVER_STEP_DURATION_MS, Math.round(n))
    );
}

function parseOptionalTileCoord(raw: unknown): number | undefined {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
    return n;
}

function parseOptionalPositiveInt(raw: unknown): number | undefined {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return undefined;
    return n;
}

function parseOptionalNonNegativeInt(raw: unknown): number | undefined {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined;
    return n;
}

export function parseSteppingDest(
    raw: Record<string, unknown>
): { steppingDestTileX?: number; steppingDestTileY?: number } {
    const steppingDestTileX = parseOptionalTileCoord(raw.steppingDestTileX);
    const steppingDestTileY = parseOptionalTileCoord(raw.steppingDestTileY);
    if (steppingDestTileX === undefined || steppingDestTileY === undefined) {
        return {};
    }
    return { steppingDestTileX, steppingDestTileY };
}

export function parsePlayerAppearance(raw: unknown): PlayerAppearance | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const o = raw as Record<string, unknown>;
    const spriteSheetUrl =
        typeof o.spriteSheetUrl === 'string' ? o.spriteSheetUrl.trim().slice(0, 200) : '';
    const outfitId = typeof o.outfitId === 'string' ? o.outfitId.trim().slice(0, 64) : '';
    const gender = o.gender === 'male' || o.gender === 'female' ? o.gender : undefined;
    const vocationId =
        typeof o.vocationId === 'string' ? o.vocationId.trim().slice(0, 32) : '';
    if (!spriteSheetUrl || !outfitId || !gender || !vocationId) return undefined;
    return { outfitId, spriteSheetUrl, gender, vocationId };
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    if (m.v !== PROTOCOL_VERSION || typeof m.type !== 'string') return null;

    const instanceId =
        typeof m.instanceId === 'string' && m.instanceId.length > 0
            ? m.instanceId.slice(0, 80)
            : undefined;

    const direction =
        m.direction === 'north' ||
        m.direction === 'south' ||
        m.direction === 'east' ||
        m.direction === 'west'
            ? m.direction
            : undefined;

    switch (m.type) {
        case 'join':
            return {
                type: 'join',
                v: PROTOCOL_VERSION,
                playerId: typeof m.playerId === 'string' ? m.playerId.slice(0, 64) : undefined,
                name: typeof m.name === 'string' ? m.name.slice(0, 32) : 'Jogador',
                mapId: typeof m.mapId === 'string' ? m.mapId.slice(0, 48) : 'mainland',
                instanceId,
                enterTicket:
                    typeof m.enterTicket === 'string' && m.enterTicket.length > 0
                        ? m.enterTicket.slice(0, 2048)
                        : undefined,
                tileX: Number(m.tileX),
                tileY: Number(m.tileY),
                z: Number(m.z),
                direction,
                appearance: parsePlayerAppearance(m.appearance),
                level: parseOptionalPositiveInt(m.level),
                experience: parseOptionalNonNegativeInt(m.experience),
                platform:
                    m.platform === 'web' ||
                    m.platform === 'electron' ||
                    m.platform === 'capacitor' ||
                    m.platform === 'unknown'
                        ? m.platform
                        : undefined,
                clientBuildVersion:
                    typeof m.clientBuildVersion === 'string'
                        ? m.clientBuildVersion.slice(0, 32)
                        : undefined,
                spellBar: parseSpellBar(m.spellBar),
            };
        case 'move':
            return {
                type: 'move',
                v: PROTOCOL_VERSION,
                tileX: Number(m.tileX),
                tileY: Number(m.tileY),
                z: Number(m.z),
                mapId: typeof m.mapId === 'string' ? m.mapId.slice(0, 48) : 'mainland',
                instanceId,
                direction,
                stepDurationMs: parseStepDurationMs(m.stepDurationMs),
                ...parseSteppingDest(m),
            };
        case 'map_change':
            return {
                type: 'map_change',
                v: PROTOCOL_VERSION,
                mapId: typeof m.mapId === 'string' ? m.mapId.slice(0, 48) : 'mainland',
                instanceId,
                tileX: Number(m.tileX),
                tileY: Number(m.tileY),
                z: Number(m.z),
                direction,
                stepDurationMs: parseStepDurationMs(m.stepDurationMs),
            };
        case 'attack': {
            const creatureId =
                typeof m.creatureId === 'string' ? m.creatureId.slice(0, 80) : '';
            if (!creatureId) return null;
            return {
                type: 'attack',
                v: PROTOCOL_VERSION,
                creatureId,
                mapId: typeof m.mapId === 'string' ? m.mapId.slice(0, 48) : 'mainland',
                instanceId,
            };
        }
        case 'cast_spell': {
            const spellId = typeof m.spellId === 'string' ? m.spellId.slice(0, 64) : '';
            const creatureId =
                typeof m.creatureId === 'string' ? m.creatureId.slice(0, 80) : '';
            if (!spellId || !creatureId) return null;
            return {
                type: 'cast_spell',
                v: PROTOCOL_VERSION,
                spellId,
                creatureId,
                mapId: typeof m.mapId === 'string' ? m.mapId.slice(0, 48) : 'mainland',
                instanceId,
            };
        }
        case 'progress_sync': {
            const experience = parseOptionalNonNegativeInt(m.experience);
            if (experience === undefined) return null;
            const level = parseOptionalPositiveInt(m.level) ?? 1;
            return {
                type: 'progress_sync',
                v: PROTOCOL_VERSION,
                level,
                experience,
            };
        }
        case 'resync_request':
            return { type: 'resync_request', v: PROTOCOL_VERSION };
        case 'ping':
            return {
                type: 'ping',
                v: PROTOCOL_VERSION,
                t: Number(m.t),
            };
        case 'leave':
            return { type: 'leave', v: PROTOCOL_VERSION };
        case 'spell_bar_sync':
            return {
                type: 'spell_bar_sync',
                v: PROTOCOL_VERSION,
                ...parseSpellBar(m),
            };
        case 'chat_send': {
            const channel = typeof m.channel === 'string' ? m.channel : '';
            if (!isChatPlayerChannel(channel)) return null;
            const text = parseChatSendText(m.text);
            if (!text) return null;
            return {
                type: 'chat_send',
                v: PROTOCOL_VERSION,
                channel,
                text,
            };
        }
        default:
            return null;
    }
}

export function isValidTile(mapId: string, tileX: number, tileY: number, z: number): boolean {
    return (
        typeof mapId === 'string' &&
        mapId.length > 0 &&
        Number.isInteger(tileX) &&
        Number.isInteger(tileY) &&
        Number.isInteger(z) &&
        tileX >= 0 &&
        tileY >= 0 &&
        tileX < SERVER_MAP_SIZE &&
        tileY < SERVER_MAP_SIZE &&
        z >= SERVER_MIN_Z &&
        z <= SERVER_MAX_Z
    );
}
