import { isServerWsTicketEnabled } from '../shared/wsTicketClient';

/**
 * Níveis de autoridade cliente/servidor (ver docs/analise-chatgpt.md).
 * Posição, criaturas e combate são flags independentes.
 */

/** Posição do personagem validada pelo GameRoom (WS + ticket em produção). */
export function isServerAuthoritativePosition(): boolean {
    return isServerWsTicketEnabled();
}

/** Combate autoritativo quando WS conectado. Offline = cliente local. */
export function isServerAuthoritativeCombat(wsConnected: boolean): boolean {
    return wsConnected;
}

/** Mobs/IA compartilhados via GameRoom quando WS conectado. */
export function isServerAuthoritativeCreatures(wsConnected: boolean): boolean {
    return wsConnected;
}
