import { assetLoader } from '../../game-data/assetLoader';
import { getSpellCatalogEntries } from '../../game-data/spellCatalog';
import type { SpellDefinition, SpellGroup } from '../../game-data/spellCatalogTypes';
import type { CharacterRow } from '../../shared/types';
import { isPlaySpellLearned } from '../playLearnedSpells';
import {
    equipSpellToSlot,
    getPlaySpellBarState,
    getSpellForSlot,
    type SpellBarSlot,
} from './playSpellBar';
import { refreshPlayCombatHubSpells } from './playCombatHub';
import { openPlayPanel, onPlayPanelOpen, isPlayPanelOpen } from './playHudPanels';
import { toast } from '../../utils/popup';

type SpellFilter = 'all' | SpellGroup;

const FILTER_LABELS: Record<SpellFilter, string> = {
    all: 'Todas',
    attack: 'Ataque',
    healing: 'Cura',
    support: 'Suporte',
};

const LIST_HEAD_LABELS: Record<SpellFilter, string> = {
    all: 'Todas as magias',
    attack: 'Magias de ataque',
    healing: 'Magias de cura',
    support: 'Magias de suporte',
};

let activeCharacter: CharacterRow | null = null;
let selectedSpellId: string | null = null;
let targetSlot: SpellBarSlot = 1;
let groupFilter: SpellFilter = 'all';
let spellModalDirty = false;

const EMPTY_ICON = '/ui/play-hud/combat/slot_empty.svg';

function spellIconUrl(icon: string): string {
    return assetLoader.resolveAssetUrl(icon);
}

function spellAppliesToVocation(spell: SpellDefinition, vocation: string): boolean {
    if (spell.vocations.length === 0) return true;
    return spell.vocations.includes(vocation.toLowerCase());
}

function isSpellUnlocked(spell: SpellDefinition, _character: CharacterRow): boolean {
    if (!spell.implemented) return false;
    return isPlaySpellLearned(spell.id);
}

function damageTypeLabel(spell: SpellDefinition): string {
    const t = spell.damage?.type;
    if (t === 'melee') return 'Melee';
    if (t === 'healing') return 'Cura';
    if (t === 'magic') return 'Magia';
    return spell.group === 'healing' ? 'Cura' : 'Magia';
}

function groupLabel(group: SpellGroup): string {
    if (group === 'healing') return 'Cura';
    if (group === 'support') return 'Suporte';
    return 'Ataque';
}

function setGroupFilter(next: SpellFilter): void {
    groupFilter = next;
    updateFilterUi();
    renderSpellList();
    renderSpellDetail();
}

function updateFilterUi(): void {
    const menu = document.getElementById('playSpellModalFilterMenu');
    const btn = document.getElementById('playSpellModalFilterBtn');
    const listHead = document.querySelector<HTMLElement>('.play-spell-modal__list-head h3');

    menu?.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((option) => {
        const value = (option.dataset.filter as SpellFilter) || 'all';
        const selected = value === groupFilter;
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    btn?.classList.toggle('is-active', groupFilter !== 'all');
    if (listHead) listHead.textContent = LIST_HEAD_LABELS[groupFilter];
    btn?.setAttribute('title', `Filtrar magias — ${FILTER_LABELS[groupFilter]}`);
}

function setFilterMenuOpen(open: boolean): void {
    const menu = document.getElementById('playSpellModalFilterMenu');
    const btn = document.getElementById('playSpellModalFilterBtn');
    if (!menu || !btn) return;

    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('is-open', open);
}

function closeFilterMenu(): void {
    setFilterMenuOpen(false);
}

function getVisibleSpells(): SpellDefinition[] {
    if (!activeCharacter) return [];
    const vocation = (activeCharacter.vocation || 'knight').toLowerCase();
    return getSpellCatalogEntries()
        .filter((s) => spellAppliesToVocation(s, vocation))
        .filter((s) => groupFilter === 'all' || s.group === groupFilter)
        .sort((a, b) => {
            if (a.minLevel !== b.minLevel) return a.minLevel - b.minLevel;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
}

function getSpellByIdLocal(id: string): SpellDefinition | undefined {
    return getSpellCatalogEntries().find((s) => s.id === id);
}

function isEquippedInBar(spellId: string): SpellBarSlot | null {
    const bar = getPlaySpellBarState();
    if (bar.slot1 === spellId) return 1;
    if (bar.slot2 === spellId) return 2;
    if (bar.slot3 === spellId) return 3;
    return null;
}

function setMobileDetailOpen(open: boolean): void {
    document.getElementById('playSpellModalMain')?.classList.toggle('is-detail-view', open);
}

function renderSlotPreviews(): void {
    ([1, 2, 3] as SpellBarSlot[]).forEach((slot) => {
        const btn = document.querySelector<HTMLButtonElement>(`[data-spell-target-slot="${slot}"]`);
        if (!btn) return;
        const spell = getSpellForSlot(slot);
        const icon = btn.querySelector<HTMLImageElement>('.play-spell-modal__slot-icon img');
        const nameEl = btn.querySelector<HTMLElement>('.play-spell-modal__slot-name');
        const metaEl = btn.querySelector<HTMLElement>('.play-spell-modal__slot-meta');
        if (icon) {
            icon.src = spellIconUrl(spell?.icon ?? EMPTY_ICON);
            icon.alt = spell?.name ?? '';
        }
        if (nameEl) nameEl.textContent = spell?.name ?? 'Vazio';
        if (metaEl) {
            metaEl.textContent = spell ? `Lv ${spell.minLevel}` : `Slot ${slot}`;
        }
        btn.classList.toggle('is-target', slot === targetSlot);
    });
}

function renderSpellList(): void {
    const list = document.getElementById('playSpellModalList');
    if (!list || !activeCharacter) return;

    const spells = getVisibleSpells();
    if (spells.length === 0) {
        list.innerHTML = '<p class="play-spell-modal__detail-empty">Nenhuma magia neste filtro.</p>';
        return;
    }

    if (selectedSpellId && !spells.some((s) => s.id === selectedSpellId)) {
        selectedSpellId = spells[0]?.id ?? null;
    }
    if (!selectedSpellId && spells[0]) {
        selectedSpellId = spells[0].id;
    }

    list.innerHTML = spells
        .map((spell) => {
            const unlocked = isSpellUnlocked(spell, activeCharacter!);
            const equipped = isEquippedInBar(spell.id);
            const selected = spell.id === selectedSpellId;
            const status = unlocked
                ? '<span class="play-spell-modal__status play-spell-modal__status--ok">Desbloqueada</span>'
                : `<span class="play-spell-modal__status play-spell-modal__status--lock">Lv ${spell.minLevel}</span>`;
            const equippedHint = equipped ? ` · Slot ${equipped}` : '';
            return `
        <button type="button"
          class="play-spell-modal__list-item${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}"
          data-spell-id="${spell.id}">
          <span class="play-spell-modal__list-icon">
            <img src="${spellIconUrl(spell.icon)}" alt="" width="24" height="24" draggable="false" />
          </span>
          <span class="play-spell-modal__list-body">
            <strong>${spell.name}${equippedHint}</strong>
            <small>Lv ${spell.minLevel} · ${spell.manaCost} MP · ${damageTypeLabel(spell)}</small>
          </span>
          ${status}
        </button>`;
        })
        .join('');

    list.querySelectorAll<HTMLButtonElement>('[data-spell-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedSpellId = btn.dataset.spellId ?? null;
            renderSpellList();
            renderSpellDetail();
            if (window.matchMedia('(max-width: 768px)').matches) {
                setMobileDetailOpen(Boolean(selectedSpellId));
            }
        });
    });
}

function renderSpellDetail(): void {
    const pane = document.getElementById('playSpellModalDetail');
    const empty = document.getElementById('playSpellModalDetailEmpty');
    const content = document.getElementById('playSpellModalDetailContent');
    const equipBtn = document.getElementById('playSpellEquipBtn') as HTMLButtonElement | null;
    if (!pane || !empty || !content || !equipBtn || !activeCharacter) return;

    const spell = selectedSpellId ? getSpellByIdLocal(selectedSpellId) : undefined;
    if (!spell) {
        empty.hidden = false;
        content.hidden = true;
        equipBtn.hidden = true;
        return;
    }

    empty.hidden = true;
    content.hidden = false;
    equipBtn.hidden = false;

    const unlocked = isSpellUnlocked(spell, activeCharacter);
    const cdSec = (spell.cooldownMs / 1000).toFixed(1);

    const iconEl = content.querySelector<HTMLImageElement>('#playSpellDetailIcon');
    const nameEl = content.querySelector<HTMLElement>('#playSpellDetailName');
    const descEl = content.querySelector<HTMLElement>('#playSpellDetailDesc');
    const tagsEl = content.querySelector<HTMLElement>('#playSpellDetailTags');
    const summaryEl = content.querySelector<HTMLElement>('#playSpellDetailSummary');
    const manaEl = content.querySelector<HTMLElement>('#playSpellDetailMana');
    const cdEl = content.querySelector<HTMLElement>('#playSpellDetailCd');
    const rangeEl = content.querySelector<HTMLElement>('#playSpellDetailRange');

    if (iconEl) {
        iconEl.src = spellIconUrl(spell.icon);
        iconEl.alt = spell.name;
    }
    if (nameEl) nameEl.textContent = spell.name;
    if (descEl) descEl.textContent = spell.description || 'Sem descrição.';
    if (tagsEl) {
        tagsEl.innerHTML = unlocked
            ? `<span class="is-unlocked">Desbloqueada</span><span>${groupLabel(spell.group)}</span><span>${damageTypeLabel(spell)}</span>`
            : `<span>Lv ${spell.minLevel} necessário</span><span>${groupLabel(spell.group)}</span>`;
    }
    if (summaryEl) {
        summaryEl.textContent = `Lv ${spell.minLevel} · ${spell.manaCost} MP · ${damageTypeLabel(spell)} · alcance ${spell.range}`;
    }
    if (manaEl) manaEl.textContent = String(spell.manaCost);
    if (cdEl) cdEl.textContent = `${cdSec}s`;
    if (rangeEl) rangeEl.textContent = String(spell.range);

    equipBtn.disabled = !unlocked;
    equipBtn.textContent = unlocked
        ? `Equipar no slot ${targetSlot}`
        : `Bloqueada — level ${spell.minLevel}`;
}

function renderAll(): void {
    renderSlotPreviews();
    renderSpellList();
    renderSpellDetail();
}

function equipSelectedSpell(): void {
    if (!activeCharacter || !selectedSpellId) return;
    const spell = getSpellByIdLocal(selectedSpellId);
    if (!spell || !isSpellUnlocked(spell, activeCharacter)) return;

    void equipSpellToSlot(selectedSpellId, targetSlot)
        .then(() => {
            refreshPlayCombatHubSpells();
            renderAll();
            toast.show(`${spell.name} equipada no slot ${targetSlot}.`, 'success');
        })
        .catch(() => {
            toast.show('Não foi possível equipar a magia.', 'error');
        });
}

export function openPlaySpellModal(): void {
    openPlayPanel('spells');
}

export function initPlaySpellModal(): void {
    const filterBtn = document.getElementById('playSpellModalFilterBtn');
    const filterMenu = document.getElementById('playSpellModalFilterMenu');

    filterBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = filterMenu?.hidden === false;
        setFilterMenuOpen(!isOpen);
    });

    filterMenu?.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((option) => {
        option.addEventListener('click', (event) => {
            event.stopPropagation();
            const value = (option.dataset.filter as SpellFilter) || 'all';
            setGroupFilter(value);
            closeFilterMenu();
        });
    });

    document.addEventListener('click', (event) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (filterBtn?.contains(target) || filterMenu?.contains(target)) return;
        closeFilterMenu();
    });

    updateFilterUi();

    document.querySelectorAll<HTMLButtonElement>('[data-spell-target-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const slot = Number(btn.dataset.spellTargetSlot) as SpellBarSlot;
            if (![1, 2, 3].includes(slot)) return;
            targetSlot = slot;
            renderSlotPreviews();
            renderSpellDetail();
        });
    });

    document.getElementById('playSpellEquipBtn')?.addEventListener('click', equipSelectedSpell);

    document.getElementById('playSpellModalBack')?.addEventListener('click', () => {
        setMobileDetailOpen(false);
    });

    document.getElementById('openSpellsPanelBtn')?.addEventListener('click', openPlaySpellModal);

    onPlayPanelOpen((name) => {
        if (name === 'spells') {
            closeFilterMenu();
            setMobileDetailOpen(false);
            if (spellModalDirty || !selectedSpellId) {
                spellModalDirty = false;
                renderAll();
            }
        }
    });

    window.addEventListener('resize', () => {
        if (!window.matchMedia('(max-width: 768px)').matches) {
            setMobileDetailOpen(false);
        }
    });
}

export function bindPlaySpellModalCharacter(character: CharacterRow): void {
    activeCharacter = character;
    renderAll();
}

export function refreshPlaySpellModal(): void {
    if (!isPlayPanelOpen('spells')) {
        spellModalDirty = true;
        return;
    }
    spellModalDirty = false;
    renderAll();
}

/** @deprecated use bindPlaySpellModalCharacter */
export const bindPlaySpellPickerCharacter = bindPlaySpellModalCharacter;
/** @deprecated use refreshPlaySpellModal */
export const refreshPlaySpellPicker = refreshPlaySpellModal;
/** @deprecated use initPlaySpellModal */
export const initPlaySpellPicker = initPlaySpellModal;
