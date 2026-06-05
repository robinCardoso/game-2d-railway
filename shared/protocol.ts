/**
 * Protocolo WebSocket — Fase 2 (localhost).
 * Compartilhado entre `server/` e `src/net/` (cliente).
 */

import { buildRoomKey } from './roomKey.js';
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
    | PingMessage
    | LeaveMessage;

export type ServerMessage =
    | WelcomeMessage
    | InstanceAssignedMessage
    | PlayerJoinedMessage
    | PlayerLeftMessage
    | PlayerMovedMessage
    | StateSyncMessage
    | PositionCorrectionMessage
    | ErrorMessage
    | PongMessage;

export interface PlayerAppearance {
    outfitId: string;
    spriteSheetUrl: string;
    gender: Gender;
    vocationId: string;
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

export interface WelcomeMessage {
    type: 'welcome';
    v: number;
    playerId: string;
    /** instanceId atribuído pelo servidor (mapas instanciados). */
    instanceId?: string;
    players: PlayerSnapshot[];
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
}

export interface PongMessage {
    type: 'pong';
    v: number;
    t: number;
}

export function playerRoomKey(p: Pick<PlayerSnapshot, 'mapId' | 'instanceId'>): string {
    return buildRoomKey(p.mapId, p.instanceId);
}

/** Duração de passo em ms — clamp alinhado ao grid local (16–600ms). */
export function parseStepDurationMs(raw: unknown): number | undefined {
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(16, Math.min(600, Math.round(n)));
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
        case 'ping':
            return {
                type: 'ping',
                v: PROTOCOL_VERSION,
                t: Number(m.t),
            };
        case 'leave':
            return { type: 'leave', v: PROTOCOL_VERSION };
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
