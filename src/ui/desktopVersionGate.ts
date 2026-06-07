import './desktopUpdateToast.css';
import { resolveApiUrl } from '../shared/apiUrl';
import type { DesktopVersionResponse } from '../../shared/desktopVersion';
import { detectRuntimePlatform } from '../game/runtime/platform';

let blockedToastEl: HTMLDivElement | null = null;

function isProductionBuild(): boolean {
    return import.meta.env.PROD;
}

function showGateToast(title: string, message: string, buttonId: string, buttonLabel: string): void {
    if (!blockedToastEl) {
        blockedToastEl = document.createElement('div');
        blockedToastEl.className = 'desktop-update-toast';
        document.body.appendChild(blockedToastEl);
    }

    blockedToastEl.innerHTML = `
        <div class="update-toast-title" style="color: #ef4444;">${title}</div>
        <div class="update-toast-desc">${message}</div>
        <div class="update-toast-actions">
            <button class="update-btn-primary" id="${buttonId}">${buttonLabel}</button>
        </div>
    `;

    document.getElementById(buttonId)?.addEventListener('click', () => {
        location.reload();
    });
}

function showVersionBlockedToast(payload: DesktopVersionResponse): void {
    const message =
        payload.message ??
        `Sua versão (v${payload.clientVersion}) está desatualizada.<br />Mínimo exigido: <strong>v${payload.minVersion}</strong>`;
    showGateToast('Atualização Obrigatória', message, 'version-gate-retry-btn', 'Verificar de novo');
}

export function showVersionCheckFailedToast(
    message = 'Não foi possível verificar a versão. Tente novamente.'
): void {
    showGateToast('Verificação de Versão', message, 'version-gate-retry-btn', 'Verificar de novo');
}

/**
 * Bloqueia jogadores Electron abaixo da versão mínima do servidor.
 * Produção: falha fechada (erro de rede/API bloqueia entrada).
 * Dev: falha aberta (não impede electron:dev sem API).
 */
export async function enforceDesktopVersionGate(): Promise<boolean> {
    if (detectRuntimePlatform() !== 'electron') return true;

    const api = window.electronAPI;
    if (!api?.getVersion) return true;

    const failOpen = !isProductionBuild();

    let clientVersion = '0.0.0';
    try {
        clientVersion = await api.getVersion();
    } catch {
        if (failOpen) return true;
        showVersionCheckFailedToast('Não foi possível ler a versão do aplicativo.');
        return false;
    }

    const url = resolveApiUrl(
        `/api/desktop/version?clientVersion=${encodeURIComponent(clientVersion)}&platform=electron`
    );

    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            if (failOpen) return true;
            showVersionCheckFailedToast('Servidor indisponível para validar a versão do cliente.');
            return false;
        }
        const payload = (await res.json()) as DesktopVersionResponse;
        if (payload.allowed) return true;
        showVersionBlockedToast(payload);
        return false;
    } catch {
        if (failOpen) return true;
        showVersionCheckFailedToast();
        return false;
    }
}
