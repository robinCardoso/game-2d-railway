/**
 * Detector de plataforma de runtime.
 * Compartilhado entre web, Electron e Capacitor sem dependências externas.
 */

export type RuntimePlatform = 'web' | 'electron' | 'capacitor' | 'unknown';

export function detectRuntimePlatform(): RuntimePlatform {
    const w = window as unknown as Record<string, unknown>;

    // Electron expõe electronAPI via contextBridge no preload
    if (
        w['electronAPI'] &&
        typeof w['electronAPI'] === 'object' &&
        (w['electronAPI'] as Record<string, unknown>)['platform'] === 'electron'
    ) {
        return 'electron';
    }

    // Capacitor expõe Capacitor.isNativePlatform()
    if (
        w['Capacitor'] &&
        typeof w['Capacitor'] === 'object' &&
        typeof (w['Capacitor'] as Record<string, unknown>)['isNativePlatform'] === 'function' &&
        (w['Capacitor'] as { isNativePlatform: () => boolean }).isNativePlatform()
    ) {
        return 'capacitor';
    }

    if (typeof window !== 'undefined') {
        return 'web';
    }

    return 'unknown';
}

export function isDesktopRuntime(): boolean {
    return detectRuntimePlatform() === 'electron';
}

export function isMobileRuntime(): boolean {
    return detectRuntimePlatform() === 'capacitor';
}
