/**
 * AppLifecycle — interface comum para eventos de ciclo de vida do app
 * entre Web (browser), Electron (desktop) e Capacitor (mobile).
 *
 * Uso:
 *   const lifecycle = setupWebLifecycle(handlers);
 *   // ou setupElectronLifecycle(handlers)
 *   // ao destruir:
 *   lifecycle.dispose();
 */

export interface AppLifecycleHandlers {
    /** App foi para background (aba oculta, janela minimizada, app mobile em segundo plano). */
    onBackground?: () => void;
    /** App voltou para foreground (aba visível, janela restaurada, app mobile retomado). */
    onForeground?: () => void;
    /** Janela/tab perdeu foco (mas pode ainda estar visível). */
    onFocusLost?: () => void;
    /** Janela/tab recuperou foco. */
    onFocusGained?: () => void;
}

export interface AppLifecycleController {
    dispose(): void;
}

/** Evita dupla execução quando blur e visibilitychange disparam juntos (ex.: alt-tab). */
export function coalesceLifecycleHandler(fn: () => void, windowMs = 50): () => void {
    let lastAt = 0;
    return () => {
        const now = performance.now();
        if (now - lastAt < windowMs) return;
        lastAt = now;
        fn();
    };
}
