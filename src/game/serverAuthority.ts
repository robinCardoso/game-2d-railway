import { isServerWsTicketEnabled } from '../shared/wsTicketClient';

/**
 * Níveis de autoridade cliente/servidor (ver docs/analise-chatgpt.md).
 * Posição, criaturas e combate são flags independentes.
 */

/**
 * Posição validada pelo GameRoom.
 * `wsConnected`: em dev/Electron com WS ativo, usa protocolo direction8+seq
 * (mesmo sem `VITE_USE_SERVER_WS_TICKET`).
 */
export function isServerAuthoritativePosition(wsConnected = false): boolean {
    if (isServerWsTicketEnabled()) return true;
    return wsConnected;
}

/** Combate autoritativo quando WS conectado. Offline = cliente local. */
export function isServerAuthoritativeCombat(wsConnected: boolean): boolean {
    return wsConnected;
}

/** Mobs/IA compartilhados via GameRoom quando WS conectado. */
export function isServerAuthoritativeCreatures(wsConnected: boolean): boolean {
    return wsConnected;
}
