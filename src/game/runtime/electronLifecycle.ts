/**
 * Electron lifecycle — eventos de janela via IPC (main → renderer).
 *
 * O main.ts do Electron envia IPC events para 'window-background',
 * 'window-foreground', 'window-blur', 'window-focus'.
 * O preload.ts os expõe via contextBridge como electronAPI.onWindow*.
 *
 * Cada handler retorna uma função de remoção (off).
 */

import type { AppLifecycleController, AppLifecycleHandlers } from './appLifecycle';
import { setupWebLifecycle } from './webLifecycle';

interface ElectronAPI {
    platform: 'electron';
    version?: string;
    onWindowBackground?: (cb: () => void) => () => void;
    onWindowForeground?: (cb: () => void) => () => void;
    onWindowBlur?: (cb: () => void) => () => void;
    onWindowFocus?: (cb: () => void) => () => void;
}

function getElectronAPI(): ElectronAPI | null {
    const w = window as unknown as Record<string, unknown>;
    const api = w['electronAPI'];
    if (api && typeof api === 'object' && (api as Record<string, unknown>)['platform'] === 'electron') {
        return api as ElectronAPI;
    }
    return null;
}

export function setupElectronLifecycle(
    handlers: AppLifecycleHandlers
): AppLifecycleController {
    const api = getElectronAPI();

    if (!api) {
        console.warn('[electronLifecycle] electronAPI não encontrado — fallback para web lifecycle.');
        return setupWebLifecycle(handlers);
    }

    const offBackground = api.onWindowBackground?.(() => {
        handlers.onBackground?.();
    });

    const offForeground = api.onWindowForeground?.(() => {
        handlers.onForeground?.();
    });

    const offBlur = api.onWindowBlur?.(() => {
        handlers.onFocusLost?.();
    });

    const offFocus = api.onWindowFocus?.(() => {
        handlers.onFocusGained?.();
    });

    return {
        dispose() {
            offBackground?.();
            offForeground?.();
            offBlur?.();
            offFocus?.();
        },
    };
}
