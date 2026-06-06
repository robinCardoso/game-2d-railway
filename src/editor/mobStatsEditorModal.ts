import { getItemCatalog, loadItemCatalog } from '../game-data/itemCatalog';
import { formatItemCatalogLabel, ITEM_CATALOG_UPDATED } from '../game-data/itemCatalogUi';
import {
    findUnknownLootItemIds,
    findUnimplementedLootItemIds,
} from '../game-data/itemCatalogTypes';
import { openItemEditorModal } from './itemEditorModal';
import { dispatchCreaturePresetsUpdated } from '../game-data/creaturePresetUi';
import {
    getMobStatsFormDefaults,
    MOB_RACES,
    resolveMobChaseConfig,
    type CreaturePresetEntry,
    type MobChaseBehavior,
    type MobLootEntry,
    type MobRace,
    type ResolvedMobCombatStats,
} from '../game-data/mobPresetTypes';
import { loadCreaturePresets } from './creaturePresets';
import { apiFetch } from '../shared/apiFetch';
import { toast, popup } from '../utils/popup';

let presets: CreaturePresetEntry[] = [];
let activePresetName: string | null = null;

const inputStyle =
    'width: 100%; background: #15181e; color: #fff; border: 1px solid #2d3139; border-radius: 4px; padding: 6px; font-size: 11px; outline: none; box-sizing: border-box;';
const labelStyle =
    'font-size: 9px; color: var(--text-dim); text-transform: uppercase; display: block; margin-bottom: 3px;';

export function initMobStatsEditor(): void {
    const modal = document.getElementById('mobStatsEditorModal') as HTMLDivElement | null;
    const openBtn = document.getElementById('openMobStatsEditorBtn');
    const closeBtn = document.getElementById('mobCloseBtn');
    const cancelBtn = document.getElementById('mobCancelBtn');
    const confirmBtn = document.getElementById('mobConfirmBtn') as HTMLButtonElement | null;
    const addLootBtn = document.getElementById('mobAddLootBtn');
    const mobForm = document.getElementById('mobStatsForm');

    if (!modal || !confirmBtn) return;

    const showModal = () => {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('is-open'));
    };

    const closeModal = () => {
        modal.classList.remove('is-open');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 250);
    };

    const openModal = async () => {
        closeAllDropdownsSafe();
        showModal();
        try {
            await loadItemCatalog();
            const res = await apiFetch('/api/get-creature-presets');
            if (!res.ok) throw new Error('Erro ao carregar presets de criaturas.');
            const data = (await res.json()) as { presets?: CreaturePresetEntry[] };
            presets = data.presets ?? [];
            const firstMonster = presets.find((p) => p.type === 'monster') ?? presets[0];
            selectPreset(firstMonster?.name ?? null);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Falha ao abrir editor de Mobs Stats.');
        }
    };

    openBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void openModal();
    });
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    addLootBtn?.addEventListener('click', () => {
        if (getItemCatalog().items.length === 0) {
            toast.info('Cadastre itens em Criar → Itens (Catálogo) antes de ligar loot.');
            void openItemEditorModal();
            return;
        }
        addLootRow('', 10);
    });

    document.getElementById('mobOpenItemCatalogBtn')?.addEventListener('click', () => {
        void openItemEditorModal();
    });

    window.addEventListener(ITEM_CATALOG_UPDATED, () => {
        if (!activePresetName) return;
        const preset = presets.find((p) => p.name === activePresetName);
        if (!preset) return;
        renderLootTable(readLootFromForm().length ? readLootFromForm() : preset.loot ?? []);
        updateLootValidationUi(readDraftFromForm(preset));
    });

    mobForm?.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('input', () => {
            if (!activePresetName) return;
            const preset = presets.find((p) => p.name === activePresetName);
            if (!preset) return;
            const draft = readDraftFromForm(preset);
            updatePreview(getMobStatsFormDefaults(draft), resolveMobChaseConfig(draft));
        });
        el.addEventListener('change', () => {
            if (!activePresetName) return;
            const preset = presets.find((p) => p.name === activePresetName);
            if (!preset) return;
            syncAttackRangeFieldState();
            const draft = readDraftFromForm(preset);
            updatePreview(getMobStatsFormDefaults(draft), resolveMobChaseConfig(draft));
        });
    });

    document.getElementById('mobChaseBehaviorSelect')?.addEventListener('change', () => {
        syncAttackRangeFieldState();
    });

    confirmBtn.onclick = async () => {
        if (!activePresetName) {
            toast.error('Selecione um mob na lista.');
            return;
        }
        const idx = presets.findIndex((p) => p.name === activePresetName);
        if (idx < 0) return;

        const draft = readDraftFromForm(presets[idx]);
        const unknown = findUnknownLootItemIds(draft.loot, getItemCatalog());
        if (unknown.length > 0) {
            toast.error(
                `Loot inválido: item(ns) não cadastrado(s): ${unknown.join(', ')}. Crie em Itens (Catálogo).`
            );
            updateLootValidationUi(draft);
            return;
        }
        presets[idx] = draft;
        await saveToServer(draft.name);
    };
}

function closeAllDropdownsSafe(): void {
    document.querySelectorAll('#mainMenubar .menu-item.is-open').forEach((item) => {
        item.classList.remove('is-open');
    });
}

function readNum(id: string, fallback: number, allowZero = false): number {
    const raw = (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (allowZero) return Math.max(0, parsed);
    return Math.max(1, parsed);
}

function readDraftFromForm(base: CreaturePresetEntry): CreaturePresetEntry {
    const raceEl = document.getElementById('mobRaceSelect') as HTMLSelectElement | null;
    const race = (raceEl?.value as MobRace) || base.race || 'beast';
    const chaseEl = document.getElementById('mobChaseBehaviorSelect') as HTMLSelectElement | null;
    const chaseBehavior = (chaseEl?.value as MobChaseBehavior) || base.chaseBehavior || 'melee';
    const defaults = getMobStatsFormDefaults(base);
    const chaseDefaults = resolveMobChaseConfig(base);

    const draft: CreaturePresetEntry = {
        ...base,
        maxHealth: readNum('mobHealthInput', defaults.maxHealth),
        defense: readNum('mobDefenseInput', defaults.defense, true),
        attack: readNum('mobAttackInput', defaults.attack),
        attackSpeed: readNum('mobAttackSpeedInput', defaults.attackSpeed),
        xpReward: readNum('mobXpInput', defaults.xpReward),
        race,
        chaseBehavior,
        attackRange:
            chaseBehavior === 'melee'
                ? 1
                : readNum('mobAttackRangeInput', chaseDefaults.attackRange),
        loot: readLootFromForm(),
    };

    if (!draft.loot || draft.loot.length === 0) {
        delete draft.loot;
    }

    return draft;
}

function syncAttackRangeFieldState(): void {
    const chaseEl = document.getElementById('mobChaseBehaviorSelect') as HTMLSelectElement | null;
    const rangeEl = document.getElementById('mobAttackRangeInput') as HTMLInputElement | null;
    if (!chaseEl || !rangeEl) return;
    const isMelee = chaseEl.value === 'melee';
    rangeEl.disabled = isMelee;
    rangeEl.value = isMelee ? '1' : rangeEl.value || '3';
}

function readLootFromForm(): MobLootEntry[] {
    const rows = document.querySelectorAll<HTMLElement>('[data-mob-loot-row]');
    const loot: MobLootEntry[] = [];
    rows.forEach((row) => {
        const itemEl = row.querySelector('[data-loot-item]') as HTMLSelectElement | null;
        const chanceEl = row.querySelector('[data-loot-chance]') as HTMLInputElement | null;
        const itemId = itemEl?.value?.trim() ?? '';
        const chance = parseFloat(chanceEl?.value ?? '');
        if (!itemId || !Number.isFinite(chance) || chance < 0 || chance > 100) return;
        loot.push({ itemId, chance: Math.round(chance * 100) / 100 });
    });
    return loot;
}

async function saveToServer(selectNameAfter: string): Promise<void> {
    try {
        const res = await apiFetch('/api/save-creature-presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ presets }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Erro ao salvar presets.');
        }

        const result = (await res.json()) as { presets?: CreaturePresetEntry[] };
        if (result.presets) {
            presets = result.presets;
        }

        dispatchCreaturePresetsUpdated(presets);
        await loadCreaturePresets();

        toast.success('Stats de mobs salvos em creature_presets.json!');
        renderPresetList();
        const next =
            selectNameAfter && presets.some((p) => p.name === selectNameAfter)
                ? selectNameAfter
                : presets.find((p) => p.type === 'monster')?.name ?? presets[0]?.name ?? null;
        selectPreset(next);
    } catch (err: unknown) {
        popup.alert(
            `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`,
            'Erro ao Salvar'
        );
    }
}

function renderPresetList(): void {
    const container = document.getElementById('mobListContainer');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...presets].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'monster' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    for (const preset of sorted) {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.background =
            preset.name === activePresetName ? 'var(--accent-color)' : '#1a1d24';
        item.style.color = '#fff';
        item.style.borderRadius = '4px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '11px';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.gap = '8px';

        const label = document.createElement('span');
        label.textContent = preset.name;
        item.appendChild(label);

        const badge = document.createElement('span');
        badge.style.fontSize = '9px';
        badge.style.opacity = '0.7';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '999px';
        badge.style.background =
            preset.type === 'monster' ? 'rgba(251, 113, 133, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        badge.textContent = preset.type === 'monster' ? 'MOB' : 'NPC';
        item.appendChild(badge);

        item.onclick = () => selectPreset(preset.name);
        container.appendChild(item);
    }
}

function selectPreset(name: string | null): void {
    activePresetName = name;
    renderPresetList();

    const metaEl = document.getElementById('mobMetaInfo');
    const statsFieldset = document.getElementById('mobStatsFieldset');
    const chaseFieldset = document.getElementById('mobChaseFieldset');
    const npcNotice = document.getElementById('mobNpcNotice');

    if (!name) {
        if (metaEl) metaEl.textContent = 'Nenhum preset carregado.';
        return;
    }

    const preset = presets.find((p) => p.name === name);
    if (!preset) return;

    const defaults = getMobStatsFormDefaults(preset);
    const isMonster = preset.type === 'monster';

    if (metaEl) {
        metaEl.innerHTML = `
            <strong>${preset.name}</strong>
            <span style="opacity:0.65;"> · ${preset.type.toUpperCase()}</span>
            <br><span style="font-size:10px;opacity:0.55;">${preset.configPath}</span>
        `;
    }

    if (npcNotice) {
        npcNotice.style.display = isMonster ? 'none' : 'block';
    }
    if (statsFieldset) {
        statsFieldset.querySelectorAll('input, select').forEach((el) => {
            (el as HTMLInputElement).disabled = !isMonster;
        });
    }
    if (chaseFieldset) {
        chaseFieldset.querySelectorAll('input, select').forEach((el) => {
            (el as HTMLInputElement).disabled = !isMonster;
        });
    }
    const lootSection = document.getElementById('mobLootSection');
    if (lootSection) {
        lootSection.querySelectorAll('input, select, button').forEach((el) => {
            (el as HTMLButtonElement).disabled = !isMonster;
        });
    }

    (document.getElementById('mobHealthInput') as HTMLInputElement).value = String(defaults.maxHealth);
    (document.getElementById('mobDefenseInput') as HTMLInputElement).value = String(defaults.defense);
    (document.getElementById('mobAttackInput') as HTMLInputElement).value = String(defaults.attack);
    (document.getElementById('mobAttackSpeedInput') as HTMLInputElement).value = String(
        defaults.attackSpeed
    );
    (document.getElementById('mobXpInput') as HTMLInputElement).value = String(defaults.xpReward);

    const raceSelect = document.getElementById('mobRaceSelect') as HTMLSelectElement | null;
    if (raceSelect) {
        raceSelect.innerHTML = MOB_RACES.map(
            (race) =>
                `<option value="${race}"${race === defaults.race ? ' selected' : ''}>${race}</option>`
        ).join('');
        raceSelect.disabled = !isMonster;
    }

    const chaseDefaults = resolveMobChaseConfig(preset);
    const chaseSelect = document.getElementById('mobChaseBehaviorSelect') as HTMLSelectElement | null;
    if (chaseSelect) {
        chaseSelect.value = chaseDefaults.chaseBehavior;
        chaseSelect.disabled = !isMonster;
    }
    const rangeInput = document.getElementById('mobAttackRangeInput') as HTMLInputElement | null;
    if (rangeInput) {
        rangeInput.value = String(chaseDefaults.attackRange);
        rangeInput.disabled = !isMonster || chaseDefaults.chaseBehavior === 'melee';
    }

    renderLootTable(preset.loot ?? []);
    updateLootValidationUi(preset);
    updatePreview(defaults, chaseDefaults);
}

function updateLootValidationUi(preset: CreaturePresetEntry): void {
    const statusEl = document.getElementById('mobLootValidation');
    const catalog = getItemCatalog();
    if (!statusEl) return;

    if (catalog.items.length === 0) {
        statusEl.innerHTML =
            '<span style="color:#fbbf24;">⚠ Nenhum item no catálogo.</span> Use <strong>Criar → Itens (Catálogo)</strong> antes de ligar loot a este mob.';
        return;
    }

    const unknown = findUnknownLootItemIds(preset.loot, catalog);
    const unimplemented = findUnimplementedLootItemIds(preset.loot, catalog);

    if (unknown.length > 0) {
        statusEl.innerHTML = `<span style="color:#ef4444;">✕ Item(ns) inexistente(s): <code>${unknown.join('</code>, <code>')}</code>. Cadastre ou remova do loot.</span>`;
        return;
    }
    if (unimplemented.length > 0) {
        statusEl.innerHTML = `<span style="color:#fbbf24;">⚠ Ligado ao catálogo, mas ainda não implementado(s) no jogo: <code>${unimplemented.join('</code>, <code>')}</code>. Drop no Play permanece desativado.</span>`;
        return;
    }
    if (preset.loot?.length) {
        statusEl.innerHTML =
            '<span style="color:#6ee7b7;">✓ Loot válido — todos os itens existem no catálogo.</span>';
        return;
    }
    statusEl.textContent = 'Nenhum item de loot configurado para este mob.';
}

function renderLootTable(loot: MobLootEntry[]): void {
    const container = document.getElementById('mobLootRows');
    if (!container) return;
    container.innerHTML = '';
    if (loot.length === 0) {
        addLootRow('', 10);
        return;
    }
    for (const entry of loot) {
        addLootRow(entry.itemId, entry.chance);
    }
}

function addLootRow(itemId: string, chance: number): void {
    const container = document.getElementById('mobLootRows');
    if (!container) return;

    const catalog = getItemCatalog();
    const isUnknown = Boolean(itemId && !catalog.items.some((i) => i.id === itemId));

    const row = document.createElement('div');
    row.setAttribute('data-mob-loot-row', '1');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 80px 32px';
    row.style.gap = '6px';
    row.style.alignItems = 'end';
    if (isUnknown) {
        row.style.outline = '1px solid #ef4444';
        row.style.borderRadius = '4px';
        row.style.padding = '4px';
    }

    const itemWrap = document.createElement('div');
    const itemLabel = document.createElement('label');
    itemLabel.style.cssText = labelStyle;
    itemLabel.textContent = isUnknown ? 'Item (inexistente!)' : 'Item';
    if (isUnknown) itemLabel.style.color = '#ef4444';

    const itemSelect = document.createElement('select');
    itemSelect.setAttribute('data-loot-item', '1');
    itemSelect.style.cssText = inputStyle;

    let options = `<option value="">— selecionar —</option>`;
    for (const entry of catalog.items) {
        options += `<option value="${entry.id}"${entry.id === itemId ? ' selected' : ''}>${formatItemCatalogLabel(entry)}</option>`;
    }
    if (isUnknown) {
        options += `<option value="${itemId}" selected>⚠ ${itemId} (não cadastrado)</option>`;
    }
    itemSelect.innerHTML = options;
    itemSelect.addEventListener('change', () => {
        if (!activePresetName) return;
        const preset = presets.find((p) => p.name === activePresetName);
        if (!preset) return;
        updateLootValidationUi(readDraftFromForm(preset));
    });

    itemWrap.appendChild(itemLabel);
    itemWrap.appendChild(itemSelect);

    const chanceWrap = document.createElement('div');
    const chanceLabel = document.createElement('label');
    chanceLabel.style.cssText = labelStyle;
    chanceLabel.textContent = 'Chance %';
    const chanceInput = document.createElement('input');
    chanceInput.type = 'number';
    chanceInput.min = '0';
    chanceInput.max = '100';
    chanceInput.step = '0.1';
    chanceInput.value = String(chance);
    chanceInput.setAttribute('data-loot-chance', '1');
    chanceInput.style.cssText = inputStyle;
    chanceWrap.appendChild(chanceLabel);
    chanceWrap.appendChild(chanceInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remover linha';
    removeBtn.style.cssText =
        'height: 32px; border: 1px solid #3f4452; background: transparent; color: #ef4444; border-radius: 4px; cursor: pointer;';
    removeBtn.onclick = () => {
        row.remove();
        if (container.querySelectorAll('[data-mob-loot-row]').length === 0) {
            addLootRow('', 10);
        }
    };

    row.appendChild(itemWrap);
    row.appendChild(chanceWrap);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function updatePreview(
    stats: ResolvedMobCombatStats,
    chase = resolveMobChaseConfig(undefined)
): void {
    const set = (id: string, value: string | number) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };
    set('mobPreviewHp', stats.maxHealth);
    set('mobPreviewDef', stats.defense);
    set('mobPreviewAtk', stats.attack);
    set('mobPreviewAtkSpd', `${stats.attackSpeed} ms`);
    set('mobPreviewXp', stats.xpReward);
    set('mobPreviewRace', stats.race);
    set('mobPreviewChase', chase.chaseBehavior === 'melee' ? 'Corpo a corpo' : 'À distância');
    set('mobPreviewRange', chase.attackRange);
}
