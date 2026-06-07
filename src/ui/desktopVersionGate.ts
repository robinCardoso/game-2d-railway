import './desktopUpdateToast.css';
import { resolveApiUrl } from '../shared/apiUrl';
import type { DesktopVersionResponse } from '../../shared/desktopVersion';
import { detectRuntimePlatform } from '../game/runtime/platform';

let blockedToastEl: HTMLDivElement | null = null;

function showVersionBlockedToast(payload: DesktopVersionResponse): void {
    if (!blockedToastEl) {
        blockedToastEl = document.createElement('div');
        blockedToastEl.className = 'desktop-update-toast';
        document.body.appendChild(blockedToastEl);
    }

    blockedToastEl.innerHTML = `
        <div class="update-toast-title" style="color: #ef4444;">Atualização Obrigatória</div>
        <div class="update-toast-desc">
            ${payload.message ?? `Sua versão (v${payload.clientVersion}) está desatualizada.`}
            <br />Mínimo exigido: <strong>v${payload.minVersion}</strong>
        </div>
        <div class="update-toast-actions">
            <button class="update-btn-primary" id="version-gate-retry-btn">Verificar de novo</button>
        </div>
    `;

    document.getElementById('version-gate-retry-btn')?.addEventListener('click', () => {
        location.reload();
    });
}

/**
 * Bloqueia jogadores Electron abaixo da versão mínima do servidor.
 * Falha aberta em erro de rede (não impede offline/dev acidental).
 */
export async function enforceDesktopVersionGate(): Promise<boolean> {
    if (detectRuntimePlatform() !== 'electron') return true;

    const api = window.electronAPI;
    if (!api?.getVersion) return true;

    let clientVersion = '0.0.0';
    try {
        clientVersion = await api.getVersion();
    } catch {
        return true;
    }

    const url = resolveApiUrl(
        `/api/desktop/version?clientVersion=${encodeURIComponent(clientVersion)}&platform=electron`
    );

    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return true;
        const payload = (await res.json()) as DesktopVersionResponse;
        if (payload.allowed) return true;
        showVersionBlockedToast(payload);
        return false;
    } catch {
        return true;
    }
}
