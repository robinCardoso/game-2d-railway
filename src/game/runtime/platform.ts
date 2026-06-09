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

/**
 * Studio (editor de mapas/sprites) não é suportado em mobile — app nativo nem browser em telefone.
 */
export function isStudioMobileBlocked(): boolean {
    if (isMobileRuntime()) return true;
    try {
        return window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    } catch {
        return false;
    }
}
