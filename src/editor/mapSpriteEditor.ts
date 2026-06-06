import { apiFetch } from '../shared/apiFetch';
import { toast, popup } from '../utils/popup';
import { removeChromaKey } from '../utils/imageProcessor';
import { openCharacterCalibrator } from './characterCalibratorModal';
import {
    calibrationResultToBatchGrid,
    openMapSpriteBatchExportModal,
} from './mapSpriteBatchExport';
import { renderFolderTree } from './folderTree';
import { ENGINE_CONFIG } from '../engine/config';
import {
    calibrationHintsFromProperties,
    calibrationToPropertyPayload,
    inferMapSpriteCalibration,
    type MapSpriteCalibration,
} from './mapSpriteCalibration';
import {
    buildBorderMaskExports,
    calibrationFromCalibratorResult,
    getDuplicateBorderMasks,
    getMissingCardinalBorderMasks,
    getMissingDiagonalBorderMasks,
    inferBorderSlotGrid,
    type BorderSetCalibrationPayload,
} from './borderSetExport';
import {
    borderSetOptionValue,
    deleteBorderSet,
    fetchBorderSetUsage,
    fetchBorderSets,
    parseBorderSetOptionValue,
    saveBorderSet,
    type BorderSetManifestEntry,
} from './borderSetApi';
import { reloadBorderSetsFromServer } from './autoBorderUi';

let afterSaveSpriteHandler: (() => void | Promise<void>) | undefined;
let afterBorderSetSaveHandler: (() => void | Promise<void>) | undefined;

interface MapSpriteListEntry {
    name: string;
    filename?: string;
    assetType: 'terrain' | 'items' | string;
    category: string;
    relativePath: string;
    properties?: {
        walkable?: boolean;
        speedModifier?: number;
        isStair?: boolean;
        variantGroup?: string;
        variantStripFrames?: number;
        frameWidth?: number;
        frameHeight?: number;
        offsetX?: number;
        offsetY?: number;
        gapX?: number;
        gapY?: number;
        gridCols?: number;
        gridRows?: number;
        sheetLayout?: string;
        anchorX?: number;
        anchorY?: number;
        assetType?: string;
        tileRole?: string;
        borderSetId?: string;
    };
}

function parseIntField(value: string, fallback = 0): number {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function fileKeyFromDisplayName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/** PNGs internos do motor auto-borda — não são sprites editáveis no Criar Sprites. */
function isBorderSetInternalAsset(sprite: MapSpriteListEntry): boolean {
    const props = sprite.properties ?? {};
    if (props.assetType === 'border') return true;
    if (props.tileRole === 'border_overlay' || props.tileRole === 'border_sheet') return true;
    if (props.borderSetId) return true;

    const filename = sprite.filename ?? '';
    if (sprite.category.includes('borders/') && filename.endsWith('_sheet')) return true;
    if (sprite.category.includes('borders/') && /_mask_\d+$/.test(filename)) return true;
    return false;
}

const TERRAIN_CATEGORY_HINTS = ['ground', 'nature', 'walls', 'grass', 'water', 'borders'];
const ITEM_CATEGORY_HINTS = ['decor', 'props', 'furniture'];
const MAP_SPRITES_DIR_LABEL = 'tiles/maps';

/** Sanitiza subpasta (espelha regras do servidor em vite.config.ts). */
export function sanitizeMapSpriteCategory(raw: string): string {
    let cleaned = raw
        .trim()
        .replace(/\\/g, '/')
        .replace(/\.\./g, '')
        .replace(/[^a-zA-Z0-9_\-/]/g, '')
        .replace(/^\/+|\/+$/g, '');

    // Remove prefixos redundantes de pasta como 'tiles/maps/', 'maps/', etc.
    cleaned = cleaned
        .replace(/^(tiles\/)?(maps|terrain|items)\//i, '')
        .replace(/^(tiles\/)?(maps|terrain|items)$/i, '');

    return cleaned;
}

function isPseudoRootCategory(category: string): boolean {
    const c = category.trim().toLowerCase();
    return c === '' || c === 'maps' || c === 'terrain' || c === 'items';
}

function collectCategoriesForAssetType(
    assetType: string,
    sprites: Pick<MapSpriteListEntry, 'assetType' | 'category'>[],
    folders: string[] = []
): string[] {
    const set = new Set<string>();
    
    // Adiciona todas as pastas descobertas no servidor
    folders.forEach(f => {
        if (!isPseudoRootCategory(f)) {
            set.add(f);
        }
    });

    const hints = assetType === 'items' ? ITEM_CATEGORY_HINTS : TERRAIN_CATEGORY_HINTS;
    hints.forEach((h) => set.add(h));

    for (const sprite of sprites) {
        if (sprite.assetType !== assetType) continue;
        const cat = String(sprite.category ?? '').trim();
        if (isPseudoRootCategory(cat)) continue;
        set.add(cat);
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
}

/** Registra callback para recarregar paleta do mapa após salvar sprite (wire em main.ts). */
export function setMapSpriteAfterSaveHandler(handler: () => void | Promise<void>): void {
    afterSaveSpriteHandler = handler;
}

/** Recalcula bordas no mapa após salvar/reexportar um conjunto auto-borda. */
export function setBorderSetAfterSaveHandler(handler: () => void | Promise<void>): void {
    afterBorderSetSaveHandler = handler;
}

export function initMapSpriteEditor() {
    const nameInput = document.getElementById('mapSpriteNameInput') as HTMLInputElement;
    const assetTypeSelect = document.getElementById('mapSpriteAssetTypeSelect') as HTMLSelectElement;
    const categoryInput = document.getElementById('mapSpriteCategoryInput') as HTMLInputElement;
    const categoryDatalist = document.getElementById('mapSpriteCategoryList') as HTMLDataListElement | null;
    const categoryTreeEl = document.getElementById('mapSpriteCategoryTree') as HTMLDivElement | null;
    const propertiesBlock = document.getElementById('mapSpriteTerrainPropertiesBlock') as HTMLDivElement;
    const borderSetBlock = document.getElementById('mapSpriteBorderSetBlock') as HTMLDivElement | null;
    const categoryBlock = document.getElementById('mapSpriteCategoryBlock') as HTMLDivElement | null;
    const borderSetIdInput = document.getElementById('mapSpriteBorderSetIdInput') as HTMLInputElement | null;
    const borderSetLabelInput = document.getElementById('mapSpriteBorderSetLabelInput') as HTMLInputElement | null;
    const fillTerrainInput = document.getElementById('mapSpriteFillTerrainInput') as HTMLSelectElement | null;
    const borderCategoryInput = document.getElementById('mapSpriteBorderCategoryInput') as HTMLInputElement | null;

    // Propriedades físicas
    const walkableToggle = document.getElementById('mapSpriteWalkableToggle') as HTMLInputElement;
    const speedRange = document.getElementById('mapSpriteSpeedRange') as HTMLInputElement;
    const speedValSpan = document.getElementById('mapSpriteSpeedVal') as HTMLSpanElement;
    const stairToggle = document.getElementById('mapSpriteStairToggle') as HTMLInputElement;
    const variantGroupInput = document.getElementById('mapSpriteVariantGroupInput') as HTMLInputElement | null;
    const variantGroupExclude = document.getElementById('mapSpriteVariantGroupExclude') as HTMLInputElement | null;
    const variantGroupSelect = document.getElementById('mapSpriteVariantGroupSelect') as HTMLSelectElement | null;

    // Ações
    const loadBtn = document.getElementById('loadMapSpriteBtn');
    const importInput = document.getElementById('importMapSpriteInput') as HTMLInputElement;
    const openCalibratorBtn = document.getElementById('openMapSpriteCalibratorBtn');
    const saveServerBtn = document.getElementById('saveMapSpriteServerBtn');
    const saveBorderSetBtn = document.getElementById('saveMapSpriteBorderSetBtn');

    // Chroma Key
    const chromaKeyToggle = document.getElementById('mapSpriteChromaKeyToggle') as HTMLInputElement;
    const chromaKeyToleranceRow = document.getElementById('mapSpriteChromaKeyToleranceRow') as HTMLDivElement;
    const chromaKeyTolerance = document.getElementById('mapSpriteChromaKeyTolerance') as HTMLInputElement;
    const chromaKeyToleranceVal = document.getElementById('mapSpriteChromaKeyToleranceVal') as HTMLSpanElement;

    // Grade de fatiamento
    const frameWidthInput = document.getElementById('mapSpriteFrameWidth') as HTMLInputElement;
    const frameHeightInput = document.getElementById('mapSpriteFrameHeight') as HTMLInputElement;
    const offsetXInput = document.getElementById('mapSpriteOffsetX') as HTMLInputElement;
    const offsetYInput = document.getElementById('mapSpriteOffsetY') as HTMLInputElement;
    const anchorXInput = document.getElementById('mapSpriteAnchorX') as HTMLInputElement | null;
    const anchorYInput = document.getElementById('mapSpriteAnchorY') as HTMLInputElement | null;

    // Carregamento de sprites existentes
    const serverSelect = document.getElementById('mapSpriteServerSelect') as HTMLSelectElement | null;
    const refreshListBtn = document.getElementById('mapSpriteRefreshListBtn');
    const newSpriteBtn = document.getElementById('mapSpriteNewBtn');
    const deleteSpriteBtn = document.getElementById('deleteMapSpriteBtn') as HTMLButtonElement | null;

    function syncDeleteSpriteButtonVisible(visible: boolean, mode: 'sprite' | 'border_set' = 'sprite'): void {
        if (deleteSpriteBtn) {
            deleteSpriteBtn.style.display = visible ? '' : 'none';
            deleteSpriteBtn.innerText =
                mode === 'border_set' ? '🗑️ Excluir conjunto' : '🗑️ Excluir';
        }
    }

    // Canvas Preview
    const previewCanvas = document.getElementById('mapSpritePreviewCanvas') as HTMLCanvasElement;
    const previewCtx = previewCanvas?.getContext('2d');

    if (!previewCanvas || !previewCtx) return;

    if (!serverSelect) {
        console.warn(
            '[MapSpriteEditor] Elemento #mapSpriteServerSelect ausente no HTML; lista de sprites não será exibida.'
        );
        toast.info('Lista de sprites existentes indisponível (UI não encontrada).');
    }

    let originalImage: HTMLImageElement | null = null;
    let processedImage: HTMLImageElement | null = null;
    let isImageLoaded = false;
    let serverSpritesList: MapSpriteListEntry[] = [];
    let serverBorderSetsList: BorderSetManifestEntry[] = [];
    let serverFoldersList: string[] = [];
    let currentCalibration: MapSpriteCalibration | null = null;
    let pendingBorderSetCalibration: BorderSetCalibrationPayload | null = null;
    let loadedSpriteProperties: MapSpriteListEntry['properties'] | undefined;
    let loadedSpriteFileKey: string | undefined;

    const DEFAULT_SPRITE_NAME = '';

    function applyCalibrationToForm(cal: MapSpriteCalibration): void {
        frameWidthInput.value = String(cal.frameWidth);
        frameHeightInput.value = String(cal.frameHeight);
        offsetXInput.value = String(cal.offsetX);
        offsetYInput.value = String(cal.offsetY);
        if (anchorXInput) anchorXInput.value = String(cal.anchorX ?? 0);
        if (anchorYInput) anchorYInput.value = String(cal.anchorY ?? 0);
        currentCalibration = cal;
    }

    function syncCalibrationFromImage(
        properties?: MapSpriteListEntry['properties']
    ): void {
        if (!originalImage) {
            currentCalibration = null;
            return;
        }
        const w = originalImage.naturalWidth || originalImage.width;
        const h = originalImage.naturalHeight || originalImage.height;
        const hints = calibrationHintsFromProperties(properties as Record<string, unknown> | undefined);
        currentCalibration = {
            ...inferMapSpriteCalibration(w, h, hints),
            anchorX: hints?.anchorX ?? 0,
            anchorY: hints?.anchorY ?? 0,
        };
        applyCalibrationToForm(currentCalibration);
    }

    function readCalibrationFromForm(): MapSpriteCalibration | null {
        if (!processedImage) return currentCalibration;
        const w = processedImage.naturalWidth || processedImage.width;
        const h = processedImage.naturalHeight || processedImage.height;
        const fw = parseInt(frameWidthInput.value, 10);
        const fh = parseInt(frameHeightInput.value, 10);
        const ax = anchorXInput
            ? parseIntField(anchorXInput.value, currentCalibration?.anchorX ?? 0)
            : currentCalibration?.anchorX ?? 0;
        const ay = anchorYInput
            ? parseIntField(anchorYInput.value, currentCalibration?.anchorY ?? 0)
            : currentCalibration?.anchorY ?? 0;
        if (!Number.isFinite(fw) || fw <= 0 || !Number.isFinite(fh) || fh <= 0) {
            return {
                ...inferMapSpriteCalibration(
                    w,
                    h,
                    calibrationHintsFromProperties(loadedSpriteProperties as Record<string, unknown> | undefined)
                ),
                anchorX: ax,
                anchorY: ay,
            };
        }
        const ox = parseInt(offsetXInput.value, 10) || 0;
        const oy = parseInt(offsetYInput.value, 10) || 0;
        const gapX = currentCalibration?.gapX ?? 0;
        const gapY = currentCalibration?.gapY ?? 0;
        const gridCols = Math.max(1, Math.floor((w - ox) / (fw + gapX)));
        const gridRows = Math.max(1, Math.floor((h - oy) / (fh + gapY)));
        return {
            frameWidth: fw,
            frameHeight: fh,
            offsetX: ox,
            offsetY: oy,
            gapX,
            gapY,
            gridCols,
            gridRows,
            sheetLayout: currentCalibration?.sheetLayout ?? 'horizontal',
            anchorX: ax,
            anchorY: ay,
        };
    }

    /** Zera imagem e campos para criar um sprite do zero (sem sobrescrever existente). */
    function resetToNewSprite(options?: { silent?: boolean }): void {
        originalImage = null;
        processedImage = null;
        isImageLoaded = false;

        if (serverSelect) serverSelect.value = '';
        if (importInput) importInput.value = '';

        nameInput.value = DEFAULT_SPRITE_NAME;
        assetTypeSelect.value = 'terrain';
        categoryInput.value = '';
        walkableToggle.checked = true;
        speedRange.value = '1.0';
        if (speedValSpan) speedValSpan.innerText = '1.0';
        stairToggle.checked = false;
        if (variantGroupInput && variantGroupExclude) {
            variantGroupInput.value = '';
            variantGroupExclude.checked = true;
            if (variantGroupSelect) {
                variantGroupSelect.value = '';
            }
            variantGroupInput.style.display = 'none';
        }
        chromaKeyToggle.checked = false;
        if (chromaKeyToleranceRow) chromaKeyToleranceRow.style.display = 'none';
        chromaKeyTolerance.value = '50';
        if (chromaKeyToleranceVal) chromaKeyToleranceVal.innerText = '50';
        frameWidthInput.value = String(ENGINE_CONFIG.TILE_SIZE);
        frameHeightInput.value = String(ENGINE_CONFIG.TILE_SIZE);
        offsetXInput.value = '0';
        offsetYInput.value = '0';
        if (anchorXInput) anchorXInput.value = '0';
        if (anchorYInput) anchorYInput.value = '0';
        currentCalibration = null;
        pendingBorderSetCalibration = null;
        loadedSpriteProperties = undefined;
        loadedSpriteFileKey = undefined;
        syncDeleteSpriteButtonVisible(false);

        syncTerrainPropertiesVisibility();
        if (!options?.silent) {
            toast.info('Formulário limpo — carregue um PNG para a nova sprite.');
        }
    }

    function refreshVariantGroupDatalist(): void {
        const known = new Set<string>(['grass', 'stone', 'dirt', 'sand']);
        for (const sprite of serverSpritesList) {
            const group = sprite.properties?.variantGroup?.trim();
            if (group) known.add(group);
        }
        
        const sortedGroups = Array.from(known).sort((a, b) => a.localeCompare(b, 'pt'));

        if (variantGroupSelect) {
            const currentValue = variantGroupSelect.value;
            variantGroupSelect.innerHTML = '';
            
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.textContent = '-- Sem grupo / Tile Fixo --';
            variantGroupSelect.appendChild(defOpt);
            
            sortedGroups.forEach((group) => {
                const opt = document.createElement('option');
                opt.value = group;
                opt.textContent = group;
                variantGroupSelect.appendChild(opt);
            });
            
            const newOpt = document.createElement('option');
            newOpt.value = '_new_group_';
            newOpt.textContent = '+ Novo Grupo...';
            variantGroupSelect.appendChild(newOpt);
            
            if (currentValue && (sortedGroups.includes(currentValue) || currentValue === '_new_group_')) {
                variantGroupSelect.value = currentValue;
            } else {
                variantGroupSelect.value = '';
            }
        }

        if (fillTerrainInput) {
            const currentValue = fillTerrainInput.value;
            fillTerrainInput.innerHTML = '';
            sortedGroups.forEach((group) => {
                const opt = document.createElement('option');
                opt.value = group;
                opt.textContent = group;
                fillTerrainInput.appendChild(opt);
            });
            if (currentValue && sortedGroups.includes(currentValue)) {
                fillTerrainInput.value = currentValue;
            } else if (sortedGroups.includes('grass')) {
                fillTerrainInput.value = 'grass';
            }
        }
    }

    function sanitizeVariantGroup(raw: string): string {
        return raw
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]/g, '');
    }

    function syncVariantGroupFieldsFromProperties(properties?: MapSpriteListEntry['properties']): void {
        if (!variantGroupInput || !variantGroupExclude || !variantGroupSelect) return;
        const group = properties?.variantGroup?.trim() ?? '';
        variantGroupInput.value = group;
        variantGroupExclude.checked = !group;
        
        if (group === '') {
            variantGroupSelect.value = '';
            variantGroupInput.style.display = 'none';
        } else {
            const hasOption = Array.from(variantGroupSelect.options).some(opt => opt.value === group);
            if (hasOption) {
                variantGroupSelect.value = group;
                variantGroupInput.style.display = 'none';
            } else {
                variantGroupSelect.value = '_new_group_';
                variantGroupInput.style.display = 'block';
            }
        }
    }

    function refreshCategoryDatalist(): void {
        const categories = collectCategoriesForAssetType(
            assetTypeSelect.value,
            serverSpritesList,
            serverFoldersList
        );

        if (categoryDatalist) {
            categoryDatalist.innerHTML = '';
            for (const cat of categories) {
                const opt = document.createElement('option');
                opt.value = cat;
                categoryDatalist.appendChild(opt);
            }
        }

        if (categoryTreeEl) {
            categoryTreeEl.innerHTML = renderFolderTree(
                MAP_SPRITES_DIR_LABEL,
                serverFoldersList
            );
        }

        refreshVariantGroupDatalist();
    }

    async function reloadServerMapSpritesList(preserveSelectionPath?: string): Promise<boolean> {
        try {
            const response = await apiFetch('/api/list-map-sprites');
            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                throw new Error(
                    (errBody as { error?: string }).error ||
                        'Falha ao listar sprites (use npm run dev).'
                );
            }
            const result = await response.json();
            serverSpritesList = (result.sprites || []) as MapSpriteListEntry[];
            serverFoldersList = (result.folders || []) as string[];

            refreshCategoryDatalist();

            try {
                serverBorderSetsList = await fetchBorderSets();
            } catch (err) {
                console.warn('[MapSpriteEditor] Conjuntos auto-borda indisponíveis:', err);
                serverBorderSetsList = [];
            }

            if (!serverSelect) return true;

            serverSelect.innerHTML = '<option value="">-- Selecionar Sprite Existente --</option>';

            if (serverSpritesList.length === 0 && serverBorderSetsList.length === 0) {
                return true;
            }

            const categories: Record<string, MapSpriteListEntry[]> = {};
            serverSpritesList.forEach((sprite) => {
                if (isBorderSetInternalAsset(sprite)) return;
                const catName =
                    sprite.assetType === 'terrain'
                        ? `Terreno: ${sprite.category}`
                        : `Itens: ${sprite.category}`;
                if (!categories[catName]) categories[catName] = [];
                categories[catName].push(sprite);
            });

            Object.keys(categories)
                .sort()
                .forEach((catName) => {
                    const group = document.createElement('optgroup');
                    group.label = catName;
                    categories[catName].forEach((sprite) => {
                        const opt = document.createElement('option');
                        opt.value = sprite.relativePath;
                        const groupBadge = sprite.properties?.variantGroup
                            ? ` 🎲 ${sprite.properties.variantGroup}`
                            : '';
                        const stripBadge =
                            sprite.properties?.variantStripFrames &&
                            sprite.properties.variantStripFrames > 1
                                ? ` · ${sprite.properties.variantStripFrames} var.`
                                : '';
                        opt.innerText = `${sprite.name}${stripBadge}${groupBadge}`;
                        group.appendChild(opt);
                    });
                    serverSelect.appendChild(group);
                });

            if (serverBorderSetsList.length > 0) {
                const borderGroup = document.createElement('optgroup');
                borderGroup.label = 'Conjuntos auto-borda';
                serverBorderSetsList.forEach((set) => {
                    const opt = document.createElement('option');
                    opt.value = borderSetOptionValue(set.id);
                    const maskCount = Object.keys(set.masks ?? {}).length;
                    opt.textContent = `${set.label} (${set.id}) · ${maskCount} máscara${maskCount === 1 ? '' : 's'}`;
                    borderGroup.appendChild(opt);
                });
                serverSelect.appendChild(borderGroup);
            }

            if (preserveSelectionPath) {
                serverSelect.value = preserveSelectionPath;
            }
            return true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[MapSpriteEditor] Erro ao recarregar lista de sprites:', err);
            toast.error(`Não foi possível carregar a lista de sprites: ${msg}`);
            return false;
        }
    }

    refreshListBtn?.addEventListener('click', async () => {
        const ok = await reloadServerMapSpritesList();
        if (ok) toast.success('Lista de sprites e subpastas atualizada.');
    });

    newSpriteBtn?.addEventListener('click', () => {
        resetToNewSprite();
    });

    deleteSpriteBtn?.addEventListener('click', async () => {
        if (!serverSelect?.value) {
            toast.error('Selecione um sprite ou conjunto existente para excluir.');
            return;
        }

        const borderSetId = parseBorderSetOptionValue(serverSelect.value);
        if (borderSetId) {
            const set = serverBorderSetsList.find((s) => s.id === borderSetId);
            if (!set) {
                toast.error('Conjunto auto-borda não encontrado na lista.');
                return;
            }
            const displayName = `${set.label} (${set.id})`;

            try {
                deleteSpriteBtn.disabled = true;
                deleteSpriteBtn.innerText = '⌛ Verificando...';

                const usage = await fetchBorderSetUsage(set.id);

                if (usage.totalCells > 0) {
                    const mapLines = usage.maps
                        .map(
                            (m) =>
                                `  • ${m.mapFile} — ${m.cellCount} célula${m.cellCount === 1 ? '' : 's'}`
                        )
                        .join('\n');
                    await popup.alert(
                        `Não é possível excluir "${displayName}".<br><br>Em uso em ${usage.maps.length} mapa${usage.maps.length === 1 ? '' : 's'} (${usage.totalCells} célula${usage.totalCells === 1 ? '' : 's'} de borda no total):<br><br>${mapLines.replace(/\n/g, '<br>')}<br><br>Remova as bordas no mapa ou recalcule sem este conjunto antes de excluir.`,
                        '⚠️ Conjunto em Uso'
                    );
                    return;
                }

                const confirmed = await popup.confirm(
                    `Excluir conjunto "${displayName}" permanentemente?<br><br>Remove a spritesheet, as máscaras PNG, entradas em tile_properties.json e o registro em auto_border_sets.json.`,
                    '🗑️ Confirmar Exclusão'
                );
                if (!confirmed) return;

                deleteSpriteBtn.innerText = '⌛ Excluindo...';
                await deleteBorderSet(set.id);

                toast.success(`Conjunto "${set.label}" excluído com sucesso!`);
                resetToNewSprite({ silent: true });
                if (serverSelect) serverSelect.value = '';
                await reloadServerMapSpritesList();
                await reloadBorderSetsFromServer();
                if (afterSaveSpriteHandler) {
                    await afterSaveSpriteHandler();
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[MapSpriteEditor] Falha ao excluir conjunto:', err);
                await popup.alert(`Falha ao excluir conjunto: ${msg}`, 'Erro ao Excluir');
            } finally {
                deleteSpriteBtn.disabled = false;
                syncDeleteSpriteButtonVisible(false);
            }
            return;
        }

        const sprite = serverSpritesList.find((s) => s.relativePath === serverSelect.value);
        if (!sprite?.filename) {
            toast.error('Sprite não encontrado na lista.');
            return;
        }

        const filename = sprite.filename;
        const displayName = sprite.name || filename;

        try {
            deleteSpriteBtn.disabled = true;
            deleteSpriteBtn.innerText = '⌛ Verificando...';

            const usageRes = await apiFetch(`/api/sprite-usage?filename=${encodeURIComponent(filename)}`);
            if (!usageRes.ok) {
                const err = await usageRes.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Falha ao verificar uso do sprite.');
            }

            const usage = (await usageRes.json()) as {
                totalCells: number;
                maps: Array<{ mapFile: string; cellCount: number }>;
                variantGroups?: string[];
                isPreviewTile?: boolean;
            };

            if (usage.totalCells > 0) {
                const mapLines = usage.maps
                    .map(
                        (m) =>
                            `  • ${m.mapFile} — ${m.cellCount} célula${m.cellCount === 1 ? '' : 's'}`
                    )
                    .join('\n');
                await popup.alert(
                    `Não é possível excluir "${displayName}".<br><br>Em uso em ${usage.maps.length} mapa${usage.maps.length === 1 ? '' : 's'} (${usage.totalCells} célula${usage.totalCells === 1 ? '' : 's'} no total):<br><br>${mapLines.replace(/\n/g, '<br>')}<br><br>Remova ou substitua no mapa antes de excluir.`,
                    '⚠️ Sprite em Uso'
                );
                return;
            }

            let confirmBody =
                `Excluir sprite "${displayName}" permanentemente?<br><br>Esta ação remove o arquivo PNG e os metadados de tile_properties.json.`;
            if (usage.isPreviewTile && usage.variantGroups?.length) {
                confirmBody += `<br><br>⚠️ Este sprite é preview do grupo de variação "${usage.variantGroups.join(', ')}". O grupo será atualizado ou removido.`;
            }

            const confirmed = await popup.confirm(confirmBody, '🗑️ Confirmar Exclusão');
            if (!confirmed) return;

            deleteSpriteBtn.innerText = '⌛ Excluindo...';

            const deleteUrl =
                `/api/delete-map-sprite?filename=${encodeURIComponent(filename)}` +
                `&category=${encodeURIComponent(sprite.category || '')}&force=false`;
            const deleteRes = await apiFetch(deleteUrl, { method: 'DELETE' });

            if (deleteRes.status === 409) {
                const conflict = (await deleteRes.json()) as {
                    maps?: Array<{ mapFile: string; cellCount: number }>;
                };
                const mapLines = (conflict.maps ?? [])
                    .map(
                        (m) =>
                            `  • ${m.mapFile} — ${m.cellCount} célula${m.cellCount === 1 ? '' : 's'}`
                    )
                    .join('\n');
                await popup.alert(
                    `Não é possível excluir "${displayName}" — entrou em uso durante a operação.<br><br>${mapLines.replace(/\n/g, '<br>')}`,
                    '⚠️ Sprite em Uso'
                );
                return;
            }

            if (!deleteRes.ok) {
                const err = await deleteRes.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Erro ao excluir sprite.');
            }

            const result = await deleteRes.json();
            toast.success(`Sprite "${displayName}" excluído com sucesso!`);
            console.log('[MapSpriteEditor] Exclusão:', result);

            resetToNewSprite({ silent: true });
            if (serverSelect) serverSelect.value = '';
            await reloadServerMapSpritesList();
            if (afterSaveSpriteHandler) {
                await afterSaveSpriteHandler();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[MapSpriteEditor] Falha ao excluir sprite:', err);
            await popup.alert(`Falha ao excluir sprite: ${msg}`, 'Erro ao Excluir');
        } finally {
            deleteSpriteBtn.disabled = false;
            deleteSpriteBtn.innerText = '🗑️ Excluir';
        }
    });

    void reloadServerMapSpritesList();

    categoryTreeEl?.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest('[data-folder-path]') as HTMLElement | null;
        if (!el?.dataset.folderPath) return;
        categoryInput.value = el.dataset.folderPath;
    });

    // Evento de seleção de sprite existente (vazio = nova sprite)
    serverSelect?.addEventListener('change', () => {
        const val = serverSelect.value;
        if (!val) {
            resetToNewSprite({ silent: true });
            return;
        }

        const borderSetId = parseBorderSetOptionValue(val);
        if (borderSetId) {
            const set = serverBorderSetsList.find((s) => s.id === borderSetId);
            if (set) {
                void loadBorderSetForEdit(set);
            }
            return;
        }

        const sprite = serverSpritesList.find(s => s.relativePath === val);
        if (!sprite) {
            syncDeleteSpriteButtonVisible(false);
            return;
        }

        syncDeleteSpriteButtonVisible(true, 'sprite');

        nameInput.value = sprite.name;
        assetTypeSelect.value = sprite.assetType;
        // Dispara o change para ajustar visibilidade das propriedades
        assetTypeSelect.dispatchEvent(new Event('change'));

        categoryInput.value =
            sprite.category === 'terrain' || sprite.category === 'items'
                ? ''
                : sprite.category ?? '';

        loadedSpriteProperties = sprite.properties;
        loadedSpriteFileKey = sprite.filename;

        if ((sprite.assetType === 'terrain' || sprite.assetType === 'items') && sprite.properties) {
            walkableToggle.checked = sprite.properties.walkable ?? true;
            speedRange.value = (sprite.properties.speedModifier ?? 1.0).toString();
            if (speedValSpan) speedValSpan.innerText = parseFloat(speedRange.value).toFixed(1);
            stairToggle.checked = sprite.properties.isStair ?? false;
            syncVariantGroupFieldsFromProperties(sprite.properties);
        }

        if (anchorXInput) anchorXInput.value = String(sprite.properties?.anchorX ?? 0);
        if (anchorYInput) anchorYInput.value = String(sprite.properties?.anchorY ?? 0);

        // Carrega a imagem física
        isImageLoaded = false;
        toast.info(`Carregando sprite "${sprite.name}"...`);
        
        originalImage = new Image();
        originalImage.src = '/' + sprite.relativePath; // Aponta para a pasta física do projeto servido pelo Vite
        originalImage.onload = async () => {
            await applyChromaProcessing();
            syncCalibrationFromImage(sprite.properties);
            toast.success(`Sprite "${sprite.name}" carregado com sucesso para edição!`);
        };
        originalImage.onerror = () => {
            // Tenta caminho relativo caso o primeiro falhe
            if (originalImage) {
                originalImage.src = sprite.relativePath.startsWith('/')
                    ? sprite.relativePath
                    : '/' + sprite.relativePath;
            }
        };
    });

    async function loadBorderSetForEdit(set: BorderSetManifestEntry): Promise<void> {
        syncDeleteSpriteButtonVisible(true, 'border_set');
        assetTypeSelect.value = 'border_set';
        assetTypeSelect.dispatchEvent(new Event('change'));

        if (borderSetIdInput) borderSetIdInput.value = set.id;
        if (borderSetLabelInput) borderSetLabelInput.value = set.label;
        if (fillTerrainInput) fillTerrainInput.value = set.fillTerrain;
        if (borderCategoryInput) borderCategoryInput.value = set.category;

        const borderWalkableToggle = document.getElementById('mapSpriteBorderWalkableToggle') as HTMLInputElement | null;
        if (borderWalkableToggle) {
            borderWalkableToggle.checked = set.walkable !== false;
        }

        const cal = set.calibration;
        const savedCells = set.cells ?? [];
        const slotGrid = inferBorderSlotGrid(savedCells);
        pendingBorderSetCalibration = {
            frameWidth: cal.frameWidth ?? ENGINE_CONFIG.TILE_SIZE,
            frameHeight: cal.frameHeight ?? ENGINE_CONFIG.TILE_SIZE,
            offsetX: cal.offsetX ?? 0,
            offsetY: cal.offsetY ?? 0,
            gapX: cal.gapX ?? 0,
            gapY: cal.gapY ?? 0,
            gridCols: cal.gridCols ?? 1,
            gridRows: cal.gridRows ?? 1,
            borderSlotCols: (cal as { borderSlotCols?: number }).borderSlotCols ?? slotGrid.cols,
            borderSlotRows: (cal as { borderSlotRows?: number }).borderSlotRows ?? slotGrid.rows,
            borderSetCells: savedCells,
        };

        frameWidthInput.value = String(pendingBorderSetCalibration.frameWidth);
        frameHeightInput.value = String(pendingBorderSetCalibration.frameHeight);
        offsetXInput.value = String(pendingBorderSetCalibration.offsetX);
        offsetYInput.value = String(pendingBorderSetCalibration.offsetY);
        currentCalibration = {
            ...pendingBorderSetCalibration,
            sheetLayout: 'horizontal',
        };

        isImageLoaded = false;
        toast.info(`Carregando conjunto «${set.label}»...`);

        originalImage = new Image();
        const sheetPath = set.sheetRelativePath.startsWith('/')
            ? set.sheetRelativePath
            : `/${set.sheetRelativePath}`;
        originalImage.src = sheetPath;
        originalImage.onload = async () => {
            await applyChromaProcessing();
            toast.success(`Conjunto «${set.label}» pronto para editar (${Object.keys(set.masks).length} máscaras salvas).`);
        };
        originalImage.onerror = () => {
            toast.error(`Não foi possível carregar a sheet do conjunto (${set.sheetRelativePath}).`);
        };
    }

    function syncTerrainPropertiesVisibility(): void {
        const type = assetTypeSelect.value;
        const isSingleSprite = type === 'terrain' || type === 'items';
        const isBorderSet = type === 'border_set';
        if (propertiesBlock) propertiesBlock.style.display = isSingleSprite ? 'block' : 'none';
        if (borderSetBlock) borderSetBlock.style.display = isBorderSet ? 'block' : 'none';
        if (categoryBlock) categoryBlock.style.display = isBorderSet ? 'none' : 'block';
        if (saveServerBtn) {
            (saveServerBtn as HTMLElement).style.display = isBorderSet ? 'none' : '';
        }
        if (saveBorderSetBtn) {
            (saveBorderSetBtn as HTMLElement).style.display = isBorderSet ? '' : 'none';
        }
        if (openCalibratorBtn) {
            openCalibratorBtn.textContent = isBorderSet ? '🔍 Calibrar máscaras' : '🔍 Calibrar Grade';
        }
    }

    variantGroupSelect?.addEventListener('change', () => {
        if (!variantGroupInput || !variantGroupExclude || !variantGroupSelect) return;
        
        const val = variantGroupSelect.value;
        if (val === '_new_group_') {
            variantGroupInput.style.display = 'block';
            variantGroupInput.value = '';
            variantGroupInput.focus();
            variantGroupExclude.checked = false;
        } else if (val === '') {
            variantGroupInput.style.display = 'none';
            variantGroupInput.value = '';
            variantGroupExclude.checked = true;
        } else {
            variantGroupInput.style.display = 'none';
            variantGroupInput.value = val;
            variantGroupExclude.checked = false;
        }
    });

    assetTypeSelect?.addEventListener('change', () => {
        syncTerrainPropertiesVisibility();
        if (assetTypeSelect.value === 'border_set') {
            if (borderSetIdInput && !borderSetIdInput.value.trim()) {
                borderSetIdInput.value = 'grass_edges';
            }
            if (borderSetLabelInput && !borderSetLabelInput.value.trim()) {
                borderSetLabelInput.value = 'Bordas de grama';
            }
            if (fillTerrainInput && !fillTerrainInput.value.trim()) {
                fillTerrainInput.value = 'grass';
            }
            if (borderCategoryInput && !borderCategoryInput.value.trim()) {
                borderCategoryInput.value = 'terrain/borders/grass_edges';
            }
        }
        refreshCategoryDatalist();
    });
    syncTerrainPropertiesVisibility();

    // Atualiza valor do slider de velocidade
    speedRange?.addEventListener('input', () => {
        if (speedValSpan) speedValSpan.innerText = parseFloat(speedRange.value).toFixed(1);
    });

    // Atualiza valor do slider de tolerância chroma
    chromaKeyTolerance?.addEventListener('input', () => {
        if (chromaKeyToleranceVal) chromaKeyToleranceVal.innerText = chromaKeyTolerance.value;
        applyChromaProcessing();
    });

    chromaKeyToggle?.addEventListener('change', () => {
        if (chromaKeyToleranceRow) {
            chromaKeyToleranceRow.style.display = chromaKeyToggle.checked ? 'flex' : 'none';
        }
        applyChromaProcessing();
    });

    async function applyChromaProcessing() {
        if (!originalImage) return;
        isImageLoaded = false;
 
        if (chromaKeyToggle.checked) {
            try {
                const tol = parseInt(chromaKeyTolerance.value) || 50;
                processedImage = await removeChromaKey(originalImage, undefined, tol);
            } catch (err) {
                console.error('[MapSpriteEditor] Falha ao remover Chroma Key:', err);
                processedImage = originalImage;
            }
        } else {
            processedImage = originalImage;
        }
        isImageLoaded = true;
    }

    // Carregar spritesheet PNG
    loadBtn?.addEventListener('click', () => {
        importInput?.click();
    });

    importInput?.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            originalImage = new Image();
            originalImage.src = reader.result as string;
            originalImage.onload = async () => {
                loadedSpriteProperties = undefined;
                loadedSpriteFileKey = undefined;
                await applyChromaProcessing();
                syncCalibrationFromImage();
                toast.success('Imagem da spritesheet carregada com sucesso!');
            };
        };
        reader.readAsDataURL(file);
    });

    // Abrir calibrador de grade aproveitando a lógica existente
    openCalibratorBtn?.addEventListener('click', () => {
        if (!originalImage || !processedImage || !isImageLoaded) {
            toast.info('Carregue uma imagem PNG primeiro.');
            return;
        }

        const imgW = processedImage.naturalWidth || processedImage.width;
        const imgH = processedImage.naturalHeight || processedImage.height;
        const calibration =
            readCalibrationFromForm() ??
            inferMapSpriteCalibration(
                imgW,
                imgH,
                calibrationHintsFromProperties(loadedSpriteProperties as Record<string, unknown> | undefined)
            );

        const mockConfig = {
            name: nameInput.value,
            spriteSheetUrl: processedImage.src,
            frameWidth: calibration.frameWidth,
            frameHeight: calibration.frameHeight,
            defaultDirection: 'down' as const,
            animations: {
                'idle_down': { row: 0, startFrame: 0, frames: 1, speedFps: 5, loop: true }
            },
            offsetX: calibration.offsetX,
            offsetY: calibration.offsetY,
            gapX: calibration.gapX,
            gapY: calibration.gapY,
            anchorX: calibration.anchorX ?? loadedSpriteProperties?.anchorX ?? 0,
            anchorY: calibration.anchorY ?? loadedSpriteProperties?.anchorY ?? 0,
            sheetLayout: calibration.sheetLayout,
        };

        openCharacterCalibrator(
            processedImage,
            mockConfig,
            'idle',
            'down',
            async (result: any) => {
                if (assetTypeSelect.value === 'border_set') {
                    pendingBorderSetCalibration = calibrationFromCalibratorResult(result);
                    frameWidthInput.value = String(pendingBorderSetCalibration.frameWidth);
                    frameHeightInput.value = String(pendingBorderSetCalibration.frameHeight);
                    offsetXInput.value = String(pendingBorderSetCalibration.offsetX);
                    offsetYInput.value = String(pendingBorderSetCalibration.offsetY);
                    currentCalibration = {
                        ...pendingBorderSetCalibration,
                        sheetLayout: 'horizontal',
                    };
                    const assignedMasks = pendingBorderSetCalibration.borderSetCells.filter(
                        (c) => c.mask > 0
                    ).length;
                    toast.success(
                        `Conjunto calibrado: ${pendingBorderSetCalibration.gridCols}×${pendingBorderSetCalibration.gridRows} · ${assignedMasks} máscara(s) ativa(s). Clique em Salvar conjunto.`
                    );
                    return;
                }

                const selCol = result.selectedFrameCol ?? 0;
                const selRow = result.selectedFrameRow ?? 0;
                const targetSize = ENGINE_CONFIG.TILE_SIZE;

                let keepOriginal = false;
                if (result.frameWidth !== targetSize || result.frameHeight !== targetSize) {
                    keepOriginal = await popup.confirm(
                        `O frame calibrado tem tamanho ${result.frameWidth}×${result.frameHeight} px.<br><br>Deseja <strong>manter o tamanho original</strong> para renderizar o sprite como foi criado, ou redimensioná-lo para 32×32 px?`,
                        'Manter tamanho original?'
                    );
                }

                const finalWidth = keepOriginal ? result.frameWidth : targetSize;
                const finalHeight = keepOriginal ? result.frameHeight : targetSize;

                // Recorta o frame selecionado
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = finalWidth;
                cropCanvas.height = finalHeight;
                const cropCtx = cropCanvas.getContext('2d');
                if (cropCtx && processedImage) {
                    const sx = result.offsetX + selCol * (result.frameWidth + result.gapX);
                    const sy = result.offsetY + selRow * (result.frameHeight + result.gapY);
                    
                    // Desativa suavização para preservar a nitidez da Pixel Art ao reduzir
                    cropCtx.imageSmoothingEnabled = false;

                    cropCtx.drawImage(
                        processedImage,
                        sx, sy, result.frameWidth, result.frameHeight,
                        0, 0, finalWidth, finalHeight
                    );

                    const croppedBase64 = cropCanvas.toDataURL('image/png');
                    
                    // Atualiza as imagens no editor
                    originalImage = new Image();
                    originalImage.src = croppedBase64;
                    await new Promise((resolve) => {
                        originalImage!.onload = resolve;
                    });
                    
                    await applyChromaProcessing();
                    
                    // Reseta inputs de fatiamento para o frame único já recortado
                    frameWidthInput.value = finalWidth.toString();
                    frameHeightInput.value = finalHeight.toString();
                    offsetXInput.value = '0';
                    offsetYInput.value = '0';
                    if (anchorXInput) anchorXInput.value = String(result.anchorX ?? 0);
                    if (anchorYInput) anchorYInput.value = String(result.anchorY ?? 0);
                    currentCalibration = {
                        frameWidth: finalWidth,
                        frameHeight: finalHeight,
                        offsetX: 0,
                        offsetY: 0,
                        gapX: 0,
                        gapY: 0,
                        gridCols: 1,
                        gridRows: 1,
                        sheetLayout: 'horizontal',
                        anchorX: result.anchorX ?? 0,
                        anchorY: result.anchorY ?? 0,
                    };
                    
                    toast.success(`Recortado para ${finalWidth}×${finalHeight} px! (Col ${selCol + 1}, Linha ${selRow + 1})`);
                } else {
                    frameWidthInput.value = result.frameWidth.toString();
                    frameHeightInput.value = result.frameHeight.toString();
                    offsetXInput.value = result.offsetX.toString();
                    offsetYInput.value = result.offsetY.toString();
                    if (anchorXInput) anchorXInput.value = String(result.anchorX ?? 0);
                    if (anchorYInput) anchorYInput.value = String(result.anchorY ?? 0);
                    const cols = Math.max(
                        1,
                        Math.floor((imgW - result.offsetX) / (result.frameWidth + result.gapX))
                    );
                    const rows = Math.max(
                        1,
                        Math.floor((imgH - result.offsetY) / (result.frameHeight + result.gapY))
                    );
                    currentCalibration = {
                        frameWidth: result.frameWidth,
                        frameHeight: result.frameHeight,
                        offsetX: result.offsetX,
                        offsetY: result.offsetY,
                        gapX: result.gapX,
                        gapY: result.gapY,
                        gridCols: cols,
                        gridRows: rows,
                        sheetLayout: (result.sheetLayout as 'horizontal' | 'vertical') ?? 'horizontal',
                        anchorX: result.anchorX ?? 0,
                        anchorY: result.anchorY ?? 0,
                    };
                    toast.success('Grade calibrada com sucesso!');
                }
            },
            {
                mode: assetTypeSelect.value === 'border_set' ? 'borderSet' : 'map',
                initialGridCols: calibration.gridCols,
                initialGridRows: calibration.gridRows,
                initialBorderSetCells: pendingBorderSetCalibration?.borderSetCells,
                initialBorderSlotCols: pendingBorderSetCalibration?.borderSlotCols,
                initialBorderSlotRows: pendingBorderSetCalibration?.borderSlotRows,
                borderSetFillTerrain: fillTerrainInput?.value.trim() || 'grass',
                onBatchExport: assetTypeSelect.value === 'border_set' ? undefined : (result, scope) => {
                    if (!processedImage) return;
                    const calibration = calibrationResultToBatchGrid(processedImage, result);
                    const rawPrefix = nameInput.value.trim() || 'grama';
                    openMapSpriteBatchExportModal(
                        processedImage,
                        calibration,
                        {
                            namePrefix: rawPrefix,
                            category: categoryInput.value.trim() || 'grass',
                            variantGroup: variantGroupExclude?.checked
                                ? ''
                                : (variantGroupInput?.value.trim() || 'grass'),
                            walkable: walkableToggle.checked,
                            speedModifier: parseFloat(speedRange.value) || 1,
                            excludeVariantGroup: variantGroupExclude?.checked ?? false,
                        },
                        async () => {
                            await reloadServerMapSpritesList();
                            if (afterSaveSpriteHandler) {
                                await afterSaveSpriteHandler();
                            }
                        },
                        {
                            scope,
                            selectedFrames: result.selectedFrames,
                        }
                    );
                },
            }
        );
    });

    saveBorderSetBtn?.addEventListener('click', async () => {
        if (!originalImage || !processedImage || !isImageLoaded) {
            toast.error('Carregue uma imagem PNG e calibre as máscaras primeiro.');
            return;
        }
        if (!pendingBorderSetCalibration) {
            toast.error('Abra o calibrador, confirme as máscaras e tente salvar de novo.');
            return;
        }

        const setId = (borderSetIdInput?.value.trim() || 'grass_edges')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_');
        const label = borderSetLabelInput?.value.trim() || 'Bordas de grama';
        const fillTerrain = (fillTerrainInput?.value.trim() || 'grass').toLowerCase();
        const category = sanitizeMapSpriteCategory(borderCategoryInput?.value.trim() || `terrain/borders/${setId}`);

        if (!setId) {
            toast.error('Informe um ID válido para o conjunto (ex.: grass_edges).');
            return;
        }

        const maskExports = buildBorderMaskExports(processedImage, pendingBorderSetCalibration, setId);
        if (maskExports.length === 0) {
            toast.error('Atribua pelo menos uma máscara antes de salvar.');
            return;
        }

        const duplicateMasks = getDuplicateBorderMasks(pendingBorderSetCalibration.borderSetCells);
        if (duplicateMasks.length > 0) {
            const ok = await popup.confirm(
                `Máscaras repetidas em vários slots: <strong>${duplicateMasks.join(', ')}</strong>. Só a primeira associação será exportada.<br><br>Corrija no calibrador ou salve assim?`,
                'Máscaras duplicadas'
            );
            if (!ok) return;
        }

        const missingCardinals = getMissingCardinalBorderMasks(pendingBorderSetCalibration.borderSetCells);
        if (missingCardinals.length > 0) {
            const ok = await popup.confirm(
                `Faltam máscaras cardinais: <strong>${missingCardinals.join(', ')}</strong> (N=1, E=2, S=4, O=8).<br><br>Sem elas, bordas retas do mapa ficam incompletas. Salvar mesmo assim?`,
                'Conjunto incompleto'
            );
            if (!ok) return;
        }

        const missingDiagonals = getMissingDiagonalBorderMasks(pendingBorderSetCalibration.borderSetCells);
        if (missingDiagonals.length > 0) {
            const ok = await popup.confirm(
                `Faltam máscaras diagonais: <strong>${missingDiagonals.join(', ')}</strong> (NE=16, SE=32, SO=64, NO=128).<br><br>Cantos diagonais da grama ficarão vazios. Salvar mesmo assim?`,
                'Diagonais opcionais'
            );
            if (!ok) return;
        }

        const borderWalkableToggle = document.getElementById('mapSpriteBorderWalkableToggle') as HTMLInputElement | null;

        try {
            (saveBorderSetBtn as HTMLButtonElement).disabled = true;
            const originalText = saveBorderSetBtn!.innerText;
            saveBorderSetBtn!.innerText = '⌛ Gravando conjunto...';

            await saveBorderSet({
                setId,
                label,
                fillTerrain,
                category,
                sheetBase64: processedImage.src,
                calibration: pendingBorderSetCalibration,
                masks: maskExports,
                walkable: borderWalkableToggle ? borderWalkableToggle.checked : true,
            });

            toast.success(
                `Conjunto «${label}» salvo (${maskExports.length} máscara${maskExports.length === 1 ? '' : 's'}).`
            );
            saveBorderSetBtn!.innerText = originalText;
            (saveBorderSetBtn as HTMLButtonElement).disabled = false;

            await reloadServerMapSpritesList();
            await reloadBorderSetsFromServer();
            if (serverSelect) {
                serverSelect.value = borderSetOptionValue(setId);
            }
            if (afterSaveSpriteHandler) {
                await afterSaveSpriteHandler();
            }
            if (afterBorderSetSaveHandler) {
                await afterBorderSetSaveHandler();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[MapSpriteEditor] Falha ao salvar conjunto auto-borda:', err);
            popup.alert(`Falha ao salvar conjunto: ${msg}`, 'Erro ao Salvar');
            saveBorderSetBtn!.innerText = '💾 Salvar conjunto';
            (saveBorderSetBtn as HTMLButtonElement).disabled = false;
        }
    });

    // Salvar no Servidor
    saveServerBtn?.addEventListener('click', async () => {
        if (!originalImage || !processedImage || !isImageLoaded) {
            toast.error('Nenhuma imagem carregada para salvar.');
            return;
        }

        const name = nameInput.value.trim();
        if (!name) {
            toast.error('Por favor, informe o nome do sprite.');
            return;
        }

        try {
            (saveServerBtn as HTMLButtonElement).disabled = true;
            const originalText = saveServerBtn.innerText;
            saveServerBtn.innerText = '⌛ Gravando...';

            const properties: Record<string, unknown> = {
                walkable: walkableToggle.checked,
                speedModifier: parseFloat(speedRange.value) || 1.0,
                isStair: stairToggle.checked,
            };

            if (
                (assetTypeSelect.value === 'terrain' || assetTypeSelect.value === 'items') &&
                variantGroupInput &&
                variantGroupExclude &&
                !variantGroupExclude.checked
            ) {
                const group = sanitizeVariantGroup(variantGroupInput.value);
                if (group) {
                    properties.variantGroup = group;
                    variantGroupInput.value = group;
                }
            }

            const calForSave = readCalibrationFromForm();
            if (calForSave) {
                Object.assign(properties, calibrationToPropertyPayload(calForSave));
            }

            const rawCategory = categoryInput.value.trim();
            const category = sanitizeMapSpriteCategory(rawCategory);
            if (rawCategory && !category) {
                toast.error(
                    'Subpasta inválida. Use apenas letras, números, _ - e / (sem ..).'
                );
                (saveServerBtn as HTMLButtonElement).disabled = false;
                saveServerBtn!.innerText = '💾 Salvar no Servidor';
                return;
            }
            if (rawCategory && rawCategory !== category) {
                categoryInput.value = category;
                toast.info(`Subpasta ajustada para: "${category}"`);
            }

            const payload = {
                name: name,
                assetType: assetTypeSelect.value,
                category,
                spriteBase64: processedImage.src,
                fileKey: loadedSpriteFileKey ?? fileKeyFromDisplayName(name),
                previousFileKey: loadedSpriteFileKey,
                properties,
            };

            const response = await apiFetch('/api/save-map-sprite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Erro ao gravar no servidor.');
            }

            const result = await response.json();
            toast.success(`Sprite "${result.name}" salvo com sucesso no servidor! O Vite recarregará o editor automaticamente.`);

            if (result.fileKey) {
                loadedSpriteFileKey = String(result.fileKey);
            }

            saveServerBtn.innerText = originalText;
            (saveServerBtn as HTMLButtonElement).disabled = false;

            const selectedPath = serverSelect?.value || undefined;
            await reloadServerMapSpritesList(selectedPath);
            if (selectedPath) {
                const refreshed = serverSpritesList.find((s) => s.relativePath === selectedPath);
                if (refreshed) {
                    loadedSpriteProperties = refreshed.properties;
                    loadedSpriteFileKey = refreshed.filename;
                }
            }
            if (afterSaveSpriteHandler) {
                await afterSaveSpriteHandler();
            }
        } catch (err: any) {
            console.error('[MapSpriteEditor] Falha ao salvar no servidor:', err);
            popup.alert(`Falha ao salvar no servidor: ${err.message}`, 'Erro ao Salvar');
            saveServerBtn.innerText = '💾 Salvar no Servidor';
            (saveServerBtn as HTMLButtonElement).disabled = false;
        }
    });

    // Loop de visualização estática do frame 0 fatiado no preview do painel
    function drawPreviewLoop() {
        requestAnimationFrame(drawPreviewLoop);

        if (!previewCtx) return;
        
        // Otimização: Não renderiza se o painel estiver oculto ou se modais estiverem por cima
        if (!previewCanvas.offsetParent) return;
        
        const calibratorModal = document.getElementById('characterCalibratorModal');
        if (calibratorModal?.classList.contains('is-open')) return;
        
        const exportModal = document.getElementById('mapSpriteBatchExportModal');
        if (exportModal?.classList.contains('is-open')) return;

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        if (!isImageLoaded || !processedImage) {
            previewCtx.fillStyle = '#3f4452';
            previewCtx.font = '10px sans-serif';
            previewCtx.textAlign = 'center';
            previewCtx.textBaseline = 'middle';
            previewCtx.fillText('Sem Sprite', previewCanvas.width / 2, previewCanvas.height / 2);
            return;
        }

        const tileSize = ENGINE_CONFIG.TILE_SIZE;
        const fw = parseInt(frameWidthInput.value, 10) || tileSize;
        const fh = parseInt(frameHeightInput.value, 10) || tileSize;
        const ox = parseInt(offsetXInput.value) || 0;
        const oy = parseInt(offsetYInput.value) || 0;
        const ax = anchorXInput
            ? parseIntField(anchorXInput.value, currentCalibration?.anchorX ?? 0)
            : currentCalibration?.anchorX ?? 0;
        const ay = anchorYInput
            ? parseIntField(anchorYInput.value, currentCalibration?.anchorY ?? 0)
            : currentCalibration?.anchorY ?? 0;

        // 1. Desenha a célula de referência 32x32 centralizada
        const baseTileSize = 32;
        const scale = 1; // O canvas já tem 64x64px, então scale=1 centraliza a célula de 32x32px com 16px de margem
        const tileW = baseTileSize * scale;
        const tileH = baseTileSize * scale;
        const tileX = (previewCanvas.width - tileW) / 2;
        const tileY = (previewCanvas.height - tileH) / 2;

        // Fundo azul translúcido do tile
        previewCtx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        previewCtx.fillRect(tileX, tileY, tileW, tileH);

        // Borda azul pontilhada do tile
        previewCtx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        previewCtx.lineWidth = 1.5;
        previewCtx.setLineDash([4, 4]);
        previewCtx.strokeRect(tileX, tileY, tileW, tileH);
        previewCtx.setLineDash([]);

        // 2. Calcula posição do sprite com âncoras aplicadas
        // Posição de repouso padrão: Centralizado no X, Alinhado ao bottom no Y do tile
        const charBaseX = tileX + ((baseTileSize - fw) / 2) * scale;
        const charBaseY = tileY + (baseTileSize - fh) * scale;

        const drawX = charBaseX + ax * scale;
        const drawY = charBaseY + ay * scale;
        const drawW = fw * scale;
        const drawH = fh * scale;

        // Desenha o sprite com pixel-art perfeita
        previewCtx.imageSmoothingEnabled = false;
        previewCtx.drawImage(
            processedImage,
            ox, oy, fw, fh,
            drawX, drawY, drawW, drawH
        );

        // 3. Desenha a cruz vermelha indicando o ponto de âncora/piso (Bottom-Center do tile de 32x32)
        const targetX = tileX + tileW / 2;
        const targetY = tileY + tileH;
        previewCtx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // Vermelho vivo
        previewCtx.lineWidth = 2;
        previewCtx.beginPath();
        // Linha horizontal
        previewCtx.moveTo(targetX - 8, targetY);
        previewCtx.lineTo(targetX + 8, targetY);
        // Linha vertical
        previewCtx.moveTo(targetX, targetY - 8);
        previewCtx.lineTo(targetX, targetY + 8);
        previewCtx.stroke();
    }

    requestAnimationFrame(drawPreviewLoop);

}
