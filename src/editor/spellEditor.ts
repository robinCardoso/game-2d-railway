import './spellEditor.css';
import { applySpellCatalogDocument, loadSpellCatalog } from '../game-data/spellCatalog';
import type { SpellDefinition, SpellGroup } from '../game-data/spellCatalogTypes';
import type { SpellDamageType } from '../game-data/spellCatalogTypes';
import { resolveSpellIconPath, spellIconPngPath } from '../game-data/spellCatalogTypes';
import { apiFetch } from '../shared/apiFetch';
import { toast } from '../utils/popup';

const VOCATION_FILTER_KEY = 'studio.spellEditor.vocationFilter';

const VOCATIONS = [
    { id: 'knight', label: 'Knight', damageType: 'melee' as SpellDamageType, range: 1 },
    { id: 'mage', label: 'Mage', damageType: 'magic' as SpellDamageType, range: 7 },
    { id: 'archer', label: 'Archer', damageType: 'distance' as SpellDamageType, range: 7 },
    { id: 'paladin', label: 'Paladin', damageType: 'magic' as SpellDamageType, range: 7 },
    { id: 'sorcerer', label: 'Sorcerer', damageType: 'magic' as SpellDamageType, range: 7 },
];

let spells: SpellDefinition[] = [];
let activeSpellId: string | null = null;
let filterVocation = readStoredFilter();

function getFormEl<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function readStoredFilter(): string {
    try {
        return localStorage.getItem(VOCATION_FILTER_KEY) || 'all';
    } catch {
        return 'all';
    }
}

function storeFilter(value: string): void {
    filterVocation = value;
    try {
        localStorage.setItem(VOCATION_FILTER_KEY, value);
    } catch {
        /* ignore */
    }
}

function vocationLabel(id: string): string {
    return VOCATIONS.find((v) => v.id === id)?.label ?? id;
}

function spellMatchesFilter(spell: SpellDefinition): boolean {
    if (filterVocation === 'all') return true;
    if (spell.vocations.length === 0) return true;
    return spell.vocations.includes(filterVocation);
}

function getSelectedVocationChips(): string[] {
    const grid = getFormEl<HTMLDivElement>('spellVocationChips');
    if (!grid) return [];
    return [...grid.querySelectorAll<HTMLButtonElement>('.spell-editor__chip.is-on')]
        .map((btn) => btn.dataset.vocationId ?? '')
        .filter(Boolean);
}

function syncVocationChips(vocations: string[]): void {
    const grid = getFormEl<HTMLDivElement>('spellVocationChips');
    if (!grid) return;
    const set = new Set(vocations.map((v) => v.toLowerCase()));
    grid.querySelectorAll<HTMLButtonElement>('.spell-editor__chip').forEach((btn) => {
        const id = btn.dataset.vocationId ?? '';
        btn.classList.toggle('is-on', set.has(id));
    });
}

function renderVocationChips(): void {
    const grid = getFormEl<HTMLDivElement>('spellVocationChips');
    if (!grid) return;
    grid.innerHTML = VOCATIONS.map(
        (v) =>
            `<button type="button" class="spell-editor__chip" data-vocation-id="${v.id}">${v.label}</button>`
    ).join('');
    grid.querySelectorAll<HTMLButtonElement>('.spell-editor__chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('is-on');
            updateSharedHint();
        });
    });
}

function updateSharedHint(): void {
    const hint = getFormEl<HTMLParagraphElement>('spellSharedHint');
    if (!hint) return;
    const selected = getSelectedVocationChips();
    if (selected.length === 0) {
        hint.textContent = 'Nenhuma vocação marcada — a magia fica disponível para todos os personagens.';
    } else if (selected.length === 1) {
        hint.textContent = `Magia exclusiva de ${vocationLabel(selected[0]!)}.`;
    } else {
        hint.textContent = `Magia compartilhada: mesma entrada no catálogo para ${selected.map(vocationLabel).join(', ')}.`;
    }
}

function updateNewButtonLabel(): void {
    const btn = getFormEl<HTMLButtonElement>('spellNewBtn');
    if (!btn) return;
    if (filterVocation === 'all') {
        btn.textContent = '+ Nova magia (escolha a vocação no filtro acima)';
    } else {
        btn.textContent = `+ Nova magia para ${vocationLabel(filterVocation)}`;
    }
}

function readForm(): SpellDefinition | null {
    const id = getFormEl<HTMLInputElement>('spellIdInput')?.value.trim();
    const name = getFormEl<HTMLInputElement>('spellNameInput')?.value.trim();
    if (!id || !name) return null;

    const groupRaw = getFormEl<HTMLSelectElement>('spellGroupInput')?.value ?? 'attack';
    const group: SpellGroup =
        groupRaw === 'healing' || groupRaw === 'support' ? groupRaw : 'attack';

    const damageTypeRaw = getFormEl<HTMLSelectElement>('spellDamageTypeInput')?.value ?? 'magic';
    const damageType: SpellDamageType =
        damageTypeRaw === 'melee' || damageTypeRaw === 'distance' || damageTypeRaw === 'healing'
            ? damageTypeRaw
            : 'magic';

    const vocations = getSelectedVocationChips();

    return {
        id,
        name,
        description: getFormEl<HTMLTextAreaElement>('spellDescInput')?.value ?? '',
        words: undefined,
        group,
        icon: resolveSpellIconPath(
            id,
            getFormEl<HTMLInputElement>('spellIconInput')?.value
        ),
        manaCost: Math.max(0, Number(getFormEl<HTMLInputElement>('spellManaInput')?.value) || 0),
        cooldownMs: Math.max(0, Number(getFormEl<HTMLInputElement>('spellCdInput')?.value) || 1000),
        groupCooldownMs: Math.max(
            0,
            Number(getFormEl<HTMLInputElement>('spellGroupCdInput')?.value) || 1000
        ),
        minLevel: Math.max(1, Number(getFormEl<HTMLInputElement>('spellMinLevelInput')?.value) || 1),
        vocations,
        range: Math.max(1, Math.min(15, Number(getFormEl<HTMLInputElement>('spellRangeInput')?.value) || 1)),
        requiresTarget: getFormEl<HTMLInputElement>('spellRequiresTargetInput')?.checked !== false,
        damage: {
            type: damageType,
            multiplier: Math.max(0, Number(getFormEl<HTMLInputElement>('spellDamageMultInput')?.value) || 1),
            formula: damageType === 'magic' ? 'level_magic' : undefined,
        },
        implemented: getFormEl<HTMLInputElement>('spellImplementedInput')?.checked === true,
    };
}

function fillForm(spell: SpellDefinition): void {
    const set = (id: string, value: string) => {
        const el = getFormEl<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
        if (el) el.value = value;
    };
    set('spellIdInput', spell.id);
    set('spellNameInput', spell.name);
    set('spellDescInput', spell.description);
    set('spellGroupInput', spell.group);
    set('spellIconInput', spell.icon);
    set('spellManaInput', String(spell.manaCost));
    set('spellCdInput', String(spell.cooldownMs));
    set('spellGroupCdInput', String(spell.groupCooldownMs));
    set('spellMinLevelInput', String(spell.minLevel));
    set('spellRangeInput', String(spell.range));
    set('spellDamageTypeInput', spell.damage?.type ?? 'magic');
    set('spellDamageMultInput', String(spell.damage?.multiplier ?? 1));
    syncVocationChips(spell.vocations);
    updateSharedHint();
    const targetEl = getFormEl<HTMLInputElement>('spellRequiresTargetInput');
    if (targetEl) targetEl.checked = spell.requiresTarget;
    const implEl = getFormEl<HTMLInputElement>('spellImplementedInput');
    if (implEl) implEl.checked = spell.implemented;
}

function renderVocationTags(spell: SpellDefinition): string {
    if (spell.vocations.length === 0) {
        return '<span class="spell-editor__tag">Todas</span>';
    }
    const shared = spell.vocations.length > 1;
    return spell.vocations
        .map(
            (v) =>
                `<span class="spell-editor__tag${shared ? ' spell-editor__tag--shared' : ''}">${vocationLabel(v)}</span>`
        )
        .join('');
}

function renderSpellList(): void {
    const list = getFormEl<HTMLDivElement>('spellEditorList');
    if (!list) return;

    const filtered = spells.filter(spellMatchesFilter).sort((a, b) => {
        if (a.minLevel !== b.minLevel) return a.minLevel - b.minLevel;
        return a.name.localeCompare(b.name, 'pt-BR');
    });

    if (filtered.length === 0) {
        list.innerHTML =
            filterVocation === 'all'
                ? '<p class="flyout-hint">Nenhuma magia no catálogo.</p>'
                : `<p class="flyout-hint">Nenhuma magia para ${vocationLabel(filterVocation)}. Clique em "+ Nova magia".</p>`;
        return;
    }

    list.innerHTML = filtered
        .map((spell) => {
            const shared = spell.vocations.length > 1 ? ' · compartilhada' : '';
            return `
        <button type="button" class="spell-editor__list-item${
            spell.id === activeSpellId ? ' is-active' : ''
        }" data-spell-id="${spell.id}">
          <img src="${spell.icon}" alt="" width="32" height="32" draggable="false" />
          <span>
            <strong>${spell.name}</strong>
            <small>Lv ${spell.minLevel} · ${spell.manaCost} MP · CD ${(spell.cooldownMs / 1000).toFixed(1)}s${shared}</small>
            <span class="spell-editor__vocation-tags">${renderVocationTags(spell)}</span>
          </span>
        </button>`;
        })
        .join('');

    list.querySelectorAll<HTMLButtonElement>('[data-spell-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const spell = spells.find((s) => s.id === btn.dataset.spellId);
            if (!spell) return;
            activeSpellId = spell.id;
            fillForm(spell);
            renderSpellList();
        });
    });
}

function defaultSpellForVocation(vocationId: string): SpellDefinition {
    const meta = VOCATIONS.find((v) => v.id === vocationId) ?? VOCATIONS[0]!;
    return {
        id: `${vocationId}_`,
        name: '',
        description: '',
        group: 'attack',
        icon: spellIconPngPath(`${vocationId}_nova_magia`),
        manaCost: vocationId === 'knight' ? 8 : 15,
        cooldownMs: 2000,
        groupCooldownMs: 2000,
        minLevel: 1,
        vocations: [vocationId],
        range: meta.range,
        requiresTarget: true,
        damage: { type: meta.damageType, multiplier: 1, formula: meta.damageType === 'magic' ? 'level_magic' : undefined },
        implemented: false,
    };
}

function startNewSpell(): void {
    if (filterVocation === 'all') {
        toast.info('Selecione uma vocação no filtro acima antes de criar a magia.');
        const select = getFormEl<HTMLSelectElement>('spellVocationFilter');
        select?.focus();
        return;
    }
    activeSpellId = null;
    fillForm(defaultSpellForVocation(filterVocation));
    getFormEl<HTMLInputElement>('spellNameInput')?.focus();
}

async function reloadSpells(): Promise<void> {
    const res = await apiFetch('/api/get-spell-catalog');
    if (!res.ok) throw new Error('Falha ao carregar catálogo de magias.');
    const doc = await res.json();
    spells = Array.isArray(doc.spells) ? doc.spells : [];
    applySpellCatalogDocument({ spells });
    renderSpellList();
    updateNewButtonLabel();
}

async function saveCatalog(): Promise<void> {
    const entry = readForm();
    if (!entry) {
        toast.error('ID e nome são obrigatórios.');
        return;
    }
    if (!/^[a-z0-9_]+$/.test(entry.id)) {
        toast.error('ID inválido — use apenas a-z, 0-9 e underscore.');
        return;
    }
    const idx = spells.findIndex((s) => s.id === entry.id);
    if (idx >= 0) spells[idx] = entry;
    else spells.push(entry);
    activeSpellId = entry.id;

    const res = await apiFetch('/api/save-spell-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spells }),
    });
    if (!res.ok) throw new Error('Falha ao salvar catálogo.');
    applySpellCatalogDocument({ spells });
    renderSpellList();
    toast.success('Catálogo de magias salvo.');
}

export function refreshSpellEditorPanel(): void {
    void reloadSpells().catch(() => {
        void loadSpellCatalog().then(() => renderSpellList());
    });
}

export function initSpellEditor(): void {
    renderVocationChips();

    const filterSelect = getFormEl<HTMLSelectElement>('spellVocationFilter');
    if (filterSelect) {
        filterSelect.value = filterVocation;
        filterSelect.addEventListener('change', () => {
            storeFilter(filterSelect.value);
            renderSpellList();
            updateNewButtonLabel();
        });
    }

    getFormEl<HTMLButtonElement>('spellNewBtn')?.addEventListener('click', startNewSpell);
    getFormEl<HTMLButtonElement>('spellSaveBtn')?.addEventListener('click', () => {
        void saveCatalog().catch((err) => toast.error(String(err)));
    });

    getFormEl<HTMLButtonElement>('spellAddVocationBtn')?.addEventListener('click', () => {
        if (filterVocation === 'all') {
            toast.info('Selecione uma vocação no filtro para adicionar ao compartilhamento.');
            return;
        }
        const chip = getFormEl<HTMLDivElement>('spellVocationChips')?.querySelector<HTMLButtonElement>(
            `[data-vocation-id="${filterVocation}"]`
        );
        chip?.classList.add('is-on');
        updateSharedHint();
        toast.success(`${vocationLabel(filterVocation)} adicionada à magia.`);
    });

    const uploadBtn = getFormEl<HTMLButtonElement>('spellUploadIconBtn');
    const fileInput = getFormEl<HTMLInputElement>('spellIconFileInput');
    uploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        const spellId = getFormEl<HTMLInputElement>('spellIdInput')?.value.trim();
        if (!file || !spellId) {
            toast.error('Defina o ID da magia antes do upload.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            void apiFetch('/api/save-spell-icon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spellId, spriteBase64: dataUrl }),
            })
                .then(async (res) => {
                    if (!res.ok) throw new Error('Upload falhou.');
                    const body = await res.json();
                    if (body.iconUrl) {
                        const iconEl = getFormEl<HTMLInputElement>('spellIconInput');
                        if (iconEl) iconEl.value = body.iconUrl;
                    }
                    toast.success('Ícone salvo.');
                })
                .catch((err) => toast.error(String(err)));
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    updateNewButtonLabel();
    void reloadSpells().catch(() => {
        void loadSpellCatalog();
    });
}
