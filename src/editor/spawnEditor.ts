import { CreatureSpawn } from '../engine/types';
import {
    getCreaturePreset,
    getCreaturePresets,
    getSpawnDisplayColor,
    type CreaturePreset,
} from './creaturePresets';
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
            empty.style.gridColumn = '1 / -1';
            empty.style.margin = '4px 0';
            empty.style.textAlign = 'center';
            empty.innerHTML =
                'Nenhuma criatura carregada.<br>Edite <code style="font-size:9px">public/creature_presets.json</code> e recarregue a página.<br><span style="color:#8b949e">Veja creature_presets.example.json</span>';
            container.appendChild(empty);
            selectedPreset = null;
            return;
        }

        if (!selectedPreset || !visiblePresets.some((p) => p.name === selectedPreset!.name)) {
            selectedPreset = visiblePresets[0];
        }

        visiblePresets.forEach((preset) => {
            const div = document.createElement('div');
            div.className = `tile-option ${selectedPreset?.name === preset.name ? 'active' : ''}`;
            div.style.padding = '8px';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.style.border = '1px solid #2d3139';
            div.style.borderRadius = '6px';
            div.style.cursor = 'pointer';
            div.style.textAlign = 'center';
            div.style.background = '#111318';

            const color = preset.color ?? (preset.type === 'monster' ? '#fb7185' : '#10b981');

            const indicator = document.createElement('div');
            indicator.style.width = '24px';
            indicator.style.height = '24px';
            indicator.style.borderRadius = '50%';
            indicator.style.background = color;
            indicator.style.marginBottom = '6px';
            indicator.style.boxShadow = `0 0 8px ${color}aa`;
            indicator.style.display = 'flex';
            indicator.style.alignItems = 'center';
            indicator.style.justifyContent = 'center';
            indicator.style.color = '#fff';
            indicator.style.fontSize = '12px';
            indicator.innerText = preset.type === 'monster' ? '👾' : '👤';

            const nameEl = document.createElement('span');
            nameEl.style.fontSize = '10px';
            nameEl.style.fontWeight = 'bold';
            nameEl.style.display = 'block';
            nameEl.innerText = preset.name;

            const descEl = document.createElement('span');
            descEl.style.fontSize = '8px';
            descEl.style.color = '#8b949e';
            descEl.style.marginTop = '2px';
            descEl.innerText = preset.description ?? '';

            div.appendChild(indicator);
            div.appendChild(nameEl);
            div.appendChild(descEl);

            div.addEventListener('click', () => {
                container.querySelectorAll('.tile-option').forEach((el) => el.classList.remove('active'));
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
            const icon = spawn.type === 'monster' ? '👾' : '👤';
            const typeLabel = spawn.type === 'monster' ? 'Monstro' : 'NPC';
            const color = preset?.color ?? getSpawnDisplayColor(spawn);

            const row = document.createElement('div');
            row.className = 'portal-list-row spawn-list-row';
            row.dataset.sid = spawn.id;
            row.title = 'Passe o mouse para destacar · Clique para ir até o spawn';
            row.innerHTML = `
                <div class="portal-list-row__info">
                    <div class="portal-list-row__coords" style="display:flex;align-items:center;gap:6px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
                        ${icon} ${spawn.name} <span style="color:#8b949e;font-weight:400;">(${typeLabel})</span>
                    </div>
                    <div class="portal-list-row__target">📍 (${spawn.x}, ${spawn.y}, ${spawn.z})</div>
                </div>
                <button type="button" class="floor-btn spawn-del-btn" data-sid="${spawn.id}" title="Remover spawn">🗑️</button>
            `;

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
