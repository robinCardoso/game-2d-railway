import { CreatureSpawn } from '../engine/types';
import {
    getCreatureConfigForSpawn,
    getCreaturePreset,
    getCreaturePresets,
    getSpawnDisplayColor,
    type CreaturePreset,
} from './creaturePresets';
import {
    drawCreaturePresetThumbnail,
    drawCreatureThumbnailFallback,
} from './creaturePresetThumbnail';
import { toast } from '../utils/popup';

export type { CreaturePreset as SpawnPreset } from './creaturePresets';
export { getCreaturePreset as getSpawnPreset, getSpawnDisplayColor } from './creaturePresets';

export interface SpawnEditorOptions {
    spawns: CreatureSpawn[];
    onSpawnsChanged: () => void;
    onSpawnHighlight?: (spawn: CreatureSpawn | null) => void;
    onSpawnFocus?: (spawn: CreatureSpawn) => void;
    setEditorTool?: (tool: 'pencil' | 'eraser') => void;
    getEditorTool?: () => string;
}

export function initSpawnEditor(options: SpawnEditorOptions) {
    const {
        spawns,
        onSpawnsChanged,
        onSpawnHighlight,
        onSpawnFocus,
        setEditorTool,
        getEditorTool,
    } = options;

    let selectedPreset: CreaturePreset | null = null;
    let currentFilter: 'all' | 'monster' | 'npc' = 'all';

    const container = document.getElementById('spawnSelector')!;
    const filterAll = document.getElementById('spawnFilterAll')!;
    const filterMonster = document.getElementById('spawnFilterMonster')!;
    const filterNpc = document.getElementById('spawnFilterNpc')!;

    function syncSpawnToolButtons(): void {
        const current = getEditorTool?.() ?? 'pencil';
        document.querySelectorAll('.spawn-tool-btn').forEach((btn) => {
            const tool = (btn as HTMLElement).dataset.spawnTool;
            btn.classList.toggle('active', tool === current);
        });
    }

    document.querySelectorAll('.spawn-tool-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tool = (btn as HTMLElement).dataset.spawnTool as 'pencil' | 'eraser' | undefined;
            if (!tool) return;
            setEditorTool?.(tool);
            syncSpawnToolButtons();
        });
    });
    syncSpawnToolButtons();

    function renderPresetPalette() {
        if (!container) return;
        container.innerHTML = '';

        const visiblePresets = getCreaturePresets().filter(
            (preset) => currentFilter === 'all' || preset.type === currentFilter
        );

        if (visiblePresets.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'flyout-hint';
            empty.style.margin = '4px 0';
            empty.style.textAlign = 'center';
            empty.innerHTML =
                'Nenhuma criatura na paleta.<br>Cadastre em <strong>Criar → Criar Mobs</strong> ou <strong>Criar NPCs</strong> e salve com <em>Registrar na paleta</em>.';
            container.appendChild(empty);
            selectedPreset = null;
            return;
        }

        if (!selectedPreset || !visiblePresets.some((p) => p.name === selectedPreset!.name)) {
            selectedPreset = visiblePresets[0];
        }

        visiblePresets.forEach((preset) => {
            const div = document.createElement('div');
            div.className = `spawn-preset-card ${selectedPreset?.name === preset.name ? 'active' : ''}`;
            div.title = preset.description?.trim() || preset.name;

            const color = preset.color ?? (preset.type === 'monster' ? '#fb7185' : '#10b981');
            const emoji = preset.type === 'monster' ? '👾' : '👤';
            const typeLabel = preset.type === 'monster' ? '👾 Monstro' : '👤 NPC';

            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'spawn-preset-card__thumb-wrap';
            thumbWrap.style.border = `1px solid ${color}55`;

            const thumb = document.createElement('canvas');
            thumb.className = 'spawn-preset-card__thumb';
            thumb.width = 48;
            thumb.height = 48;

            const thumbCtx = thumb.getContext('2d');
            if (thumbCtx) {
                drawCreatureThumbnailFallback(thumbCtx, thumb.width, thumb.height, color, emoji);
            }
            const config = getCreatureConfigForSpawn(preset.name);
            if (config) {
                void drawCreaturePresetThumbnail(thumb, config);
            }
            thumbWrap.appendChild(thumb);

            const body = document.createElement('div');
            body.className = 'spawn-preset-card__body';

            const nameEl = document.createElement('div');
            nameEl.className = 'spawn-preset-card__name';
            nameEl.textContent = preset.name;

            const descEl = document.createElement('div');
            descEl.className = 'spawn-preset-card__desc';
            descEl.textContent = preset.description?.trim() || 'Sem descrição';

            const typeEl = document.createElement('div');
            typeEl.className = 'spawn-preset-card__type';
            typeEl.textContent = typeLabel;

            body.appendChild(nameEl);
            body.appendChild(descEl);
            body.appendChild(typeEl);

            div.appendChild(thumbWrap);
            div.appendChild(body);

            div.addEventListener('click', () => {
                container.querySelectorAll('.spawn-preset-card').forEach((el) => el.classList.remove('active'));
                div.classList.add('active');
                selectedPreset = preset;
            });

            container.appendChild(div);
        });
    }

    function refreshSpawnList() {
        const listEl = document.getElementById('spawnList');
        if (!listEl) return;

        const visible = spawns.filter(
            (s) => currentFilter === 'all' || s.type === currentFilter
        );

        if (visible.length === 0) {
            listEl.innerHTML =
                '<p class="flyout-hint" style="padding: 8px 0; margin: 0;">Nenhum spawn neste mapa.</p>';
            return;
        }

        listEl.innerHTML = '';
        visible.forEach((spawn) => {
            const preset = getCreaturePreset(spawn.name);
            const typeLabel = spawn.type === 'monster' ? 'Monstro' : 'NPC';
            const color = preset?.color ?? getSpawnDisplayColor(spawn);
            const emoji = spawn.type === 'monster' ? '👾' : '👤';

            const row = document.createElement('div');
            row.className = 'portal-list-row spawn-list-row';
            row.dataset.sid = spawn.id;
            row.title = 'Passe o mouse para destacar · Clique para ir até o spawn';

            const info = document.createElement('div');
            info.className = 'portal-list-row__info';

            const coords = document.createElement('div');
            coords.className = 'portal-list-row__coords';
            coords.style.display = 'flex';
            coords.style.alignItems = 'center';
            coords.style.gap = '6px';

            const miniThumb = document.createElement('canvas');
            miniThumb.width = 20;
            miniThumb.height = 20;
            miniThumb.style.width = '20px';
            miniThumb.style.height = '20px';
            miniThumb.style.imageRendering = 'pixelated';
            miniThumb.style.flexShrink = '0';
            miniThumb.style.borderRadius = '3px';
            miniThumb.style.background = '#1a1d24';
            const miniCtx = miniThumb.getContext('2d');
            if (miniCtx) {
                drawCreatureThumbnailFallback(miniCtx, miniThumb.width, miniThumb.height, color, emoji);
            }
            const spawnConfig = getCreatureConfigForSpawn(spawn.name);
            if (spawnConfig) {
                void drawCreaturePresetThumbnail(miniThumb, spawnConfig);
            }

            const label = document.createElement('span');
            label.innerHTML = `${spawn.name} <span style="color:#8b949e;font-weight:400;">(${typeLabel})</span>`;

            coords.appendChild(miniThumb);
            coords.appendChild(label);

            const target = document.createElement('div');
            target.className = 'portal-list-row__target';
            target.textContent = `📍 (${spawn.x}, ${spawn.y}, ${spawn.z})`;

            info.appendChild(coords);
            info.appendChild(target);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'floor-btn spawn-del-btn';
            delBtn.dataset.sid = spawn.id;
            delBtn.title = 'Remover spawn';
            delBtn.textContent = '🗑️';

            row.appendChild(info);
            row.appendChild(delBtn);

            row.addEventListener('mouseenter', () => onSpawnHighlight?.(spawn));
            row.addEventListener('mouseleave', () => onSpawnHighlight?.(null));
            row.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('.spawn-del-btn')) return;
                onSpawnFocus?.(spawn);
            });

            listEl.appendChild(row);
        });

        listEl.querySelectorAll('.spawn-del-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sid = (e.currentTarget as HTMLElement).dataset.sid!;
                removeSpawnById(sid);
            });
        });
    }

    function setFilter(filter: 'all' | 'monster' | 'npc', activeBtn: HTMLElement) {
        currentFilter = filter;
        [filterAll, filterMonster, filterNpc].forEach((btn) => btn?.classList.remove('active'));
        activeBtn.classList.add('active');
        renderPresetPalette();
        refreshSpawnList();
    }

    filterAll?.addEventListener('click', () => setFilter('all', filterAll as HTMLElement));
    filterMonster?.addEventListener('click', () => setFilter('monster', filterMonster as HTMLElement));
    filterNpc?.addEventListener('click', () => setFilter('npc', filterNpc as HTMLElement));

    renderPresetPalette();
    refreshSpawnList();

    function removeSpawnById(id: string, showToast = true): boolean {
        const index = spawns.findIndex((s) => s.id === id);
        if (index === -1) return false;
        const name = spawns[index].name;
        spawns.splice(index, 1);
        onSpawnHighlight?.(null);
        refreshSpawnList();
        onSpawnsChanged();
        if (showToast) {
            toast.success(`Spawn de "${name}" removido.`);
        }
        return true;
    }

    return {
        getSelectedPreset() {
            return selectedPreset;
        },
        addSpawnAt(x: number, y: number, z: number) {
            if (!selectedPreset) {
                toast.info('Selecione uma criatura em creature_presets.json primeiro.');
                return;
            }

            this.removeSpawnAt(x, y, z, false);

            const newSpawn: CreatureSpawn = {
                id: `spawn_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                name: selectedPreset.name,
                x,
                y,
                z,
                type: selectedPreset.type,
            };

            spawns.push(newSpawn);
            refreshSpawnList();
            onSpawnsChanged();
            toast.success(`Spawn de "${selectedPreset.name}" adicionado em (${x}, ${y}, ${z}).`);
        },
        removeSpawnAt(x: number, y: number, z: number, showToast = true) {
            const index = spawns.findIndex((s) => s.x === x && s.y === y && s.z === z);
            if (index !== -1) {
                const name = spawns[index].name;
                spawns.splice(index, 1);
                onSpawnHighlight?.(null);
                refreshSpawnList();
                onSpawnsChanged();
                if (showToast) {
                    toast.success(`Spawn de "${name}" removido em (${x}, ${y}, ${z}).`);
                }
                return true;
            }
            return false;
        },
        removeSpawnById,
        refresh() {
            onSpawnHighlight?.(null);
            renderPresetPalette();
            refreshSpawnList();
            syncSpawnToolButtons();
        },
        syncToolButtons: syncSpawnToolButtons,
    };
}
