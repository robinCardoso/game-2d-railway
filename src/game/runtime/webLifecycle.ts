/**
 * Web lifecycle — Page Visibility API + window blur/focus.
 *
 * Evolução do pageVisibility.ts (que só tinha visibilitychange).
 * Adiciona blur/focus para capturar perda de foco sem minimizar
 * (ex.: usuário clica em outra janela sem ocultar a aba).
 */

import type { AppLifecycleController, AppLifecycleHandlers } from './appLifecycle';

export function setupWebLifecycle(
    handlers: AppLifecycleHandlers
): AppLifecycleController {
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') {
            handlers.onBackground?.();
        } else {
            handlers.onForeground?.();
        }
    };

    const onBlur = (): void => handlers.onFocusLost?.();
    const onFocus = (): void => handlers.onFocusGained?.();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return {
        dispose() {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        },
    };
}
