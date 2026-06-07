/**
 * Electron preload — expõe API mínima e segura para o renderer via contextBridge.
 *
 * Regras de segurança:
 * - contextIsolation: true (main.ts)
 * - nodeIntegration: false (main.ts)
 * - NÃO expor: ipcRenderer, fs, child_process, process.env inteiro
 * - APENAS: platform, version, eventos de janela, diagnóstico controlado
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Registra um listener IPC e retorna função para removê-lo.
 */
function on(channel: string, callback: () => void): () => void {
    const listener = (_event: unknown) => callback();
    ipcRenderer.on(channel, listener);
    return () => {
        ipcRenderer.removeListener(channel, listener);
    };
}

contextBridge.exposeInMainWorld('electronAPI', {
    /** Identifica plataforma para detectRuntimePlatform() */
    platform: 'electron' as const,

    /** Versão do app (assíncrona — via IPC com main) */
    getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

    /** App foi minimizado ou ocultado */
    onWindowBackground: (callback: () => void) => on('window-background', callback),

    /** App foi restaurado ou exibido */
    onWindowForeground: (callback: () => void) => on('window-foreground', callback),

    /** Janela perdeu foco (sem minimizar) */
    onWindowBlur: (callback: () => void) => on('window-blur', callback),

    /** Janela recuperou foco */
    onWindowFocus: (callback: () => void) => on('window-focus', callback),

    /** API de Auto-Update */
    updater: {
        check: (): Promise<{ ok: boolean; reason?: string }> =>
            ipcRenderer.invoke('updater:check'),

        download: (): Promise<{ ok: boolean; reason?: string }> =>
            ipcRenderer.invoke('updater:download'),

        install: (): Promise<{ ok: boolean; reason?: string }> =>
            ipcRenderer.invoke('updater:install'),

        onStatus: (callback: (status: any) => void): (() => void) => {
            const listener = (_event: unknown, status: any) => callback(status);
            ipcRenderer.on('updater:status', listener);

            return () => {
                ipcRenderer.removeListener('updater:status', listener);
            };
        }
    }
});
