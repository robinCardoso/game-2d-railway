/** Analytics leve — ativa com VITE_ANALYTICS=true ou window.__GAME_ANALYTICS__ */

export function track(event: string, props?: Record<string, unknown>): void {
    if (import.meta.env.VITE_ANALYTICS !== 'true' && !(window as unknown as { __GAME_ANALYTICS__?: boolean }).__GAME_ANALYTICS__) {
        return;
    }
    console.log('[Analytics]', event, props ?? {});
}
