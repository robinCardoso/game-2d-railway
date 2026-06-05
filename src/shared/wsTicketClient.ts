import { isApiAuthEnabled } from './authClient';
import { apiFetch } from './apiFetch';

export interface WsTicketResponse {
    ticket: string;
    expiresAt: number;
}

/**
 * Em produção (ou com API auth), o ticket WS é assinado só no backend.
 * Dev mock continua com `createEnterTicket` local.
 */
export function isServerWsTicketEnabled(): boolean {
    if (import.meta.env.VITE_USE_SERVER_WS_TICKET === 'false') return false;
    if (import.meta.env.VITE_USE_SERVER_WS_TICKET === 'true') return true;
    if (import.meta.env.PROD) return true;
    return isApiAuthEnabled();
}

export async function fetchWsTicket(characterId: string): Promise<WsTicketResponse> {
    const res = await apiFetch('/api/ws-ticket', {
        method: 'POST',
        body: JSON.stringify({ characterId }),
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const body = (await res.json()) as { error?: string };
            if (body.error) msg = body.error;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    return (await res.json()) as WsTicketResponse;
}
