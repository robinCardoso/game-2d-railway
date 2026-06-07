import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PlayerAppearance } from '../../shared/protocol.js';
import { parsePlayerAppearance } from '../../shared/protocol.js';
import { env } from './config/env.js';

export interface EnterTicketPayload {
    characterId: string;
    accountId: string;
    name: string;
    mapId: string;
    tileX: number;
    tileY: number;
    z: number;
    direction: 'north' | 'south' | 'east' | 'west';
    appearance?: PlayerAppearance;
    level: number;
    experience: number;
    health?: number | null;
    exp: number;
}

function base64UrlEncode(str: string): string {
    return Buffer.from(str, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function sign(body: string): string {
    return createHmac('sha256', env.enterTicketSecret).update(body).digest('base64url');
}

export function createEnterTicket(
    payload: Omit<EnterTicketPayload, 'exp'>,
    ttlMs = env.wsTicketTtlMs
): string {
    const full: EnterTicketPayload = {
        ...payload,
        exp: Date.now() + ttlMs,
    };
    const body = base64UrlEncode(JSON.stringify(full));
    return `${body}.${sign(body)}`;
}

export function verifyEnterTicket(ticket: string): EnterTicketPayload | null {
    const parts = ticket.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = sign(body);
    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
        return null;
    }
    try {
        const payload = JSON.parse(base64UrlDecode(body)) as EnterTicketPayload;
        if (!payload.exp || Date.now() > payload.exp) return null;
        if (!payload.characterId || !payload.accountId || !payload.name) return null;
        if (!payload.mapId) return null;
        if (
            !Number.isInteger(payload.tileX) ||
            !Number.isInteger(payload.tileY) ||
            !Number.isInteger(payload.z)
        ) {
            return null;
        }
        const dir = payload.direction;
        if (dir && !['north', 'south', 'east', 'west'].includes(dir)) return null;
        const appearance = parsePlayerAppearance(payload.appearance);
        const level = Math.max(1, Math.floor(Number(payload.level) || 1));
        const experience = Math.max(0, Math.floor(Number(payload.experience) || 0));
        const health = payload.health !== undefined && payload.health !== null
            ? Math.floor(Number(payload.health))
            : null;
        return {
            ...payload,
            direction: dir ?? 'south',
            appearance,
            level,
            experience,
            health,
        };
    } catch {
        return null;
    }
}
