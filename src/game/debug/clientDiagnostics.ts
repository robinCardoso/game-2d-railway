/**
 * Client Diagnostics — painel de diagnóstico de conexão e estado.
 *
 * Ativar/desativar com tecla F3 durante o jogo.
 * Mostra: plataforma, versão, status WS, ping, timestamps de sync.
 *
 * Uso:
 *   const diag = createClientDiagnostics({ getGameNet, getResyncController });
 *   diag.mount();  // registra handler F3
 *   diag.dispose(); // remove
 */

import { serverStateStore } from '../../net/serverStateStore';
import { detectRuntimePlatform } from '../runtime/platform';
import { getClientRuntimeConfig } from '../runtime/runtimeEnv';
import type { ResyncController } from '../../net/resyncController';
import type { GameNetClient } from '../../net/gameNetClient';

export interface ClientDiagnosticsOptions {
    getGameNet: () => GameNetClient | null;
    getResyncController: () => ResyncController | null;
}

const PANEL_ID = 'clientDiagnosticsPanel';
const TOGGLE_KEY = 'F3';

function formatMsAgo(tsMs: number): string {
    if (tsMs <= 0) return '—';
    const diff = Math.round(performance.now() - tsMs);
    if (diff < 0) return '—';
    if (diff < 1000) return `${diff}ms atrás`;
    return `${(diff / 1000).toFixed(1)}s atrás`;
}

function buildPanelHtml(opts: ClientDiagnosticsOptions): string {
    const net = opts.getGameNet();
    const resync = opts.getResyncController();
    const config = getClientRuntimeConfig();
    const store = serverStateStore;

    const platform = detectRuntimePlatform();
    const wsStatus = net?.getStatus() ?? 'disconnected';
    const ping = store.lastPingMs >= 0 ? `${store.lastPingMs}ms` : '—';
    const stateSyncAge = formatMsAgo(store.lastStateSyncAtMs);
    const creatureSyncAge = formatMsAgo(store.lastCreatureSyncAtMs);
    const progressSyncAge = formatMsAgo(store.lastProgressSyncAtMs);
    const resyncAge = resync ? formatMsAgo(resync.getLastRequestedAtMs()) : '—';
    const visibility = document.visibilityState;
    const focused = document.hasFocus();
    const players = store.playersById.size;
    const creatures = store.creaturesById.size;

    const statusColor = wsStatus === 'connected' ? '#4ade80' : wsStatus === 'connecting' ? '#facc15' : '#f87171';

    return `
        <div style="
            position: fixed; top: 8px; left: 8px; z-index: 9999;
            background: rgba(10,11,14,0.92); color: #e2e8f0;
            font: 13px/1.6 'Consolas', monospace; padding: 12px 16px;
            border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
            min-width: 280px; box-shadow: 0 4px 24px rgba(0,0,0,0.6);
            pointer-events: none; user-select: none;
        ">
            <div style="font-weight:bold; color:#a78bfa; margin-bottom:6px;">
                🔬 Diagnóstico [F3]
            </div>
            <div><span style="color:#94a3b8">Plataforma:</span> ${platform}</div>
            <div><span style="color:#94a3b8">Versão:</span> ${config.buildVersion}</div>
            <div><span style="color:#94a3b8">WS:</span> <span style="color:${statusColor}">${wsStatus}</span></div>
            <div><span style="color:#94a3b8">Ping:</span> ${ping}</div>
            <div><span style="color:#94a3b8">State sync:</span> ${stateSyncAge}</div>
            <div><span style="color:#94a3b8">Creature sync:</span> ${creatureSyncAge}</div>
            <div><span style="color:#94a3b8">Progress sync:</span> ${progressSyncAge}</div>
            <div><span style="color:#94a3b8">Último resync:</span> ${resyncAge}</div>
            <div><span style="color:#94a3b8">Visibilidade:</span> ${visibility}</div>
            <div><span style="color:#94a3b8">Foco:</span> ${focused ? 'sim' : 'não'}</div>
            <div><span style="color:#94a3b8">Jogadores (store):</span> ${players}</div>
            <div><span style="color:#94a3b8">Criaturas (store):</span> ${creatures}</div>
        </div>
    `;
}

export interface ClientDiagnosticsController {
    mount(): void;
    dispose(): void;
}

export function createClientDiagnostics(
    opts: ClientDiagnosticsOptions
): ClientDiagnosticsController {
    let visible = false;
    let panel: HTMLDivElement | null = null;
    let updateInterval: number | null = null;

    function show(): void {
        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            document.body.appendChild(panel);
        }
        panel.innerHTML = buildPanelHtml(opts);
        updateInterval = window.setInterval(() => {
            if (panel && visible) {
                panel.innerHTML = buildPanelHtml(opts);
            }
        }, 500);
    }

    function hide(): void {
        if (updateInterval !== null) {
            window.clearInterval(updateInterval);
            updateInterval = null;
        }
        if (panel) {
            panel.remove();
            panel = null;
        }
    }

    function toggle(): void {
        visible = !visible;
        if (visible) show();
        else hide();
    }

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === TOGGLE_KEY) {
            e.preventDefault();
            toggle();
        }
    };

    return {
        mount() {
            window.addEventListener('keydown', onKeyDown);
        },
        dispose() {
            window.removeEventListener('keydown', onKeyDown);
            hide();
        },
    };
}
