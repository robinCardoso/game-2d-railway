/**
 * ResyncController — centraliza a lógica de resincronização de sala.
 *
 * Responsabilidades:
 * - Rate limit local (não pedir resync < RESYNC_COOL_MS após o último)
 * - Snap visual de creatures e remote players para posição autoritativa
 * - Reset do frame clock de animação de creatures
 * - Requisição de resync para o servidor
 *
 * Substitui código espalhado em handlePlayPageVisible() no playApp.ts.
 */

export const RESYNC_COOL_MS = 2_500;

export interface ResyncControllerDeps {
    isConnected: () => boolean;
    requestRoomResync: () => void;
    snapCreaturesToAuthoritativeTiles: () => void;
    resetCreatureFrameClock: () => void;
    snapRemotePlayersToAuthoritativeTiles: () => void;
    reloadCreaturePresets: () => void;
}

export class ResyncController {
    private lastRequestedAtMs = 0;

    constructor(private readonly deps: ResyncControllerDeps) {}

    /** Último timestamp em que o resync foi pedido (para diagnóstico). */
    getLastRequestedAtMs(): number {
        return this.lastRequestedAtMs;
    }

    /**
     * Executa resync completo:
     * 1. Snapa entidades para tiles autoritativos (elimina drift visual)
     * 2. Reseta frame clock (evita lerp "congelado" ao restaurar)
     * 3. Pede resync ao servidor (respeitando rate limit local)
     * 4. Recarrega presets de creatures
     */
    requestResync(): void {
        const now = performance.now();

        // Snap visual imediato — independente de estar conectado
        this.deps.snapCreaturesToAuthoritativeTiles();
        this.deps.resetCreatureFrameClock();
        this.deps.snapRemotePlayersToAuthoritativeTiles();

        // Resync de rede (respeitando rate limit local; servidor tem rate limit próprio de 2s)
        if (this.deps.isConnected() && now - this.lastRequestedAtMs >= RESYNC_COOL_MS) {
            this.lastRequestedAtMs = now;
            this.deps.requestRoomResync();
        }

        // Recarrega presets (útil se mobs foram atualizados durante background)
        this.deps.reloadCreaturePresets();
    }
}
