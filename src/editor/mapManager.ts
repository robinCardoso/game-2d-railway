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

type MapEntryEditorMode = 'edit' | 'create' | 'duplicate' | 'register';

interface OpenMapEntryEditorOpts {
    mode: MapEntryEditorMode;
    entry?: MapEntry;
    sourceId?: string;
    defaults?: Partial<MapEntry>;
}

let promptEntryImpl: ((opts: OpenMapEntryEditorOpts) => Promise<MapEntry | null>) | null = null;

function slugifyMapId(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function matchesMapFilter(entry: MapEntry, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
        entry.id,
        entry.name,
        entry.file,
        entry.description ?? '',
        entry.instanced ? 'instancia instanciado dungeon' : 'publico public overworld',
        entry.pvpEnabled !== false ? 'pvp habilitado' : 'no-pvp pacifico pacífico',
    ]
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
}

export function initMapManagerUI(deps: MapManagerDeps): {
    open: () => void;
    promptEntry: (opts: OpenMapEntryEditorOpts) => Promise<MapEntry | null>;
} {
    let modal: HTMLElement | null = null;
    let editorMode: MapEntryEditorMode | null = null;
    let editorSourceId: string | undefined;
    let editorOriginalFile: string | undefined;
    let editorResolve: ((entry: MapEntry | null) => void) | null = null;
    let editingCardId: string | undefined;
    let listFilterQuery = '';

    function getEl<T extends HTMLElement>(id: string): T {
        return modal!.querySelector(id) as T;
    }

    function closeMapEntryEditor(result: MapEntry | null = null): void {
        const panel = getEl<HTMLElement>('#mapEntryEditorPanel');
        panel.classList.remove('is-open');
        editorMode = null;
        editorSourceId = undefined;
        editorOriginalFile = undefined;
        editingCardId = undefined;
        renderList();

        if (editorResolve) {
            const resolve = editorResolve;
            editorResolve = null;
            resolve(result);
        }
    }

    function syncFileDisplayFromId(): void {
        const idInput = getEl<HTMLInputElement>('#mapEntryIdInput');
        const fileInput = getEl<HTMLInputElement>('#mapEntryFileDisplay');
        if (editorMode === 'edit' || editorMode === 'register') {
            fileInput.value = editorOriginalFile ?? `maps/${idInput.value}.json`;
            return;
        }
        const safeId = slugifyMapId(idInput.value) || 'meu_mapa';
        fileInput.value = `maps/${safeId}.json`;
    }

    function openMapEntryEditor(opts: OpenMapEntryEditorOpts): void {
        if (!modal) return;

        editorMode = opts.mode;
        editorSourceId = opts.sourceId;

        const panel = getEl<HTMLElement>('#mapEntryEditorPanel');
        const titleEl = getEl<HTMLElement>('#mapEntryEditorTitle');
        const idInput = getEl<HTMLInputElement>('#mapEntryIdInput');
        const nameInput = getEl<HTMLInputElement>('#mapEntryNameInput');
        const sizeInput = getEl<HTMLInputElement>('#mapEntrySizeInput');
        const descInput = getEl<HTMLInputElement>('#mapEntryDescriptionInput');
        const instancedCheck = getEl<HTMLInputElement>('#mapEntryInstancedCheck');
        const pvpCheck = getEl<HTMLInputElement>('#mapEntryPvpEnabledCheck');

        const defaults = opts.entry ?? opts.defaults;
        const isEdit = opts.mode === 'edit';
        const idReadonly = isEdit || opts.mode === 'register';

        if (opts.mode === 'edit' && opts.entry) {
            editingCardId = opts.entry.id;
            editorOriginalFile = opts.entry.file;
        } else if (opts.mode === 'register') {
            editingCardId = undefined;
            editorOriginalFile = defaults?.file ?? `maps/${defaults?.id ?? 'meu_mapa'}.json`;
        } else if (opts.mode === 'duplicate' && opts.sourceId) {
            editingCardId = opts.sourceId;
            editorOriginalFile = undefined;
        } else {
            editingCardId = undefined;
            editorOriginalFile = undefined;
        }

        const titles: Record<MapEntryEditorMode, string> = {
            edit: 'Editar mapa',
            create: 'Novo mapa',
            duplicate: 'Duplicar mapa',
            register: 'Registrar mapa',
        };
        titleEl.textContent = titles[opts.mode];

        if (opts.mode === 'duplicate' && opts.entry) {
            idInput.value = `${opts.entry.id}_copy`;
            nameInput.value = `${opts.entry.name} (cópia)`;
            sizeInput.value = String(opts.entry.size);
            descInput.value = opts.entry.description ?? '';
            instancedCheck.checked = opts.entry.instanced;
            pvpCheck.checked = opts.entry.pvpEnabled !== false;
        } else {
            idInput.value = defaults?.id ?? '';
            nameInput.value = defaults?.name ?? defaults?.id ?? '';
            sizeInput.value = String(defaults?.size ?? 256);
            descInput.value = defaults?.description ?? '';
            instancedCheck.checked = defaults?.instanced === true;
            pvpCheck.checked = defaults?.pvpEnabled !== false;
        }

        idInput.readOnly = idReadonly;
        idInput.classList.toggle('map-manager-input--readonly', idReadonly);
        syncFileDisplayFromId();

        panel.classList.add('is-open');
        renderList();
        nameInput.focus();
    }

    function readMapEntryFromForm(): MapEntry | null {
        if (!editorMode) return null;

        const idInput = getEl<HTMLInputElement>('#mapEntryIdInput');
        const nameInput = getEl<HTMLInputElement>('#mapEntryNameInput');
        const sizeInput = getEl<HTMLInputElement>('#mapEntrySizeInput');
        const descInput = getEl<HTMLInputElement>('#mapEntryDescriptionInput');
        const instancedCheck = getEl<HTMLInputElement>('#mapEntryInstancedCheck');
        const pvpCheck = getEl<HTMLInputElement>('#mapEntryPvpEnabledCheck');
        const fileInput = getEl<HTMLInputElement>('#mapEntryFileDisplay');

        let safeId: string;
        if (editorMode === 'edit' || editorMode === 'register') {
            safeId = idInput.value.trim();
        } else {
            safeId = slugifyMapId(idInput.value);
        }

        if (!safeId || !/^[a-z0-9_-]+$/.test(safeId)) {
            toast.error('ID inválido. Use letras, números, _ ou -.');
            return null;
        }

        const size = Math.min(256, Math.max(8, Math.floor(Number(sizeInput.value)) || 256));
        if (size < 8 || size > 256) {
            toast.error('Tamanho da grade deve estar entre 8 e 256.');
            return null;
        }

        const name = nameInput.value.trim() || safeId;
        const file =
            editorMode === 'edit' && editorOriginalFile
                ? editorOriginalFile
                : fileInput.value.trim() || `maps/${safeId}.json`;

        return {
            id: safeId,
            name,
            file,
            size,
            instanced: instancedCheck.checked,
            pvpEnabled: pvpCheck.checked,
            description: descInput.value.trim() || undefined,
        };
    }

    async function handleSaveEntry(): Promise<void> {
        if (!editorMode) return;

        const entry = readMapEntryFromForm();
        if (!entry) return;

        if (editorMode === 'edit') {
            const existing = MAP_REGISTRY.find((m) => m.id === editorSourceId || m.id === entry.id);
            if (!existing) {
                toast.error('Mapa não encontrado no registry.');
                return;
            }
            registerMap({ ...entry, id: existing.id, file: existing.file });
            toast.success(`Metadados de "${entry.name}" atualizados (salvos no navegador).`);
            closeMapEntryEditor(entry);
            return;
        }

        if (editorMode === 'create' || editorMode === 'register') {
            const duplicate = MAP_REGISTRY.find((m) => m.id === entry.id);
            if (duplicate) {
                const msg =
                    editorMode === 'create'
                        ? `O ID "${entry.id}" já existe. Substituir metadados e abrir mapa vazio?`
                        : `O ID "${entry.id}" já existe no registry. Usar esse ID para o mapa atual?`;
                const replace = await popup.confirm(msg, 'ID duplicado');
                if (!replace) return;
            }
            registerMap(entry);
            if (editorMode === 'create') {
                deps.createBlankMap(entry);
                toast.success(`Mapa "${entry.name}" criado. Exporte o JSON para public/maps/${entry.id}.json`);
            } else {
                toast.success(`Mapa "${entry.name}" registrado no navegador.`);
            }
            closeMapEntryEditor(entry);
            return;
        }

        if (editorMode === 'duplicate') {
            if (MAP_REGISTRY.some((m) => m.id === entry.id)) {
                toast.error('Já existe um mapa com esse ID.');
                return;
            }
            registerMap(entry);
            if (editorSourceId === deps.getCurrentMapId()) {
                deps.duplicateFromCurrent(entry);
            } else {
                toast.success(
                    `Mapa "${entry.name}" registrado. Carregue-o e exporte o JSON para public/maps/.`
                );
            }
            closeMapEntryEditor(entry);
        }
    }

    function updateListFilterSummary(visible: number, total: number): void {
        const summary = getEl<HTMLElement>('#mapManagerFilterSummary');
        if (listFilterQuery.trim()) {
            summary.textContent =
                visible === 0
                    ? `Nenhum mapa para "${listFilterQuery.trim()}"`
                    : `${visible} de ${total} mapa(s)`;
        } else {
            summary.textContent = `${total} mapa(s)`;
        }
    }

    function renderList() {
        if (!modal) return;
        const listEl = modal.querySelector('#mapManagerList')!;
        listEl.innerHTML = '';

        const currentId = deps.getCurrentMapId();
        const filtered = MAP_REGISTRY.filter(
            (entry) =>
                matchesMapFilter(entry, listFilterQuery) || entry.id === editingCardId
        );
        updateListFilterSummary(filtered.length, MAP_REGISTRY.length);

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'map-manager-empty';
            empty.textContent = listFilterQuery.trim()
                ? 'Nenhum mapa corresponde à busca. Tente outro termo ou limpe o filtro.'
                : 'Nenhum mapa no registry.';
            listEl.appendChild(empty);
            return;
        }

        filtered.forEach((entry) => {
            const isCurrent = entry.id === currentId;
            const isEditing = entry.id === editingCardId && editorMode !== null;
            const card = document.createElement('div');
            card.dataset.id = entry.id;
            card.className = 'map-manager-card';
            if (isEditing) card.classList.add('is-editing');
            else if (isCurrent) card.classList.add('is-current');

            card.innerHTML = `
                <div class="map-manager-card__body">
                    <div class="map-manager-card__title">
                        ${escapeHtml(entry.name)}
                        ${isCurrent ? '<span class="map-manager-card__badge map-manager-card__badge--active">(ativo)</span>' : ''}
                        ${isEditing ? '<span class="map-manager-card__badge map-manager-card__badge--editing">(editando)</span>' : ''}
                    </div>
                    <div class="map-manager-card__meta">
                        ID: ${escapeHtml(entry.id)} · ${entry.size}×${entry.size} · ${entry.instanced ? 'Instância' : 'Público'} · ${entry.pvpEnabled !== false ? 'PvP Habilitado' : 'No-PvP (Pacífico)'}
                    </div>
                    <div class="map-manager-card__file">${escapeHtml(entry.file)}</div>
                    ${entry.description ? `<div class="map-manager-card__desc">${escapeHtml(entry.description)}</div>` : ''}
                </div>
                <div class="map-manager-card__actions">
                    ${!isCurrent ? `<button type="button" class="floor-btn mm-load map-manager-card__btn" data-id="${entry.id}">Carregar</button>` : ''}
                    <button type="button" class="floor-btn mm-edit map-manager-card__btn" data-id="${entry.id}">Editar</button>
                    <button type="button" class="floor-btn mm-dup map-manager-card__btn" data-id="${entry.id}">Duplicar</button>
                    <button type="button" class="floor-btn mm-export map-manager-card__btn" data-id="${entry.id}">Download JSON</button>
                    ${isMapSaveAvailable() ? `<button type="button" class="floor-btn mm-save-dev map-manager-card__btn map-manager-card__btn--save" data-id="${entry.id}">💾 public/maps</button>` : ''}
                    <button type="button" class="floor-btn mm-del map-manager-card__btn map-manager-card__btn--danger" data-id="${entry.id}">Excluir</button>
                </div>
            `;
            listEl.appendChild(card);
        });

        listEl.querySelectorAll('.mm-load').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset.id!;
                modal!.classList.remove('is-open');
                closeMapEntryEditor(null);
                await deps.loadMapById(id);
            });
        });

        listEl.querySelectorAll('.mm-edit').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id!;
                const existing = MAP_REGISTRY.find((m) => m.id === id);
                if (!existing) return;
                openMapEntryEditor({ mode: 'edit', entry: existing, sourceId: id });
            });
        });

        listEl.querySelectorAll('.mm-dup').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sourceId = (btn as HTMLElement).dataset.id!;
                const source = MAP_REGISTRY.find((m) => m.id === sourceId);
                if (!source) return;
                openMapEntryEditor({ mode: 'duplicate', entry: source, sourceId });
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
                    if (editingCardId === id) closeMapEntryEditor(null);
                    else renderList();
                } else if (BUILTIN_MAP_IDS.has(id)) {
                    toast.error('Mapas builtin (rookgaard, mainland, …) não podem ser excluídos.');
                }
            });
        });
    }

    function ensureModal(): HTMLElement {
        if (modal && !modal.querySelector('.map-manager-dialog')) {
            modal.remove();
            modal = null;
        }
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'mapManagerModal';
        modal.className = 'map-manager-overlay';
        modal.innerHTML = `
            <div class="map-manager-dialog">
                <div class="map-manager-header">
                    <h2 class="map-manager-title">🗺️ Gerenciar Mapas</h2>
                    <button type="button" id="closeMapManagerBtn" class="map-manager-close" aria-label="Fechar">✕</button>
                </div>
                <div class="map-manager-body">
                    <div class="map-manager-list-pane">
                        <div class="map-manager-search-row">
                            <input type="search" id="mapManagerSearchInput" class="map-manager-input map-manager-search-input" placeholder="Buscar por nome, ID, arquivo…" />
                            <button type="button" id="mapManagerClearSearchBtn" class="floor-btn map-manager-clear-search" title="Limpar busca">✕</button>
                        </div>
                        <div id="mapManagerFilterSummary" class="map-manager-filter-summary"></div>
                        <div id="mapManagerList" class="map-manager-list"></div>
                        <button type="button" id="mapManagerNewBtn" class="floor-btn map-manager-new-btn">+ Novo mapa</button>
                    </div>
                    <div id="mapEntryEditorPanel" class="map-manager-editor-panel">
                        <div id="mapEntryEditorTitle" class="map-manager-editor-title"></div>
                        <div class="map-manager-field">
                            <label class="map-manager-label" for="mapEntryIdInput">ID do mapa</label>
                            <input type="text" id="mapEntryIdInput" class="map-manager-input" placeholder="dungeon_fire" />
                        </div>
                        <div class="map-manager-field">
                            <label class="map-manager-label" for="mapEntryNameInput">Nome exibido</label>
                            <input type="text" id="mapEntryNameInput" class="map-manager-input" placeholder="Dungeon de Fogo" />
                        </div>
                        <div class="map-manager-field">
                            <label class="map-manager-label" for="mapEntrySizeInput">Tamanho da grade (8–256)</label>
                            <input type="number" id="mapEntrySizeInput" class="map-manager-input" min="8" max="256" value="256" />
                            <p class="map-manager-hint">Alterar o tamanho não redimensiona tiles já pintados.</p>
                        </div>
                        <div class="map-manager-field">
                            <label class="map-manager-label" for="mapEntryDescriptionInput">Descrição (opcional)</label>
                            <input type="text" id="mapEntryDescriptionInput" class="map-manager-input" placeholder="Dungeon instanciada para grupos" />
                        </div>
                        <div class="map-manager-field">
                            <label class="map-manager-label" for="mapEntryFileDisplay">Arquivo JSON</label>
                            <input type="text" id="mapEntryFileDisplay" class="map-manager-input map-manager-input--readonly" readonly />
                        </div>
                        <label class="map-manager-check">
                            <input type="checkbox" id="mapEntryInstancedCheck" />
                            Mapa instanciado (dungeon privada por jogador/grupo)
                        </label>
                        <label class="map-manager-check">
                            <input type="checkbox" id="mapEntryPvpEnabledCheck" checked />
                            Combate PvP habilitado neste mapa
                        </label>
                        <div class="map-manager-editor-footer">
                            <button type="button" id="mapEntryCancelBtn" class="floor-btn map-manager-btn-secondary">Cancelar</button>
                            <button type="button" id="mapEntrySaveBtn" class="floor-btn map-manager-btn-primary">Salvar</button>
                        </div>
                    </div>
                </div>
                <p class="map-manager-footnote">
                    Mapas custom e edições de builtins são salvos no <strong>localStorage</strong> deste navegador.
                    Exporte o JSON para <code>public/maps/</code>; para versionar no Git, copie também para <code>mapRegistry.ts</code>.
                </p>
            </div>
        `;
        document.body.appendChild(modal);

        function closeModal(): void {
            modal!.classList.remove('is-open');
            listFilterQuery = '';
            const searchInput = getEl<HTMLInputElement>('#mapManagerSearchInput');
            searchInput.value = '';
            closeMapEntryEditor(null);
        }

        modal.querySelector('#closeMapManagerBtn')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        getEl<HTMLInputElement>('#mapManagerSearchInput').addEventListener('input', (e) => {
            listFilterQuery = (e.target as HTMLInputElement).value;
            renderList();
        });

        getEl<HTMLButtonElement>('#mapManagerClearSearchBtn').addEventListener('click', () => {
            listFilterQuery = '';
            getEl<HTMLInputElement>('#mapManagerSearchInput').value = '';
            renderList();
            getEl<HTMLInputElement>('#mapManagerSearchInput').focus();
        });

        getEl<HTMLButtonElement>('#mapManagerNewBtn').addEventListener('click', () => {
            openMapEntryEditor({
                mode: 'create',
                defaults: { size: 256, instanced: false, pvpEnabled: true },
            });
        });

        getEl<HTMLButtonElement>('#mapEntryCancelBtn').addEventListener('click', () => {
            closeMapEntryEditor(null);
        });

        getEl<HTMLButtonElement>('#mapEntrySaveBtn').addEventListener('click', () => {
            void handleSaveEntry();
        });

        getEl<HTMLInputElement>('#mapEntryIdInput').addEventListener('input', () => {
            if (editorMode === 'create' || editorMode === 'duplicate') {
                syncFileDisplayFromId();
            }
        });

        return modal;
    }

    function open() {
        ensureModal();
        renderList();
        modal!.classList.add('is-open');
        getEl<HTMLInputElement>('#mapManagerSearchInput').focus();
    }

    function promptEntry(opts: OpenMapEntryEditorOpts): Promise<MapEntry | null> {
        ensureModal();
        renderList();
        modal!.classList.add('is-open');
        return new Promise((resolve) => {
            editorResolve = resolve;
            openMapEntryEditor(opts);
        });
    }

    promptEntryImpl = promptEntry;

    return { open, promptEntry };
}

export async function promptCreateNewMap(
    _deps?: Pick<MapManagerDeps, 'createBlankMap'>
): Promise<void> {
    if (!promptEntryImpl) {
        toast.error('Gerenciador de mapas não inicializado.');
        return;
    }
    await promptEntryImpl({
        mode: 'create',
        defaults: { size: 256, instanced: false, pvpEnabled: true },
    });
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

    if (!promptEntryImpl) {
        toast.error('Gerenciador de mapas não inicializado.');
        return null;
    }

    return promptEntryImpl({
        mode: 'register',
        defaults: {
            id: currentMapId ?? 'meu_mapa',
            name: currentMapId ?? 'Meu mapa',
            file: `maps/${currentMapId ?? 'meu_mapa'}.json`,
            size: activeMapSize,
            instanced: false,
            pvpEnabled: true,
        },
    });
}
