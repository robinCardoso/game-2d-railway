/**
 * UI do gerenciador de mapas (modal + ações de registry).
 */

import {
    BUILTIN_MAP_IDS,
    MAP_REGISTRY,
    registerMap,
    unregisterMap,
    type MapEntry,
} from '../engine/mapRegistry';
import { popup, toast } from '../utils/popup';
import { isMapSaveAvailable } from '../utils/mapDevSave';

export interface MapManagerDeps {
    getCurrentMapId: () => string | undefined;
    loadMapById: (mapId: string) => Promise<void>;
    createBlankMap: (entry: MapEntry) => void;
    duplicateFromCurrent: (entry: MapEntry) => void;
    exportCurrentToDownload: (suggestedFile: string) => void;
    saveToPublicDev: (suggestedFile: string) => Promise<void>;
}

function slugifyMapId(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

async function promptMapEntryFields(
    title: string,
    defaults?: Partial<MapEntry>
): Promise<MapEntry | null> {
    const id = await popup.prompt(
        'ID do mapa (ex: dungeon_fire)',
        defaults?.id ?? '',
        title
    );
    if (id === null) return null;
    const safeId = slugifyMapId(id);
    if (!safeId) {
        toast.error('ID inválido. Use letras, números, _ ou -.');
        return null;
    }

    const name = await popup.prompt('Nome exibido', defaults?.name ?? safeId, title);
    if (name === null) return null;

    const sizeStr = await popup.prompt(
        `Tamanho da grade (8–${256})`,
        String(defaults?.size ?? 256),
        title
    );
    if (sizeStr === null) return null;
    const size = Math.min(256, Math.max(8, Math.floor(Number(sizeStr)) || 256));

    const description = await popup.prompt(
        'Descrição (opcional)',
        defaults?.description ?? '',
        title
    );

    const instancedAns = await popup.confirm(
        'Este mapa é instanciado (dungeon privada por jogador/grupo)?',
        'Tipo de mapa'
    );
    if (instancedAns === null) return null;

    return {
        id: safeId,
        name: name.trim() || safeId,
        file: defaults?.file ?? `maps/${safeId}.json`,
        size,
        instanced: instancedAns,
        description: description?.trim() || undefined,
    };
}

export function initMapManagerUI(deps: MapManagerDeps): { open: () => void } {
    let modal: HTMLElement | null = null;

    function renderList() {
        if (!modal) return;
        const listEl = modal.querySelector('#mapManagerList')!;
        listEl.innerHTML = '';

        const currentId = deps.getCurrentMapId();

        MAP_REGISTRY.forEach((entry) => {
            const isCurrent = entry.id === currentId;
            const card = document.createElement('div');
            card.style.cssText = [
                'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;',
                'padding:12px 14px;border-radius:8px;',
                `background:${isCurrent ? '#1a1d3a' : '#0d0f15'};`,
                `border:1px solid ${isCurrent ? '#6366f1' : '#2d3139'};`,
                'font-family:Inter,sans-serif;',
            ].join('');

            card.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:#e6edf3;font-weight:600;">
                        ${entry.name} ${isCurrent ? '<span style="color:#6366f1;font-size:10px;">(ativo)</span>' : ''}
                    </div>
                    <div style="font-size:10px;color:#4a5061;margin-top:2px;">
                        ID: ${entry.id} · ${entry.size}×${entry.size} · ${entry.instanced ? 'Instância' : 'Público'}
                    </div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;word-break:break-all;">${entry.file}</div>
                    ${entry.description ? `<div style="font-size:10px;color:#8b949e;margin-top:4px;">${entry.description}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                    ${!isCurrent ? `<button type="button" class="floor-btn mm-load" data-id="${entry.id}" style="font-size:10px;padding:4px 8px;">Carregar</button>` : ''}
                    <button type="button" class="floor-btn mm-edit" data-id="${entry.id}" style="font-size:10px;padding:4px 8px;">Editar</button>
                    <button type="button" class="floor-btn mm-dup" data-id="${entry.id}" style="font-size:10px;padding:4px 8px;">Duplicar</button>
                    <button type="button" class="floor-btn mm-export" data-id="${entry.id}" style="font-size:10px;padding:4px 8px;">Download JSON</button>
                    ${isMapSaveAvailable() ? `<button type="button" class="floor-btn mm-save-dev" data-id="${entry.id}" style="font-size:10px;padding:4px 8px;border-color:#22c55e;color:#22c55e;">💾 public/maps</button>` : ''}
                    <button type="button" class="floor-btn mm-del" data-id="${entry.id}" style="font-size:10px;padding:4px 8px;color:#f87171;border-color:#7f1d1d;">Excluir</button>
                </div>
            `;
            listEl.appendChild(card);
        });

        listEl.querySelectorAll('.mm-load').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset.id!;
                modal!.style.display = 'none';
                await deps.loadMapById(id);
            });
        });

        listEl.querySelectorAll('.mm-edit').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset.id!;
                const existing = MAP_REGISTRY.find((m) => m.id === id);
                if (!existing) return;
                const updated = await promptMapEntryFields('Editar mapa', existing);
                if (!updated) return;
                registerMap({ ...updated, id: existing.id, file: existing.file });
                toast.success(`Metadados de "${existing.name}" atualizados (salvos no navegador).`);
                renderList();
            });
        });

        listEl.querySelectorAll('.mm-dup').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const sourceId = (btn as HTMLElement).dataset.id!;
                const source = MAP_REGISTRY.find((m) => m.id === sourceId);
                if (!source) return;
                const entry = await promptMapEntryFields('Duplicar mapa', {
                    id: `${source.id}_copy`,
                    name: `${source.name} (cópia)`,
                    size: source.size,
                    instanced: source.instanced,
                    description: source.description,
                    file: `maps/${source.id}_copy.json`,
                });
                if (!entry) return;
                if (MAP_REGISTRY.some((m) => m.id === entry.id)) {
                    toast.error('Já existe um mapa com esse ID.');
                    return;
                }
                registerMap(entry);
                if (sourceId === deps.getCurrentMapId()) {
                    deps.duplicateFromCurrent(entry);
                } else {
                    toast.success(
                        `Mapa "${entry.name}" registrado. Carregue-o e exporte o JSON para public/maps/.`
                    );
                }
                renderList();
            });
        });

        listEl.querySelectorAll('.mm-export').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id!;
                const entry = MAP_REGISTRY.find((m) => m.id === id);
                if (!entry) return;
                if (id !== deps.getCurrentMapId()) {
                    toast.error('Carregue este mapa antes de exportar o estado atual.');
                    return;
                }
                deps.exportCurrentToDownload(entry.file.replace(/^.*\//, '') || `${id}.json`);
            });
        });

        listEl.querySelectorAll('.mm-save-dev').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id!;
                const entry = MAP_REGISTRY.find((m) => m.id === id);
                if (!entry) return;
                if (id !== deps.getCurrentMapId()) {
                    toast.error('Carregue este mapa antes de salvar em public/maps/.');
                    return;
                }
                void deps.saveToPublicDev(entry.file.replace(/^.*\//, '') || `${id}.json`);
            });
        });

        listEl.querySelectorAll('.mm-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset.id!;
                if (id === deps.getCurrentMapId()) {
                    toast.error('Não é possível excluir o mapa ativo. Carregue outro mapa primeiro.');
                    return;
                }
                const ok = await popup.confirm(
                    `Remover "${id}" do registry? O arquivo em public/ não será apagado.`,
                    'Excluir mapa'
                );
                if (!ok) return;
                if (unregisterMap(id)) {
                    toast.success(`Mapa "${id}" removido do registry e do localStorage.`);
                    renderList();
                } else if (BUILTIN_MAP_IDS.has(id)) {
                    toast.error('Mapas builtin (rookgaard, mainland, …) não podem ser excluídos.');
                }
            });
        });
    }

    function ensureModal(): HTMLElement {
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'mapManagerModal';
        modal.style.cssText = [
            'position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;',
            'background:rgba(10,11,15,0.8);backdrop-filter:blur(6px);',
        ].join('');
        modal.innerHTML = `
            <div style="background:#111318;border:1px solid #2d3139;border-radius:12px;padding:24px;width:520px;max-width:92vw;max-height:85vh;overflow-y:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="margin:0;font-size:16px;color:#e6edf3;font-family:Inter,sans-serif;">🗺️ Gerenciar Mapas</h2>
                    <button type="button" id="closeMapManagerBtn" style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:18px;">✕</button>
                </div>
                <div id="mapManagerList" style="display:flex;flex-direction:column;gap:8px;"></div>
                <p style="font-size:10px;color:#4a5061;margin-top:16px;font-family:Inter,sans-serif;line-height:1.5;">
                    Mapas custom e edições de builtins são salvos no <strong>localStorage</strong> deste navegador.
                    Exporte o JSON para <code>public/maps/</code>; para versionar no Git, copie também para <code>mapRegistry.ts</code>.
                </p>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#closeMapManagerBtn')?.addEventListener('click', () => {
            modal!.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal!.style.display = 'none';
        });

        return modal;
    }

    function open() {
        ensureModal();
        renderList();
        modal!.style.display = 'flex';
    }

    return { open };
}

export async function promptCreateNewMap(
    deps: Pick<MapManagerDeps, 'createBlankMap'>
): Promise<void> {
    const entry = await promptMapEntryFields('Novo mapa');
    if (!entry) return;
    if (MAP_REGISTRY.some((m) => m.id === entry.id)) {
        const replace = await popup.confirm(
            `O ID "${entry.id}" já existe. Substituir metadados e abrir mapa vazio?`,
            'ID duplicado'
        );
        if (!replace) return;
    }
    registerMap(entry);
    deps.createBlankMap(entry);
    toast.success(`Mapa "${entry.name}" criado. Exporte o JSON para public/maps/${entry.id}.json`);
}

/**
 * Garante que o mapa ativo tem ID e entrada no registry antes de salvar em disco.
 * Preserva o worldMap atual — só registra metadados se ainda não houver mapa ativo.
 */
export async function ensureMapEntryForSave(
    currentMapId: string | undefined,
    activeMapSize: number
): Promise<MapEntry | null> {
    if (currentMapId) {
        const existing = MAP_REGISTRY.find((m) => m.id === currentMapId);
        if (existing) return existing;
    }

    const entry = await promptMapEntryFields('Registrar mapa antes de salvar', {
        id: currentMapId ?? 'meu_mapa',
        name: currentMapId ?? 'Meu mapa',
        file: `maps/${currentMapId ?? 'meu_mapa'}.json`,
        size: activeMapSize,
        instanced: false,
    });
    if (!entry) return null;

    if (MAP_REGISTRY.some((m) => m.id === entry.id && m.id !== currentMapId)) {
        const replace = await popup.confirm(
            `O ID "${entry.id}" já existe no registry. Usar esse ID para o mapa atual?`,
            'ID duplicado'
        );
        if (!replace) return null;
    }

    registerMap(entry);
    return entry;
}
