import { initDesktopUpdaterToast } from './desktopUpdateToast';
import { enforceDesktopVersionGate } from './desktopVersionGate';
import { detectRuntimePlatform } from '../game/runtime/platform';

/** Inicializa toast de auto-update no Electron (todas as páginas). */
export function initDesktopClientShell(): void {
    if (detectRuntimePlatform() !== 'electron') return;
    initDesktopUpdaterToast();
}

export { enforceDesktopVersionGate };
