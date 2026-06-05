/**
 * Editor de Portais — permite ao GM criar e remover portais no mapa.
 * Um portal é um tile que, quando pisado pelo jogador, dispara a transição para outro mapa.
 */

import type { PortalData } from '../engine/types';
import { getKnownMapIds, MAP_REGISTRY } from '../engine/mapRegistry';
import { toast } from '../utils/popup';

export interface PortalEditorOptions {
    portals: PortalData[];
    getCurrentMapId: () => string | undefined;
    onPortalsChanged: () => void;
    onPortalHighlight?: (portal: PortalData | null) => void;
    onPortalFocus?: (portal: PortalData) => void;
}

export function initPortalEditor(options: PortalEditorOptions) {
    const { portals, onPortalsChanged, onPortalHighlight, onPortalFocus } = options;

    let selectedTargetMapId: string = MAP_REGISTRY[0]?.id ?? '';
    let selectedTargetX = 50;
    let selectedTargetY = 50;
    let selectedTargetZ = 0;

    // Popula o select de mapa destino
    const targetMapSelect = document.getElementById('portalTargetMapSelect') as HTMLSelectElement | null;
    const targetXInput = document.getElementById('portalTargetX') as HTMLInputElement | null;
    const targetYInput = document.getElementById('portalTargetY') as HTMLInputElement | null;
    const targetZInput = document.getElementById('portalTargetZ') as HTMLInputElement | null;

    function populateMapSelect() {
        if (!targetMapSelect) return;
        targetMapSelect.innerHTML = '';
        MAP_REGISTRY.forEach(entry => {
            const opt = document.createElement('option');
            opt.value = entry.id;
            opt.textContent = `${entry.name} (${entry.id})`;
            if (entry.id === selectedTargetMapId) opt.selected = true;
            targetMapSelect.appendChild(opt);
        });
    }

    populateMapSelect();

    targetMapSelect?.addEventListener('change', () => {
        selectedTargetMapId = targetMapSelect.value;
    });
    targetXInput?.addEventListener('input', () => {
        selectedTargetX = parseInt(targetXInput.value) || 50;
    });
    targetYInput?.addEventListener('input', () => {
        selectedTargetY = parseInt(targetYInput.value) || 50;
    });
    targetZInput?.addEventListener('input', () => {
        selectedTargetZ = parseInt(targetZInput.value) || 0;
    });

    function refreshPortalList() {
        const listEl = document.getElementById('portalList');
        if (!listEl) return;

        if (portals.length === 0) {
            listEl.innerHTML = `<p style="font-size:10px;color:#8b949e;padding:8px 0;">Nenhum portal criado neste mapa.</p>`;
            return;
        }

        listEl.innerHTML = '';
        portals.forEach(p => {
            const entry = MAP_REGISTRY.find(m => m.id === p.targetMapId);
            const targetName = entry?.name ?? p.targetMapId;

            const row = document.createElement('div');
            row.className = 'portal-list-row';
            row.dataset.pid = p.id;
            row.title = 'Passe o mouse para destacar no mapa · Clique para ir até o portal';
            row.innerHTML = `
                <div class="portal-list-row__info">
                    <div class="portal-list-row__coords">🚪 (${p.tileX},${p.tileY},${p.tileZ})</div>
                    <div class="portal-list-row__target">→ ${targetName} em (${p.targetX},${p.targetY},${p.targetZ})</div>
                </div>
                <button type="button" class="floor-btn portal-del-btn" data-pid="${p.id}" title="Remover portal">🗑️</button>
            `;

            row.addEventListener('mouseenter', () => {
                onPortalHighlight?.(p);
            });
            row.addEventListener('mouseleave', () => {
                onPortalHighlight?.(null);
            });
            row.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('.portal-del-btn')) return;
                onPortalFocus?.(p);
            });

            listEl.appendChild(row);
        });

        listEl.querySelectorAll('.portal-del-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const pid = (e.currentTarget as HTMLElement).dataset.pid!;
                const idx = portals.findIndex(p => p.id === pid);
                if (idx !== -1) {
                    portals.splice(idx, 1);
                    refreshPortalList();
                    onPortalsChanged();
                    toast.success('Portal removido.');
                }
            });
        });
    }

    refreshPortalList();

    return {
        getSelectedConfig() {
            return {
                targetMapId: selectedTargetMapId,
                targetX: selectedTargetX,
                targetY: selectedTargetY,
                targetZ: selectedTargetZ,
            };
        },
        addPortalAt(tileX: number, tileY: number, tileZ: number) {
            if (!selectedTargetMapId) {
                toast.error('Selecione um mapa destino antes de colocar o portal.');
                return;
            }
            if (!getKnownMapIds().has(selectedTargetMapId)) {
                toast.error(`Mapa destino "${selectedTargetMapId}" não está no registry.`);
                return;
            }
            // Evita duplicata na mesma posição
            this.removePortalAt(tileX, tileY, tileZ, false);

            const newPortal: PortalData = {
                id: `portal_${Date.now()}`,
                targetMapId: selectedTargetMapId,
                targetX: selectedTargetX,
                targetY: selectedTargetY,
                targetZ: selectedTargetZ,
                tileX,
                tileY,
                tileZ,
            };
            portals.push(newPortal);
            refreshPortalList();
            onPortalsChanged();
            const name = MAP_REGISTRY.find(m => m.id === selectedTargetMapId)?.name ?? selectedTargetMapId;
            toast.success(`Portal para "${name}" criado em (${tileX},${tileY},${tileZ}).`);
        },
        removePortalAt(tileX: number, tileY: number, tileZ: number, showToast = true) {
            const idx = portals.findIndex(p => p.tileX === tileX && p.tileY === tileY && p.tileZ === tileZ);
            if (idx !== -1) {
                portals.splice(idx, 1);
                refreshPortalList();
                onPortalsChanged();
                if (showToast) toast.success(`Portal removido em (${tileX},${tileY},${tileZ}).`);
                return true;
            }
            return false;
        },
        findPortalAt(tileX: number, tileY: number, tileZ: number): PortalData | undefined {
            return portals.find(p => p.tileX === tileX && p.tileY === tileY && p.tileZ === tileZ);
        },
        refresh() {
            onPortalHighlight?.(null);
            populateMapSelect();
            refreshPortalList();
        },
    };
}
