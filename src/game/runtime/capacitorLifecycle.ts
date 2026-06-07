/**
 * Capacitor lifecycle — App state changes via @capacitor/app.
 *
 * Usado no Android (e iOS futuramente).
 * Ao ir para background: limpar input, manter WS se possível.
 * Ao voltar: requestRoomResync obrigatório.
 *
 * @capacitor/app precisa estar instalado:
 *   npm install @capacitor/core @capacitor/app
 */

import type { AppLifecycleController, AppLifecycleHandlers } from './appLifecycle';

export function setupCapacitorLifecycle(
    handlers: AppLifecycleHandlers
): AppLifecycleController {
    // Importação dinâmica — evita erro em web/electron onde @capacitor/app não está instalado
    let listener: { remove: () => void } | null = null;

    void (async () => {
        try {
            const { App } = await import('@capacitor/app');

            listener = await App.addListener('appStateChange', (state) => {
                if (state.isActive) {
                    handlers.onForeground?.();
                    handlers.onFocusGained?.();
                } else {
                    handlers.onBackground?.();
                    handlers.onFocusLost?.();
                }
            });
        } catch (err) {
            console.warn('[capacitorLifecycle] @capacitor/app não disponível:', err);
        }
    })();

    return {
        dispose() {
            listener?.remove();
            listener = null;
        },
    };
}
