import { serializeCharacterConfig, parseCharacterConfig, createDefaultCharacterConfig } from '../character/characterSerializer';
import type { SpriteAnimationController } from '../character/spriteAnimation';
import type { CharacterState, Direction } from '../character/spriteAnimation';
import { resolveAnimationSourceRect } from '../character/sheetFrameLayout';
import { openCharacterCalibrator } from './characterCalibratorModal';
import {
    CharacterAnimationDraft,
    parseAnimationInputFields,
    type AnimationInputValues,
} from './characterAnimationDraft';
import {
    fillVocationSelect,
    VOCATIONS_UPDATED_EVENT,
    type VocationsMap,
} from '../game-data/vocationUi';
import { getRuntimeVocations, loadRuntimeVocations } from '../game-data/vocationRegistry';
import { apiFetch } from '../shared/apiFetch';
import { toast, popup } from '../utils/popup';
import { upscalePixelArtDataUrl } from '../utils/imageProcessor';
import { renderFolderTree } from './folderTree';
import { buildConfigPathFromSave, upsertCreaturePreset } from './creaturePresetRegistry';
import {
    computeCreatureDrawScale,
    getCreaturePreset,
    type CreatureVisualSize,
} from './creaturePresets';

const CHARACTERS_DIR_LABEL = 'tiles/characters';
const NEW_DRAFT_OPTION = '__new__';

function profileEntityLabel(profile: SpriteEditorProfile): string {
    if (profile.id === 'npc') return 'NPC';
    if (profile.id === 'monster') return 'Mob';
    return 'Outfit';
}

export type SpriteProfileId = 'player' | 'npc' | 'monster';

export interface ServerCharacterEntry {
    name: string;
    category: string;
    relativePath: string;
    config: Record<string, unknown>;
}

export interface SpriteEditorProfile {
    id: SpriteProfileId;
    flyoutTitle: string;
    defaultCategory: string;
    creatureType?: 'npc' | 'monster';
    listFilter?: (entry: ServerCharacterEntry) => boolean;
    localStorageKey?: string | null;
    defaultVisualSize?: CreatureVisualSize;
    defaultColor?: string;
}

export interface SpriteSheetEditorHandle {
    setProfile: (id: SpriteProfileId) => void;
    getActiveProfileId: () => SpriteProfileId;
    getFlyoutTitle: (id: SpriteProfileId) => string;
}

export interface InitSpriteSheetEditorOptions {
    controllers: Record<SpriteProfileId, SpriteAnimationController>;
    profiles: Record<SpriteProfileId, SpriteEditorProfile>;
    initialProfileId?: SpriteProfileId;
    onCatalogChanged?: () => Promise<void>;
}

function categoryFromRelativePath(relativePath: string): string {
    const parts = relativePath.replace(/\\/g, '/').split('/');
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
}

function collectCharacterCategories(characters: ServerCharacterEntry[], folders: string[]): string[] {
    const set = new Set<string>();
    for (const folder of folders) {
        if (folder.trim()) set.add(folder.trim());
    }
    for (const char of characters) {
        const fromConfig = String(char.category ?? '').trim();
        if (fromConfig) set.add(fromConfig);
        const fromPath = categoryFromRelativePath(char.relativePath);
        if (fromPath) set.add(fromPath);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
}

function entryMatchesProfile(entry: ServerCharacterEntry, profile: SpriteEditorProfile): boolean {
    return !profile.listFilter || profile.listFilter(entry);
}

function categoryPrefixFilter(prefix: string) {
    return (entry: ServerCharacterEntry) => {
        const cat = (entry.category || categoryFromRelativePath(entry.relativePath)).toLowerCase();
        const p = prefix.toLowerCase();
        return cat === p || cat.startsWith(`${p}/`);
    };
}

export function buildDefaultSpriteEditorProfiles(): Record<SpriteProfileId, SpriteEditorProfile> {
    return {
        player: {
            id: 'player',
            flyoutTitle: 'Visual (Outfit)',
            defaultCategory: '',
            localStorageKey: 'game2d_active_character_config',
        },
        npc: {
            id: 'npc',
            flyoutTitle: 'Criar NPC',
            defaultCategory: 'npcs',
            creatureType: 'npc',
            listFilter: categoryPrefixFilter('npcs'),
            defaultVisualSize: 'medium',
            defaultColor: '#10b981',
        },
        monster: {
            id: 'monster',
            flyoutTitle: 'Criar Mob',
            defaultCategory: 'monstros',
            creatureType: 'monster',
            listFilter: categoryPrefixFilter('monstros'),
            defaultVisualSize: 'medium',
            defaultColor: '#fb7185',
        },
    };
}

export function initSpriteSheetEditor(options: InitSpriteSheetEditorOptions): SpriteSheetEditorHandle {
    const { controllers, profiles, onCatalogChanged } = options;
    let activeProfileId: SpriteProfileId = options.initialProfileId ?? 'player';

    const getProfile = () => profiles[activeProfileId];
    const getController = () => controllers[activeProfileId];

    function saveConfigToLocalStorage(): void {
        const key = getProfile().localStorageKey;
        if (!key) return;
        try {
            localStorage.setItem(key, JSON.stringify(getController().config));
        } catch (e) {
            if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                try {
                    const configCopy = { ...getController().config };
                    configCopy.spriteSheetUrl = 'tiles/characters/knight.png';
                    localStorage.setItem(key, JSON.stringify(configCopy));
                } catch (innerErr) {
                    console.error('[SpriteSheetEditor] Falha ao salvar config reduzida:', innerErr);
                }
            }
        }
    }

    const frameWidthEl = document.getElementById('charFrameWidth') as HTMLInputElement;
    const frameHeightEl = document.getElementById('charFrameHeight') as HTMLInputElement;
    const offsetXEl = document.getElementById('charOffsetX') as HTMLInputElement;
    const offsetYEl = document.getElementById('charOffsetY') as HTMLInputElement;
    const gapXEl = document.getElementById('charGapX') as HTMLInputElement;
    const gapYEl = document.getElementById('charGapY') as HTMLInputElement;
    const anchorXEl = document.getElementById('charAnchorX') as HTMLInputElement;
    const anchorYEl = document.getElementById('charAnchorY') as HTMLInputElement;
    const animStateEl = document.getElementById('charAnimState') as HTMLSelectElement;
    const animDirEl = document.getElementById('charAnimDir') as HTMLSelectElement;
    const animRowEl = document.getElementById('charAnimRow') as HTMLInputElement;
    const animStartFrameEl = document.getElementById('charAnimStartFrame') as HTMLInputElement;
    const animFramesEl = document.getElementById('charAnimFrames') as HTMLInputElement;
    const animSpeedEl = document.getElementById('charAnimSpeed') as HTMLInputElement;
    const previewCanvas = document.getElementById('charPreviewCanvas') as HTMLCanvasElement;
    const previewCtx = previewCanvas?.getContext('2d');
    const exportBtn = document.getElementById('exportCharBtn');
    const importBtn = document.getElementById('importCharBtn');
    const saveServerBtn = document.getElementById('saveServerBtn');
    const deleteServerBtn = document.getElementById('deleteServerBtn');
    const charNewBtn = document.getElementById('charNewBtn');
    const charRefreshListBtn = document.getElementById('charRefreshListBtn');
    const charCategoryLabelEl = document.getElementById('charCategoryLabel');
    const charSpawnDescriptionLabelEl = document.getElementById('charSpawnDescriptionLabel');
    const charVisualSizeHintEl = document.getElementById('charVisualSizeHint');
    const upscaleSpriteHintEl = document.getElementById('upscaleSpriteHint');
    const importInput = document.getElementById('importCharInput') as HTMLInputElement;
    const loadSpriteBtn = document.getElementById('loadSpriteBtn');
    const importSpriteInput = document.getElementById('importSpriteInput') as HTMLInputElement;
    const upscaleSpriteRow = document.getElementById('upscaleSpriteRow');
    const upscaleSprite2xBtn = document.getElementById('upscaleSprite2xBtn');
    const upscaleSprite3xBtn = document.getElementById('upscaleSprite3xBtn');
    const templateSelectEl = document.getElementById('charTemplateSelect') as HTMLSelectElement;
    const chromaKeyToggleEl = document.getElementById('charChromaKeyToggle') as HTMLInputElement;
    const chromaKeyToleranceRowEl = document.getElementById('charChromaKeyToleranceRow') as HTMLDivElement;
    const chromaKeyToleranceEl = document.getElementById('charChromaKeyTolerance') as HTMLInputElement;
    const chromaKeyToleranceValSpan = document.getElementById('charChromaKeyToleranceVal') as HTMLSpanElement;
    const charNameInputEl = document.getElementById('charNameInput') as HTMLInputElement;
    const charCategoryInputEl = document.getElementById('charCategoryInput') as HTMLInputElement;
    const charCategoryDatalistEl = document.getElementById('charCategoryList') as HTMLDataListElement | null;
    const charCategoryTreeEl = document.getElementById('charCategoryTree') as HTMLDivElement | null;
    const sheetLayoutEl = document.getElementById('charSheetLayout') as HTMLSelectElement;
    const charServerSelectEl = document.getElementById('charServerSelect') as HTMLSelectElement;
    const charNameLabelEl = document.getElementById('charNameLabel');
    const charServerLabelEl = document.getElementById('charServerLabel');
    const creatureMetaSectionEl = document.getElementById('charCreatureMetaSection') as HTMLElement | null;
    const visualSizeEl = document.getElementById('charVisualSize') as HTMLSelectElement | null;
    const spawnColorEl = document.getElementById('charSpawnColor') as HTMLInputElement | null;
    const spawnDescriptionEl = document.getElementById('charSpawnDescription') as HTMLInputElement | null;
    const registerInPaletteEl = document.getElementById('charRegisterInPalette') as HTMLInputElement | null;

    let serverCharactersList: ServerCharacterEntry[] = [];
    let serverCharacterFolders: string[] = [];

    function refreshCategoryDatalist(): void {
        const profile = getProfile();
        const filtered = serverCharactersList.filter((e) => entryMatchesProfile(e, profile));
        const categories = collectCharacterCategories(filtered, serverCharacterFolders);
        if (charCategoryDatalistEl) {
            charCategoryDatalistEl.innerHTML = '';
            for (const cat of categories) {
                const opt = document.createElement('option');
                opt.value = cat;
                charCategoryDatalistEl.appendChild(opt);
            }
        }
        if (charCategoryTreeEl) {
            charCategoryTreeEl.innerHTML = renderFolderTree(CHARACTERS_DIR_LABEL, serverCharacterFolders);
        }
    }

    async function reloadServerCharactersList(): Promise<void> {
        if (!charServerSelectEl) return;
        try {
            const response = await apiFetch('/api/list-characters');
            if (!response.ok) throw new Error('Falha ao listar');
            const result = await response.json();
            serverCharactersList = result.characters || [];
            serverCharacterFolders = result.folders || [];
            refreshCategoryDatalist();
            const profile = getProfile();
            const filtered = serverCharactersList.filter((e) => entryMatchesProfile(e, profile));
            const placeholders: Record<SpriteProfileId, string> = {
                player: '-- Selecionar Outfit --',
                npc: '-- Selecionar NPC --',
                monster: '-- Selecionar Mob --',
            };
            charServerSelectEl.innerHTML = `<option value="">${placeholders[profile.id]}</option>`;
            const newOpt = document.createElement('option');
            newOpt.value = NEW_DRAFT_OPTION;
            newOpt.textContent = `✨ Novo ${profileEntityLabel(profile)}`;
            charServerSelectEl.appendChild(newOpt);
            const categories: Record<string, ServerCharacterEntry[]> = {};
            filtered.forEach((char) => {
                const catName = char.category || categoryFromRelativePath(char.relativePath) || 'Raiz';
                if (!categories[catName]) categories[catName] = [];
                categories[catName].push(char);
            });
            Object.keys(categories).sort().forEach((catName) => {
                const group = document.createElement('optgroup');
                group.label = catName;
                categories[catName].forEach((char) => {
                    const opt = document.createElement('option');
                    opt.value = char.relativePath;
                    opt.innerText = char.name;
                    group.appendChild(opt);
                });
                charServerSelectEl.appendChild(group);
            });
        } catch (err) {
            console.error('[SpriteSheetEditor] Erro ao listar:', err);
        }
    }

    function updateDeleteButtonVisibility(): void {
        if (!deleteServerBtn || !charServerSelectEl) return;
        const path = charServerSelectEl.value;
        const canDelete = !!path && path !== NEW_DRAFT_OPTION;
        deleteServerBtn.style.display = canDelete ? '' : 'none';
        deleteServerBtn.innerText = `🗑️ Excluir ${profileEntityLabel(getProfile())}`;
    }

    function applyProfileUi(): void {
        const profile = getProfile();
        const entity = profileEntityLabel(profile);
        if (charNameLabelEl) {
            charNameLabelEl.textContent =
                profile.id === 'player' ? 'Nome do Visual (Outfit) *' : profile.id === 'npc' ? 'Nome do NPC *' : 'Nome do Mob *';
        }
        if (charServerLabelEl) {
            charServerLabelEl.textContent = profile.id === 'player' ? 'Carregar Outfit do Servidor' : 'Carregar existente';
        }
        if (creatureMetaSectionEl) creatureMetaSectionEl.style.display = profile.creatureType ? 'block' : 'none';
        if (charSpawnDescriptionLabelEl) {
            charSpawnDescriptionLabelEl.textContent = profile.creatureType ? 'Descrição *' : 'Descrição';
        }
        if (charCategoryLabelEl) {
            charCategoryLabelEl.textContent = profile.creatureType
                ? 'Subpasta em tiles/characters *'
                : 'Subpasta em tiles/characters';
        }

        const playerMetaSectionEl = document.getElementById('charPlayerMetaSection');
        if (playerMetaSectionEl) playerMetaSectionEl.style.display = profile.id === 'player' ? 'block' : 'none';

        if (charNameInputEl) {
            charNameInputEl.placeholder =
                profile.id === 'monster' ? 'Obrigatório — ex: Rato' : profile.id === 'npc' ? 'Obrigatório — ex: Vendedor' : 'Obrigatório — ex: Knight Custom';
        }
        if (charCategoryInputEl) {
            charCategoryInputEl.placeholder = profile.creatureType
                ? `Obrigatório — ex: ${profile.defaultCategory || 'monstros'}`
                : 'Opcional — ex: vocations/male';
        }
        if (visualSizeEl && profile.defaultVisualSize) visualSizeEl.value = profile.defaultVisualSize;
        if (spawnColorEl && profile.defaultColor) spawnColorEl.value = profile.defaultColor;
        if (registerInPaletteEl) registerInPaletteEl.checked = !!profile.creatureType;
        updateVisualSizeHint();
        if (charNewBtn) {
            charNewBtn.textContent = `✨ Novo ${entity}`;
            charNewBtn.title = `Limpar formulário e começar um ${entity.toLowerCase()} do zero`;
        }
        void reloadServerCharactersList();
        syncControllerToUI();
        updateDeleteButtonVisibility();
    }

    function resetToNewDraft(options?: { silent?: boolean }): void {
        const ctrl = getController();
        const profile = getProfile();
        ctrl.config = {
            ...createDefaultCharacterConfig(),
            name: '',
            category: '',
            spriteSheetUrl: '',
        };
        ctrl.currentState = 'idle';
        ctrl.currentDirection = 'down';
        ctrl.isLoaded = false;
        ctrl.image = null;

        if (charNameInputEl) charNameInputEl.value = '';
        if (charCategoryInputEl) charCategoryInputEl.value = '';
        if (spawnDescriptionEl) spawnDescriptionEl.value = '';
        if (charServerSelectEl) charServerSelectEl.value = '';
        if (importSpriteInput) importSpriteInput.value = '';
        if (templateSelectEl) templateSelectEl.value = 'custom';

        syncControllerToUI();
        saveConfigToLocalStorage();
        updateDeleteButtonVisibility();
        if (!options?.silent) {
            toast.info(`Formulário limpo — pronto para um novo ${profileEntityLabel(profile).toLowerCase()}.`);
        }
    }

    function updateVisualSizeHint(): void {
        if (!charVisualSizeHintEl || !visualSizeEl) return;
        const profile = getProfile();
        if (!profile.creatureType) {
            charVisualSizeHintEl.textContent = '';
            return;
        }
        const ctrl = getController();
        const vs = (visualSizeEl.value || 'medium') as CreatureVisualSize;
        const fw = ctrl.config.frameWidth || 32;
        const fh = ctrl.config.frameHeight || 32;
        const scale = computeCreatureDrawScale(fw, fh, vs);
        const displayPx = Math.round(Math.max(fw, fh) * scale);
        const native = Math.max(fw, fh);
        const playerPx = 32;
        const sameAsPlayer = native > playerPx && vs === 'medium';
        charVisualSizeHintEl.textContent =
            `Não altera a PNG. Frame ${fw}×${fh}px → ~${displayPx}px no mapa (escala ${Math.round(scale * 100)}%).` +
            (sameAsPlayer
                ? ` Com arte ${native}px, Medium reduz para ~${playerPx}px (altura do tile do player). Se parecer menor que o knight, tente Large/Boss — o desenho pode não preencher a célula.`
                : ' Calibre a grade no tamanho real da arte; use ⚡2x só se a arte foi desenhada em 32px.');
    }

    function validateBeforeSave(): string | null {
        syncUIToController();
        const profile = getProfile();
        const name = charNameInputEl?.value.trim() ?? '';
        if (!name) {
            return profile.creatureType
                ? `Informe o nome do ${profileEntityLabel(profile).toLowerCase()}.`
                : 'Informe o nome do outfit.';
        }
        if (profile.creatureType) {
            const category = charCategoryInputEl?.value.trim() ?? '';
            if (!category) {
                return 'Informe a subpasta (ex: monstros ou npcs).';
            }
            const description = spawnDescriptionEl?.value.trim() ?? '';
            if (!description) {
                return 'Informe a descrição para a paleta de spawns.';
            }
        }
        return null;
    }

    function setProfile(id: SpriteProfileId): void {
        activeProfileId = id;
        applyProfileUi();
    }

    const emptyHandle: SpriteSheetEditorHandle = {
        setProfile,
        getActiveProfileId: () => activeProfileId,
        getFlyoutTitle: (id) => profiles[id].flyoutTitle,
    };

    if (!previewCanvas || !previewCtx) return emptyHandle;

    let animDraft: CharacterAnimationDraft | null = null;

    function parsePanelAnimInputs(): AnimationInputValues {
        return parseAnimationInputFields(
            {
                row: animRowEl.value,
                startFrame: animStartFrameEl.value,
                frames: animFramesEl.value,
                speedFps: animSpeedEl.value,
            },
            { defaultSpeedFps: 1 }
        );
    }

    function applyPanelAnimInputs(values: AnimationInputValues): void {
        animRowEl.value = String(values.row);
        animStartFrameEl.value = String(values.startFrame);
        animFramesEl.value = String(values.frames);
        animSpeedEl.value = String(values.speedFps);
    }

    function refreshAnimDraft(): void {
        const config = getController().config;
        animDraft = new CharacterAnimationDraft(
            config.animations,
            animStateEl.value as CharacterState,
            animDirEl.value as Direction,
            { clone: false, defaultSpeedFps: 1 }
        );
    }

    function syncControllerToUI(): void {
        if (!frameWidthEl || !frameHeightEl) return;
        const ctrl = getController();
        const config = ctrl.config;
        frameWidthEl.value = config.frameWidth.toString();
        frameHeightEl.value = config.frameHeight.toString();
        if (upscaleSpriteRow && upscaleSprite2xBtn && upscaleSprite3xBtn) {
            const fw = config.frameWidth;
            const show2x = ctrl.isLoaded && fw < 64;
            const show3x = ctrl.isLoaded && fw <= 48;
            const showUpscale = show2x || show3x;
            upscaleSpriteRow.style.display = showUpscale ? 'flex' : 'none';
            if (upscaleSpriteHintEl) upscaleSpriteHintEl.style.display = showUpscale ? 'block' : 'none';
            upscaleSprite2xBtn.style.display = show2x ? 'block' : 'none';
            upscaleSprite3xBtn.style.display = show3x ? 'block' : 'none';
            if (show2x) {
                upscaleSprite2xBtn.textContent = `⚡ 2x (${fw}→${fw * 2}px)`;
            }
            if (show3x) {
                upscaleSprite3xBtn.textContent = `⚡ 3x (${fw}→${fw * 3}px)`;
            }
        }
        offsetXEl.value = String(config.offsetX ?? 0);
        offsetYEl.value = String(config.offsetY ?? 0);
        gapXEl.value = String(config.gapX ?? 0);
        gapYEl.value = String(config.gapY ?? 0);
        anchorXEl.value = String(config.anchorX ?? 0);
        anchorYEl.value = String(config.anchorY ?? 0);
        refreshAnimDraft();
        applyPanelAnimInputs(animDraft!.writeInputsForActive());
        if (chromaKeyToggleEl && chromaKeyToleranceRowEl && chromaKeyToleranceEl && chromaKeyToleranceValSpan) {
            chromaKeyToggleEl.checked = !!config.chromaKey;
            chromaKeyToleranceRowEl.style.display = config.chromaKey ? 'flex' : 'none';
            const tolerance = config.chromaKeyTolerance ?? 50;
            chromaKeyToleranceEl.value = String(tolerance);
            chromaKeyToleranceValSpan.innerText = String(tolerance);
        }
        if (charNameInputEl) charNameInputEl.value = config.name || '';
        if (charCategoryInputEl) charCategoryInputEl.value = config.category || getProfile().defaultCategory;
        if (sheetLayoutEl) sheetLayoutEl.value = config.sheetLayout || 'horizontal';

        const playerVocationEl = document.getElementById('charPlayerVocation') as HTMLSelectElement | null;
        const playerGenderEl = document.getElementById('charPlayerGender') as HTMLSelectElement | null;
        const playerShowInCreationEl = document.getElementById('charPlayerShowInCreation') as HTMLInputElement | null;
        if (playerVocationEl) playerVocationEl.value = (config as any).vocation || 'knight';
        if (playerGenderEl) playerGenderEl.value = (config as any).gender || 'male';
        if (playerShowInCreationEl) playerShowInCreationEl.checked = (config as any).showInCreation !== false;
        updateVisualSizeHint();
    }

    function syncUIToController(): void {
        const ctrl = getController();
        const config = ctrl.config;
        const fw = parseInt(frameWidthEl.value, 10);
        config.frameWidth = Number.isNaN(fw) || fw < 1 ? 64 : fw;
        const fh = parseInt(frameHeightEl.value, 10);
        config.frameHeight = Number.isNaN(fh) || fh < 1 ? 64 : fh;
        config.offsetX = parseInt(offsetXEl.value, 10) || 0;
        config.offsetY = parseInt(offsetYEl.value, 10) || 0;
        config.gapX = parseInt(gapXEl.value, 10) || 0;
        config.gapY = parseInt(gapYEl.value, 10) || 0;
        config.anchorX = parseInt(anchorXEl.value, 10) || 0;
        config.anchorY = parseInt(anchorYEl.value, 10) || 0;
        if (!animDraft) refreshAnimDraft();
        animDraft!.flushActive(parsePanelAnimInputs());
        ctrl.setState(ctrl.currentState);
        if (chromaKeyToggleEl) config.chromaKey = chromaKeyToggleEl.checked;
        if (chromaKeyToleranceEl) config.chromaKeyTolerance = parseInt(chromaKeyToleranceEl.value, 10) || 50;
        if (charNameInputEl) config.name = charNameInputEl.value.trim();
        if (charCategoryInputEl) config.category = charCategoryInputEl.value.trim();
        if (sheetLayoutEl) config.sheetLayout = sheetLayoutEl.value as 'horizontal' | 'vertical';

        const playerVocationEl = document.getElementById('charPlayerVocation') as HTMLSelectElement | null;
        const playerGenderEl = document.getElementById('charPlayerGender') as HTMLSelectElement | null;
        const playerShowInCreationEl = document.getElementById('charPlayerShowInCreation') as HTMLInputElement | null;
        if (playerVocationEl) (config as any).vocation = playerVocationEl.value;
        if (playerGenderEl) (config as any).gender = playerGenderEl.value;
        if (playerShowInCreationEl) (config as any).showInCreation = playerShowInCreationEl.checked;

        saveConfigToLocalStorage();
    }

    async function registerInCreatureCatalog(configName: string, category: string): Promise<void> {
        const profile = getProfile();
        if (!profile.creatureType || !registerInPaletteEl?.checked) return;
        await upsertCreaturePreset({
            name: configName,
            type: profile.creatureType,
            configPath: buildConfigPathFromSave(category, configName),
            description: spawnDescriptionEl?.value?.trim() || '',
            color: spawnColorEl?.value || profile.defaultColor,
            visualSize: (visualSizeEl?.value || profile.defaultVisualSize || 'medium') as CreatureVisualSize,
        });
        await onCatalogChanged?.();
    }

    async function saveActiveCharacterToServer(showToastOnSuccess = true): Promise<void> {
        const ctrl = getController();
        const validationError = validateBeforeSave();
        if (validationError) {
            toast.error(validationError);
            return;
        }
        if (!ctrl.isLoaded || !ctrl.image) {
            toast.error('Nenhuma imagem de spritesheet carregada para salvar.');
            return;
        }
        try {
            const originalText = saveServerBtn?.innerText ?? '💾 Salvar no Servidor';
            if (saveServerBtn) {
                (saveServerBtn as HTMLButtonElement).disabled = true;
                saveServerBtn.innerText = '⌛ Gravando...';
            }
            syncUIToController();
            const configCopy = JSON.parse(JSON.stringify(ctrl.config));
            const spriteBase64 = configCopy.spriteSheetUrl.startsWith('data:image/') ? configCopy.spriteSheetUrl : null;
            const response = await apiFetch('/api/save-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: configCopy.name, category: configCopy.category, spriteBase64, configJson: configCopy }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro no servidor.');
            }
            const result = await response.json();
            ctrl.config.spriteSheetUrl = result.spriteSheetUrl;
            saveConfigToLocalStorage();
            const category = configCopy.category || getProfile().defaultCategory;
            try {
                await registerInCreatureCatalog(result.name, category);
            } catch (catalogErr) {
                console.warn('[SpriteSheetEditor] Catálogo não atualizado:', catalogErr);
            }

            if (activeProfileId === 'player') {
                try {
                    await apiFetch('/api/upsert-outfit-preset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: result.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                            name: result.name,
                            vocationId: (configCopy as any).vocation || 'knight',
                            gender: (configCopy as any).gender || 'male',
                            spriteSheetUrl: result.spriteSheetUrl,
                            showInCreation: (configCopy as any).showInCreation !== false
                        })
                    });
                } catch (presetErr) {
                    console.warn('[SpriteSheetEditor] Erro ao salvar preset de outfit:', presetErr);
                }
            }

            if (showToastOnSuccess) {
                const labels = { player: 'Personagem', npc: 'NPC', monster: 'Mob' };
                toast.success(`${labels[getProfile().id]} "${result.name}" salvo!`);
            }
            if (saveServerBtn) {
                saveServerBtn.innerText = originalText;
                (saveServerBtn as HTMLButtonElement).disabled = false;
            }
            await reloadServerCharactersList();
            const match = serverCharactersList.find((c) => c.name === result.name);
            if (charServerSelectEl && match) {
                charServerSelectEl.value = match.relativePath;
                updateDeleteButtonVisibility();
            }
        } catch (err: unknown) {
            popup.alert(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`, 'Erro');
            if (saveServerBtn) {
                saveServerBtn.innerText = '💾 Salvar no Servidor';
                (saveServerBtn as HTMLButtonElement).disabled = false;
            }
        }
    }

    templateSelectEl?.addEventListener('change', () => {
        const val = templateSelectEl.value;
        const config = getController().config;
        config.offsetX = config.offsetY = config.gapX = config.gapY = config.anchorX = config.anchorY = 0;
        if (val === '4x8_rpg') {
            config.frameWidth = config.frameHeight = 64;
            config.animations = {
                idle_down: { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_down: { row: 0, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                idle_up: { row: 1, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_up: { row: 1, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                idle_right: { row: 2, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_right: { row: 2, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                idle_left: { row: 3, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_left: { row: 3, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                attack_down: { row: 0, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                attack_up: { row: 1, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                attack_right: { row: 2, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                attack_left: { row: 3, startFrame: 0, frames: 8, speedFps: 12, loop: false },
            };
        } else if (val === 'wizard_176x192') {
            config.frameWidth = 176;
            config.frameHeight = 192;
            config.animations = {
                idle_down: { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_down: { row: 0, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                idle_up: { row: 1, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_up: { row: 1, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                idle_right: { row: 2, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_right: { row: 2, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                idle_left: { row: 3, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_left: { row: 3, startFrame: 0, frames: 8, speedFps: 8, loop: true },
                attack_down: { row: 0, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                attack_up: { row: 1, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                attack_right: { row: 2, startFrame: 0, frames: 8, speedFps: 12, loop: false },
                attack_left: { row: 3, startFrame: 0, frames: 8, speedFps: 12, loop: false },
            };
        } else if (val === '4x4_standard') {
            config.frameWidth = 32;
            config.frameHeight = 32;
            config.animations = {
                idle_down: { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_down: { row: 0, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                idle_left: { row: 1, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_left: { row: 1, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                idle_right: { row: 2, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_right: { row: 2, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                idle_up: { row: 3, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_up: { row: 3, startFrame: 0, frames: 4, speedFps: 6, loop: true },
                attack_down: { row: 0, startFrame: 0, frames: 4, speedFps: 10, loop: false },
                attack_left: { row: 1, startFrame: 0, frames: 4, speedFps: 10, loop: false },
                attack_right: { row: 2, startFrame: 0, frames: 4, speedFps: 10, loop: false },
                attack_up: { row: 3, startFrame: 0, frames: 4, speedFps: 10, loop: false },
            };
        } else if (val === 'static_32') {
            config.frameWidth = config.frameHeight = 32;
            const one = { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true };
            const oneOff = { ...one, loop: false };
            config.animations = {
                idle_down: one, walk_down: one, idle_up: one, walk_up: one,
                idle_right: one, walk_right: one, idle_left: one, walk_left: one,
                attack_down: oneOff, attack_up: oneOff, attack_right: oneOff, attack_left: oneOff,
            };
        }
        syncControllerToUI();
        saveConfigToLocalStorage();
    });

    [frameWidthEl, frameHeightEl, animRowEl, animStartFrameEl, animFramesEl, animSpeedEl,
        offsetXEl, offsetYEl, gapXEl, gapYEl, anchorXEl, anchorYEl].forEach((el) => {
        el?.addEventListener('input', () => { if (templateSelectEl) templateSelectEl.value = 'custom'; syncUIToController(); });
    });
    animStateEl?.addEventListener('focus', () => {
        if (!animDraft) refreshAnimDraft();
        else animDraft.setActive(animStateEl.value, animDirEl.value);
    });
    animDirEl?.addEventListener('focus', () => {
        if (!animDraft) refreshAnimDraft();
        else animDraft.setActive(animStateEl.value, animDirEl.value);
    });
    animStateEl?.addEventListener('change', () => {
        if (!animDraft) refreshAnimDraft();
        const vals = animDraft!.switchSelection(
            animStateEl.value,
            animDirEl.value,
            parsePanelAnimInputs()
        );
        applyPanelAnimInputs(vals);
        getController().setState(animStateEl.value as CharacterState);
    });
    animDirEl?.addEventListener('change', () => {
        if (!animDraft) refreshAnimDraft();
        const vals = animDraft!.switchSelection(
            animStateEl.value,
            animDirEl.value,
            parsePanelAnimInputs()
        );
        applyPanelAnimInputs(vals);
        getController().setDirection(animDirEl.value as Direction);
    });
    chromaKeyToggleEl?.addEventListener('change', () => {
        getController().setChromaKey(chromaKeyToggleEl.checked, parseInt(chromaKeyToleranceEl?.value ?? '50', 10));
        syncUIToController(); syncControllerToUI();
    });
    chromaKeyToleranceEl?.addEventListener('input', () => {
        const t = parseInt(chromaKeyToleranceEl.value, 10) || 50;
        if (chromaKeyToleranceValSpan) chromaKeyToleranceValSpan.innerText = String(t);
        getController().setChromaKey(!!chromaKeyToggleEl?.checked, t);
        syncUIToController();
    });
    charNameInputEl?.addEventListener('input', syncUIToController);
    charCategoryInputEl?.addEventListener('input', syncUIToController);
    visualSizeEl?.addEventListener('change', () => {
        updateVisualSizeHint();
    });
    frameWidthEl?.addEventListener('input', () => updateVisualSizeHint());
    frameHeightEl?.addEventListener('input', () => updateVisualSizeHint());
    sheetLayoutEl?.addEventListener('change', () => { syncUIToController(); getController().setState(getController().currentState); });

    charServerSelectEl?.addEventListener('change', () => {
        if (charServerSelectEl.value === NEW_DRAFT_OPTION) {
            resetToNewDraft({ silent: true });
            charServerSelectEl.value = '';
            updateDeleteButtonVisibility();
            return;
        }
        updateDeleteButtonVisibility();
        const charData = serverCharactersList.find((c) => c.relativePath === charServerSelectEl.value);
        if (!charData?.config) return;
        const ctrl = getController();
        ctrl.config = charData.config as unknown as typeof ctrl.config;
        ctrl.currentState = 'idle';
        ctrl.currentDirection = (charData.config.defaultDirection as Direction) || 'down';
        if (getProfile().creatureType) {
            const preset = getCreaturePreset(charData.name);
            if (spawnDescriptionEl) spawnDescriptionEl.value = preset?.description ?? '';
            if (spawnColorEl && preset?.color) spawnColorEl.value = preset.color;
            if (visualSizeEl && preset?.visualSize) visualSizeEl.value = preset.visualSize;
        }
        ctrl.loadImage();
        const wait = () => {
            if (ctrl.isLoaded) { if (templateSelectEl) templateSelectEl.value = 'custom'; syncControllerToUI(); saveConfigToLocalStorage(); toast.success(`"${charData.name}" carregado!`); }
            else setTimeout(wait, 50);
        };
        wait();
    });

    let previewFrameIndex = 0;
    let previewLastTime = 0;
    function drawPreviewLoop(nowMs: number): void {
        requestAnimationFrame(drawPreviewLoop);
        if (!previewCtx) return;
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const ctrl = getController();
        if (!ctrl.isLoaded || !ctrl.image) {
            previewCtx.fillStyle = '#3f4452';
            previewCtx.font = '10px sans-serif';
            previewCtx.textAlign = 'center';
            previewCtx.textBaseline = 'middle';
            previewCtx.fillText('Sem Sprite', previewCanvas.width / 2, previewCanvas.height / 2);
            return;
        }
        const config = ctrl.config;
        const anim = config.animations[`${animStateEl.value}_${animDirEl.value}`];
        if (!anim) return;
        const frameDurationMs = 1000 / anim.speedFps;
        if (previewLastTime === 0) previewLastTime = nowMs;
        if (nowMs - previewLastTime >= frameDurationMs) {
            previewFrameIndex = (previewFrameIndex + 1) % anim.frames;
            previewLastTime = nowMs;
        }
        const imageW = ctrl.image.naturalWidth || ctrl.image.width;
        const imageH = ctrl.image.naturalHeight || ctrl.image.height;
        const { sx, sy } = resolveAnimationSourceRect(config, anim, previewFrameIndex, imageW, imageH);

        // 1. Desenha a célula de referência 32x32 centralizada
        const baseTileSize = 32;
        const scale = Math.floor(Math.min(previewCanvas.width / baseTileSize, previewCanvas.height / baseTileSize) * 0.7) || 1;
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

        // 2. Calcula posição do personagem com âncoras aplicadas
        // Posição de repouso padrão: Centralizado no X, Alinhado ao bottom no Y
        const profile = getProfile();
        const mapDrawScale =
            profile.creatureType && visualSizeEl
                ? computeCreatureDrawScale(
                      config.frameWidth,
                      config.frameHeight,
                      (visualSizeEl.value || 'medium') as CreatureVisualSize
                  )
                : 1;
        const displayFw = config.frameWidth * mapDrawScale;
        const displayFh = config.frameHeight * mapDrawScale;

        const charBaseX = tileX + ((baseTileSize - displayFw) / 2) * scale;
        const charBaseY = tileY + (baseTileSize - displayFh) * scale;

        const anchorX = (config.anchorX ?? 0) * mapDrawScale;
        const anchorY = (config.anchorY ?? 0) * mapDrawScale;

        const drawX = charBaseX + anchorX * scale;
        const drawY = charBaseY + anchorY * scale;
        const drawW = displayFw * scale;
        const drawH = displayFh * scale;

        // Desenha o sprite com pixel-art perfeita
        previewCtx.imageSmoothingEnabled = false;
        previewCtx.drawImage(
            ctrl.image,
            sx, sy, config.frameWidth, config.frameHeight,
            drawX, drawY, drawW, drawH
        );

        // 3. Desenha a cruz vermelha indicando o ponto de âncora/piso (Bottom-Center do tile)
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

    exportBtn?.addEventListener('click', () => {
        const ctrl = getController();
        const a = document.createElement('a');
        a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(serializeCharacterConfig(ctrl.config));
        a.download = `${ctrl.config.name.toLowerCase().replace(/ /g, '_')}.json`;
        document.body.appendChild(a); a.click(); a.remove();
    });
    charNewBtn?.addEventListener('click', () => resetToNewDraft());
    charRefreshListBtn?.addEventListener('click', async () => {
        await reloadServerCharactersList();
        toast.success('Lista atualizada.');
    });
    saveServerBtn?.addEventListener('click', () => void saveActiveCharacterToServer(true));
    deleteServerBtn?.addEventListener('click', async () => {
        const relativePath = charServerSelectEl?.value;
        const entity = profileEntityLabel(getProfile());
        if (!relativePath || relativePath === NEW_DRAFT_OPTION) {
            toast.error(`Selecione um ${entity.toLowerCase()} existente para excluir.`);
            return;
        }

        const charData = serverCharactersList.find((c) => c.relativePath === relativePath);
        const displayName = charData ? charData.name : relativePath;

        const confirmed = await popup.confirm(
            `Excluir o ${entity.toLowerCase()} "<strong>${displayName}</strong>" permanentemente?<br><br>Remove o JSON, a PNG no servidor` +
                (getProfile().creatureType ? ' e a entrada em creature_presets.json' : '') +
                '.',
            `🗑️ Excluir ${entity}`
        );
        if (!confirmed) return;

        try {
            const originalText = deleteServerBtn.innerText;
            deleteServerBtn.innerText = '⌛ Excluindo...';
            (deleteServerBtn as HTMLButtonElement).disabled = true;

            const deleteUrl = `/api/delete-character?relativePath=${encodeURIComponent(relativePath)}&force=false`;
            const deleteRes = await apiFetch(deleteUrl, { method: 'DELETE' });

            if (deleteRes.status === 409) {
                const conflict = await deleteRes.json();
                const mapLines = (conflict.maps ?? [])
                    .map((m: any) => `  • ${m.mapFile} — ${m.spawnCount} spawn${m.spawnCount === 1 ? '' : 's'}`)
                    .join('\n');
                
                (deleteServerBtn as HTMLButtonElement).disabled = false;
                deleteServerBtn.innerText = originalText;

                await popup.alert(
                    `Não é possível excluir "${displayName}".<br><br>Em uso em ${conflict.maps.length} mapa${conflict.maps.length === 1 ? '' : 's'} (${conflict.totalSpawns} spawn${conflict.totalSpawns === 1 ? '' : 's'} no total):<br><br>${mapLines.replace(/\n/g, '<br>')}<br><br>Remova os spawns do mapa antes de excluir.`,
                    `⚠️ ${entity} em Uso`
                );
                return;
            }

            if (!deleteRes.ok) {
                const err = await deleteRes.json().catch(() => ({}));
                throw new Error(err.error || 'Erro desconhecido ao excluir.');
            }

            toast.success(`${entity} "${displayName}" excluído!`);
            await finalizeDeletion();

        } catch (err: any) {
            toast.error(`Falha ao excluir: ${err.message}`);
        } finally {
            if (deleteServerBtn) {
                (deleteServerBtn as HTMLButtonElement).disabled = false;
                updateDeleteButtonVisibility();
            }
        }
    });

    async function finalizeDeletion() {
        resetToNewDraft({ silent: true });
        await reloadServerCharactersList();
        await onCatalogChanged?.();
    }
    importBtn?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const config = parseCharacterConfig(reader.result as string);
                const ctrl = getController();
                ctrl.config = config;
                ctrl.currentState = 'idle';
                ctrl.currentDirection = config.defaultDirection;
                ctrl.loadImage();
                const wait = () => { if (ctrl.isLoaded) { if (templateSelectEl) templateSelectEl.value = 'custom'; syncControllerToUI(); saveConfigToLocalStorage(); } else setTimeout(wait, 50); };
                wait();
            } catch { toast.error('JSON inválido.'); }
            importInput.value = '';
        };
        reader.readAsText(file);
    });
    loadSpriteBtn?.addEventListener('click', () => importSpriteInput?.click());
    importSpriteInput?.addEventListener('change', () => {
        const file = importSpriteInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const ctrl = getController();
            ctrl.config.spriteSheetUrl = reader.result as string;
            ctrl.loadImage();
            const wait = () => { if (ctrl.isLoaded) { syncControllerToUI(); saveConfigToLocalStorage(); } else setTimeout(wait, 50); };
            wait();
        };
        reader.readAsDataURL(file);
    });
    async function applySpriteUpscale(scale: 2 | 3): Promise<void> {
        const ctrl = getController();
        if (!ctrl.isLoaded || !ctrl.image) {
            toast.error('Nenhuma imagem carregada.');
            return;
        }
        const config = ctrl.config;
        const beforeW = config.frameWidth;
        try {
            const upscaled = await upscalePixelArtDataUrl(ctrl.image.src, scale);
            config.spriteSheetUrl = upscaled;
            config.frameWidth *= scale;
            config.frameHeight *= scale;
            for (const key of ['offsetX', 'offsetY', 'gapX', 'gapY', 'anchorX', 'anchorY'] as const) {
                if (typeof config[key] === 'number') {
                    config[key] = (config[key] as number) * scale;
                }
            }
            ctrl.loadImage();
            await new Promise<void>((resolve) => {
                const wait = () => {
                    if (ctrl.isLoaded) {
                        syncControllerToUI();
                        saveConfigToLocalStorage();
                        void saveActiveCharacterToServer(true).then(() => resolve());
                    } else {
                        setTimeout(wait, 50);
                    }
                };
                wait();
            });
            toast.success(`Upscale ${scale}x aplicado (${beforeW}px → ${config.frameWidth}px).`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Falha no upscale.');
        }
    }

    upscaleSprite2xBtn?.addEventListener('click', () => void applySpriteUpscale(2));
    upscaleSprite3xBtn?.addEventListener('click', () => void applySpriteUpscale(3));
    document.getElementById('openCalibratorBtn')?.addEventListener('click', () => {
        const ctrl = getController();
        if (!ctrl.isLoaded || !ctrl.image) return toast.info('Carregue um PNG primeiro.');
        const config = ctrl.config;
        openCharacterCalibrator(ctrl.image, config, ctrl.currentState, ctrl.currentDirection, async (result) => {
            Object.assign(config, {
                frameWidth: result.frameWidth, frameHeight: result.frameHeight,
                offsetX: result.offsetX, offsetY: result.offsetY, gapX: result.gapX, gapY: result.gapY,
                anchorX: result.anchorX, anchorY: result.anchorY, animations: result.animations,
                sheetLayout: result.sheetLayout,
            });
            if (templateSelectEl) templateSelectEl.value = 'custom';
            ctrl.setState(result.currentState as CharacterState);
            ctrl.setDirection(result.currentDirection as Direction);
            if (animStateEl) animStateEl.value = result.currentState;
            if (animDirEl) animDirEl.value = result.currentDirection;
            syncControllerToUI(); syncUIToController();
            await saveActiveCharacterToServer(true);
        });
    });
    charCategoryTreeEl?.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest('[data-folder-path]') as HTMLElement | null;
        if (el?.dataset.folderPath && charCategoryInputEl) {
            charCategoryInputEl.value = el.dataset.folderPath;
            syncUIToController();
        }
    });

    function populateVocationDropdown(source?: VocationsMap): void {
        const playerVocationEl = document.getElementById('charPlayerVocation') as HTMLSelectElement | null;
        if (!playerVocationEl) return;
        fillVocationSelect(playerVocationEl, source ?? (getRuntimeVocations() as VocationsMap));
    }

    window.addEventListener(VOCATIONS_UPDATED_EVENT, (event) => {
        const detail = (event as CustomEvent<{ vocations: VocationsMap }>).detail;
        if (detail?.vocations) {
            populateVocationDropdown(detail.vocations);
        }
    });

    void loadRuntimeVocations().then(() => populateVocationDropdown());
    applyProfileUi();
    return emptyHandle;
}
