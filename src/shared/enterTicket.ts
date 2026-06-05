/**
 * Ticket de entrada no WebSocket — fallback dev quando API /api/ws-ticket não está ativa.
 * Em produção o ticket é assinado somente no backend (Fase C).
 */

import type { PlayerAppearance } from '../../shared/protocol';

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
    exp: number;
}

const DEV_SECRET = 'game2d-dev-enter-secret-change-in-prod';

function base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(message: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

export interface CreateEnterTicketOptions {
    mapId?: string;
    tileX?: number;
    tileY?: number;
    z?: number;
    direction?: 'north' | 'south' | 'east' | 'west';
    appearance?: PlayerAppearance;
    ttlMs?: number;
}

export async function createEnterTicket(
    characterId: string,
    accountId: string,
    name: string,
    options: CreateEnterTicketOptions = {}
): Promise<string> {
    const payload: EnterTicketPayload = {
        characterId,
        accountId,
        name,
        mapId: options.mapId ?? 'mainland',
        tileX: options.tileX ?? 50,
        tileY: options.tileY ?? 50,
        z: options.z ?? 0,
        direction: options.direction ?? 'south',
        appearance: options.appearance,
        exp: Date.now() + (options.ttlMs ?? 120_000),
    };
    const body = base64UrlEncode(JSON.stringify(payload));
    const secret = import.meta.env.VITE_ENTER_TICKET_SECRET || DEV_SECRET;
    const sig = await hmacSign(body, secret);
    return `${body}.${sig}`;
}
