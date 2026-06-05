
import type { RegistryTile, TileRegistry, WorldMap } from '../engine/types';
import {
    formatVariantGroupLabel,
} from '../engine/tileVariants';

export interface MapEditorController {
    selectedTileType: number;
    currentTool: 'pencil' | 'bucket' | 'eraser' | 'eyedropper' | 'rectangle' | 'line';
    currentCategory: string;
    tileSearchQuery: string;
    setTool(tool: string): void;
    initEditorUI(): void;
    setSelectedTileType(id: number): void;
    scrollToVariantGroup(groupKey: string): void;
}

function getRegistry(options: {
    getTileRegistry?: () => TileRegistry;
    tileTypes?: TileRegistry;
}): TileRegistry {
    return options.getTileRegistry?.() ?? options.tileTypes ?? {};
}

import { tilePreviewStyleCss } from '../engine/tileDraw';

function variantMemberLabel(tile: RegistryTile, index: number): string {
    const stripIdx = tile.variantStripIndex;
    if (stripIdx !== undefined) return String(stripIdx + 1);
    const match = (tile.name || '').match(/(?:·|\s|-)\s*(\d+)\s*$/);
    if (match) return match[1];
    return String(index + 1);
}

function shouldExpandVariantMembers(
    members: RegistryTile[],
    query: string,
    selectedId: number
): boolean {
    if (members.some((m) => m.id === selectedId)) return true;
    if (!query) return false;
    return members.some((m) => matchesSearch(m, query));
}

function matchesSearch(tile: RegistryTile, query: string, groupLabel?: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const name = (tile.name || '').toLowerCase();
    const cat = (tile.category || '').toLowerCase();
    const paletteCat = String(tile.paletteCategory || '').toLowerCase();
    const group = (tile.variantGroup || '').toLowerCase();
    const label = (groupLabel || '').toLowerCase();
    return (
        name.includes(q) ||
        cat.includes(q) ||
        paletteCat.includes(q) ||
        group.includes(q) ||
        label.includes(q) ||
        q.includes('aleat') ||
        (q.includes('random') && !!tile.isVariantBrush)
    );
}

function matchesCategory(tile: RegistryTile, category: string): boolean {
    if (category === 'all') return true;
    const paletteCat = tile.paletteCategory ?? tile.category;
    return paletteCat === category;
}

export function initMapEditor(options: {
    tileTypes?: TileRegistry;
    getTileRegistry?: () => TileRegistry;
    onSelectedTileChanged: (id: number) => void;
    onToolChanged: (tool: MapEditorController['currentTool']) => void;
    getEditingFloor: () => number;
    setEditingFloor: (z: number) => void;
    saveHistoryState: () => void;
    getWorldMap: () => unknown;
    getMapSize: () => number;
}): MapEditorController {
    let selectedTileType = 0;
    let currentTool: MapEditorController['currentTool'] = 'pencil';
    let currentCategory = 'all';
    let tileSearchQuery = '';

    const selector = document.getElementById('tileSelector')!;
    const searchInput = document.getElementById('tileSearchInput') as HTMLInputElement | null;

    function selectTile(id: number, clickedEl?: HTMLElement): void {
        document.querySelectorAll('.tile-option').forEach((el) => el.classList.remove('active'));
        if (clickedEl) {
            clickedEl.classList.add('active');
        } else {
            const match = selector.querySelector(`[data-tile-id="${id}"]`);
            match?.classList.add('active');
        }
        selectedTileType = id;
        options.onSelectedTileChanged(id);
        if (currentTool === 'eraser' || currentTool === 'eyedropper') {
            setTool('pencil');
        }
    }

    function tilePreviewStyle(tile: RegistryTile): string {
        return tilePreviewStyleCss(tile);
    }

    function appendTileOption(
        container: HTMLElement,
        tile: RegistryTile,
        extraClass = ''
    ): void {
        const div = document.createElement('div');
        div.className = `tile-option ${extraClass} ${selectedTileType === tile.id ? 'active' : ''}`.trim();
        div.dataset.tileId = String(tile.id);
        if (tile.variantGroup) {
            div.dataset.variantGroup = tile.variantGroup;
        }

        div.innerHTML = `
            <div class="tile-preview" style="${tilePreviewStyle(tile)}"></div>
            <span style="text-transform: capitalize;">${tile.name}</span>
        `;
        div.onclick = () => selectTile(tile.id, div);
        container.appendChild(div);
    }

    function appendCompactVariantMember(
        container: HTMLElement,
        tile: RegistryTile,
        index: number
    ): void {
        const div = document.createElement('div');
        div.className = `tile-option tile-option--variant-member tile-option--compact ${
            selectedTileType === tile.id ? 'active' : ''
        }`.trim();
        div.dataset.tileId = String(tile.id);
        div.dataset.variantGroup = tile.variantGroup ?? '';
        div.title = tile.name;
        div.innerHTML = `
            <div class="tile-preview tile-preview--compact" style="${tilePreviewStyle(tile)}"></div>
            <span class="tile-option--variant-index">${variantMemberLabel(tile, index)}</span>
        `;
        div.onclick = () => selectTile(tile.id, div);
        container.appendChild(div);
    }

    function renderGroupedPalette(): void {
        if (!selector) return;
        selector.innerHTML = '';

        const registry = getRegistry(options);
        const query = tileSearchQuery.trim().toLowerCase();

        const grouped = new Map<string, RegistryTile[]>();
        const ungrouped: RegistryTile[] = [];

        for (const tile of Object.values(registry)) {
            if (tile.id === -1) continue;
            if (tile.assetType === 'character') continue;
            if (tile.assetType === 'border') continue;
            if (tile.isVariantBrush) continue;

            const group = tile.variantGroup?.trim();
            if (group) {
                const list = grouped.get(group) ?? [];
                list.push(tile);
                grouped.set(group, list);
            } else {
                ungrouped.push(tile);
            }
        }

        const sortedGroupKeys = Array.from(grouped.keys()).sort((a, b) =>
            formatVariantGroupLabel(a).localeCompare(formatVariantGroupLabel(b), 'pt')
        );

        const variantGroups: Array<{
            groupKey: string;
            groupLabel: string;
            members: RegistryTile[];
            brushTile?: RegistryTile;
        }> = [];

        for (const groupKey of sortedGroupKeys) {
            const members = grouped.get(groupKey)!;
            members.sort((a, b) => a.id - b.id);

            const groupLabel = formatVariantGroupLabel(groupKey);
            const categoryMatch = members.some((m) => matchesCategory(m, currentCategory));
            const searchMatch =
                !query ||
                groupLabel.toLowerCase().includes(query) ||
                groupKey.toLowerCase().includes(query) ||
                members.some((m) => matchesSearch(m, query, groupLabel)) ||
                query.includes('aleat') ||
                query.includes('🎲');

            if (!categoryMatch || !searchMatch) continue;

            if (members.length < 2) {
                for (const tile of members) {
                    if (!matchesCategory(tile, currentCategory)) continue;
                    if (!matchesSearch(tile, query, groupLabel)) continue;
                    ungrouped.push(tile);
                }
                continue;
            }

            const brushTile = Object.values(registry).find(
                (t) => t.isVariantBrush && t.variantGroup === groupKey
            );

            variantGroups.push({ groupKey, groupLabel, members, brushTile });
        }

        const othersFiltered = ungrouped.filter((tile) => {
            if (!matchesCategory(tile, currentCategory)) return false;
            return matchesSearch(tile, query);
        });

        if (variantGroups.length > 0 || othersFiltered.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'tile-grid tile-grid--palette';

            for (const { groupKey, groupLabel, members, brushTile } of variantGroups) {
                if (!brushTile) continue;

                const slot = document.createElement('div');
                slot.className = 'variant-group-slot';
                slot.dataset.variantGroup = groupKey;

                const expandMembers = shouldExpandVariantMembers(members, query, selectedTileType);
                const previewTile = members[0];

                const brushDiv = document.createElement('div');
                brushDiv.className = `tile-option tile-option--variant-brush ${
                    selectedTileType === brushTile.id ? 'active' : ''
                }`.trim();
                brushDiv.dataset.tileId = String(brushTile.id);
                brushDiv.dataset.variantGroup = groupKey;
                brushDiv.title = `${groupLabel} — sorteia entre ${members.length} variantes`;
                brushDiv.innerHTML = `
                    <div class="tile-preview" style="${tilePreviewStyle(previewTile)}"></div>
                    <span class="tile-option--variant-brush-caption">${groupLabel} 🎲</span>
                    <span class="variant-count-badge">${members.length}</span>
                `;
                brushDiv.onclick = () => selectTile(brushTile.id, brushDiv);
                slot.appendChild(brushDiv);

                const filteredMembers = members.filter((tile) =>
                    matchesSearch(tile, query, groupLabel)
                );

                if (filteredMembers.length > 0) {
                    const expandBtn = document.createElement('button');
                    expandBtn.type = 'button';
                    expandBtn.className = 'variant-expand-btn';
                    expandBtn.title = 'Variantes fixas';
                    expandBtn.setAttribute('aria-expanded', expandMembers ? 'true' : 'false');
                    expandBtn.textContent = expandMembers ? '▴' : '▾';
                    expandBtn.onclick = (e) => {
                        e.stopPropagation();
                        const open = membersGrid.classList.toggle('is-collapsed');
                        expandBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
                        expandBtn.textContent = open ? '▾' : '▴';
                    };
                    brushDiv.appendChild(expandBtn);

                    const membersGrid = document.createElement('div');
                    membersGrid.className = `variant-group-members${
                        expandMembers ? '' : ' is-collapsed'
                    }`;
                    membersGrid.id = `variant-members-${groupKey}`;

                    filteredMembers.forEach((tile, index) => {
                        appendCompactVariantMember(membersGrid, tile, index);
                    });
                    slot.appendChild(membersGrid);
                }

                grid.appendChild(slot);
            }

            othersFiltered.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
            for (const tile of othersFiltered) {
                appendTileOption(grid, tile);
            }

            selector.appendChild(grid);
        }
    }

    function initEditorUI(): void {
        renderGroupedPalette();
    }

    function scrollToVariantGroup(groupKey: string): void {
        const block = selector.querySelector(
            `[data-variant-group="${CSS.escape(groupKey)}"]`
        );
        block?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function setTool(tool: string): void {
        currentTool = tool as MapEditorController['currentTool'];
        options.onToolChanged(currentTool);
        document.querySelectorAll('.tool-btn').forEach((btn) => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
        });
    }

    document.querySelectorAll('.tool-btn').forEach((btn) => {
        (btn as HTMLElement).onclick = () => setTool((btn as HTMLElement).dataset.tool!);
    });

    document.querySelectorAll('.cat-btn').forEach((btn) => {
        (btn as HTMLElement).onclick = () => {
            if (!(btn as HTMLElement).dataset.cat) return;
            document.querySelectorAll('#categoryTabs .cat-btn').forEach((b) =>
                b.classList.remove('active')
            );
            btn.classList.add('active');
            currentCategory = (btn as HTMLElement).dataset.cat!;
            initEditorUI();
        };
    });

    searchInput?.addEventListener('input', () => {
        tileSearchQuery = searchInput.value;
        initEditorUI();
    });

    initEditorUI();

    return {
        get selectedTileType() {
            return selectedTileType;
        },
        setSelectedTileType(id: number) {
            selectedTileType = id;
            initEditorUI();
            options.onSelectedTileChanged(id);
        },
        get currentTool() {
            return currentTool;
        },
        setTool,
        get currentCategory() {
            return currentCategory;
        },
        get tileSearchQuery() {
            return tileSearchQuery;
        },
        initEditorUI,
        scrollToVariantGroup,
    };
}

export function floodFill(
    worldMap: WorldMap,
    z: number,
    x: number,
    y: number,
    targetId: number,
    replacementId: number,
    mapSize: number
): void {
    if (targetId === replacementId) return;
    if (worldMap[z][y][x] !== targetId) return;

    const stack: [number, number][] = [[x, y]];
    while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (worldMap[z][cy][cx] === targetId) {
            worldMap[z][cy][cx] = replacementId;
            if (cx > 0) stack.push([cx - 1, cy]);
            if (cx < mapSize - 1) stack.push([cx + 1, cy]);
            if (cy > 0) stack.push([cx, cy - 1]);
            if (cy < mapSize - 1) stack.push([cx, cy + 1]);
        }
    }
}

export function floodFillRandom(
    worldMap: WorldMap,
    z: number,
    x: number,
    y: number,
    targetId: number,
    pickReplacement: () => number,
    mapSize: number
): void {
    if (worldMap[z][y][x] !== targetId) return;

    const stack: [number, number][] = [[x, y]];
    while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (worldMap[z][cy][cx] === targetId) {
            worldMap[z][cy][cx] = pickReplacement();
            if (cx > 0) stack.push([cx - 1, cy]);
            if (cx < mapSize - 1) stack.push([cx + 1, cy]);
            if (cy > 0) stack.push([cx, cy - 1]);
            if (cy < mapSize - 1) stack.push([cx, cy + 1]);
        }
    }
}
