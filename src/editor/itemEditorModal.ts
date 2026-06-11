import { applyItemCatalogDocument, loadItemCatalog } from '../game-data/itemCatalog';
import { dispatchItemCatalogUpdated } from '../game-data/itemCatalogUi';
import {
    EQUIPMENT_SLOTS,
    getItemStackRules,
    sanitizeItemCatalogEntry,
    type ItemCatalogDocument,
    type ItemCatalogEntry,
    type ItemCategory,
} from '../game-data/itemCatalogTypes';
import { defaultItemIconUrl } from '../../shared/itemSprite';
import { apiFetch } from '../shared/apiFetch';
import { toast, popup } from '../utils/popup';
import { initItemSpriteCalibrator, openItemSpriteCalibrator } from './itemSpriteCalibrator';

let catalog: ItemCatalogDocument = { items: [] };
let activeItemId: string | null = null;
let pendingSelectId: string | null = null;

export function initItemEditor(): void {
    const modal = document.getElementById('itemEditorModal') as HTMLDivElement | null;
    const openBtn = document.getElementById('openItemEditorBtn');
    const closeBtn = document.getElementById('itemCloseBtn');
    const cancelBtn = document.getElementById('itemCancelBtn');
    const confirmBtn = document.getElementById('itemConfirmBtn') as HTMLButtonElement | null;
    const addBtn = document.getElementById('itemAddBtn');
    const deleteBtn = document.getElementById('itemDeleteBtn') as HTMLButtonElement | null;
    const categorySelect = document.getElementById('itemCategorySelect') as HTMLSelectElement | null;

    if (!modal || !confirmBtn) return;

    categorySelect?.addEventListener('change', () => {
        syncSlotFieldVisibility();
        applyDefaultStackFieldsForCategory();
    });
    document.getElementById('itemStackableCheck')?.addEventListener('change', syncStackFieldState);

    addBtn?.addEventListener('click', () => selectItem(null));
    closeBtn?.addEventListener('click', closeItemEditorModal);
    cancelBtn?.addEventListener('click', closeItemEditorModal);
    openBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void openItemEditorModal();
    });

    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!activeItemId) return;
            const item = catalog.items.find((i) => i.id === activeItemId);
            const ok = await popup.confirm(
                `Excluir o item <strong>${item?.name ?? activeItemId}</strong>? Mobs com loot ligado a ele ficarão inválidos.`,
                'Confirmar exclusão'
            );
            if (!ok) return;
            catalog.items = catalog.items.filter((i) => i.id !== activeItemId);
            await saveCatalog(activeItemId);
        };
    }

    document.getElementById('itemOpenSpriteCalibratorBtn')?.addEventListener('click', () => {
        if (!activeItemId) {
            toast.error('Salve o item no catálogo antes de calibrar o sprite.');
            return;
        }
        const item = catalog.items.find((i) => i.id === activeItemId);
        if (!item) return;
        void openItemSpriteCalibrator(item, () => void reloadItemCatalog(activeItemId));
    });

    initItemSpriteCalibrator();

    confirmBtn.onclick = async () => {
        const draft = readDraftFromForm();
        if (!draft) return;

        if (draft.implemented && !draft.sprite?.iconUrl) {
            toast.error('Calibre e salve o sprite antes de marcar Implementado.');
            return;
        }

        const previousId = activeItemId;
        const idx = catalog.items.findIndex((i) => i.id === (previousId ?? draft.id));
        if (idx >= 0) {
            catalog.items[idx] = draft;
            if (previousId && previousId !== draft.id) {
                catalog.items = catalog.items.filter(
                    (i, iIdx) => iIdx === idx || i.id !== previousId
                );
            }
        } else {
            if (catalog.items.some((i) => i.id === draft.id)) {
                toast.error(`Já existe um item com ID "${draft.id}".`);
                return;
            }
            catalog.items.push(draft);
        }

        catalog.items.sort((a, b) => a.name.localeCompare(b.name));
        await saveCatalog(draft.id);
    };
}

export async function openItemEditorModal(selectItemId?: string): Promise<void> {
    pendingSelectId = selectItemId ?? null;
    closeAllDropdownsSafe();
    const modal = document.getElementById('itemEditorModal') as HTMLDivElement | null;
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('is-open'));

    try {
        const res = await apiFetch('/api/get-item-catalog');
        if (!res.ok) throw new Error('Erro ao carregar catálogo de itens.');
        const data = (await res.json()) as { catalog?: ItemCatalogDocument };
        catalog = data.catalog ?? { items: [] };
        applyItemCatalogDocument(catalog);
        const target =
            (pendingSelectId && catalog.items.find((i) => i.id === pendingSelectId)?.id) ||
            catalog.items[0]?.id ||
            null;
        pendingSelectId = null;
        selectItem(target);
    } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Falha ao abrir catálogo de itens.');
    }
}

export function closeItemEditorModal(): void {
    const modal = document.getElementById('itemEditorModal') as HTMLDivElement | null;
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 250);
}

function closeAllDropdownsSafe(): void {
    document.querySelectorAll('#mainMenubar .menu-item.is-open').forEach((item) => {
        item.classList.remove('is-open');
    });
}

function readDraftFromForm(): ItemCatalogEntry | null {
    const idRaw = (document.getElementById('itemIdInput') as HTMLInputElement).value.trim();
    const name = (document.getElementById('itemNameInput') as HTMLInputElement).value.trim();
    const category = (document.getElementById('itemCategorySelect') as HTMLSelectElement)
        .value as ItemCategory;
    const slot = (document.getElementById('itemSlotSelect') as HTMLSelectElement).value;
    const speedRaw = (document.getElementById('itemSpeedBonusInput') as HTMLInputElement).value;
    const attackRaw = (document.getElementById('itemAttackBonusInput') as HTMLInputElement | null)?.value ?? '';
    const defenseRaw = (document.getElementById('itemDefenseBonusInput') as HTMLInputElement | null)?.value ?? '';
    const description = (document.getElementById('itemDescriptionInput') as HTMLInputElement).value.trim();
    const implemented = (document.getElementById('itemImplementedCheck') as HTMLInputElement).checked;
    const stackable = (document.getElementById('itemStackableCheck') as HTMLInputElement).checked;
    const maxStackRaw = (document.getElementById('itemMaxStackInput') as HTMLInputElement).value;

    const entry = sanitizeItemCatalogEntry({
        id: idRaw,
        name,
        category,
        slot: category === 'equipment' ? slot : undefined,
        speedBonus: speedRaw === '' ? undefined : Number(speedRaw),
        attackBonus: attackRaw === '' ? undefined : Number(attackRaw),
        defenseBonus: defenseRaw === '' ? undefined : Number(defenseRaw),
        description,
        implemented,
        stackable: category === 'equipment' ? false : stackable,
        maxStack: maxStackRaw === '' ? undefined : Number(maxStackRaw),
    });

    if (!entry) {
        toast.error('ID e nome são obrigatórios.');
        return null;
    }

    const preserved = catalog.items.find(
        (i) => i.id === activeItemId || i.id === entry.id
    );
    if (preserved?.sprite) {
        entry.sprite = preserved.sprite;
    }

    return entry;
}

async function reloadItemCatalog(selectId: string | null): Promise<void> {
    try {
        const res = await apiFetch('/api/get-item-catalog');
        if (!res.ok) return;
        const data = (await res.json()) as { catalog?: ItemCatalogDocument };
        catalog = data.catalog ?? { items: [] };
        applyItemCatalogDocument(catalog);
        dispatchItemCatalogUpdated(catalog);
        renderItemList();
        if (selectId) selectItem(selectId);
    } catch {
        /* ignore */
    }
}

async function saveCatalog(selectIdAfter: string): Promise<void> {
    try {
        const res = await apiFetch('/api/save-item-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ catalog }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Erro ao salvar catálogo.');
        }
        const result = (await res.json()) as { catalog?: ItemCatalogDocument };
        if (result.catalog) {
            catalog = result.catalog;
            applyItemCatalogDocument(catalog);
        }
        dispatchItemCatalogUpdated(catalog);
        await loadItemCatalog();
        toast.success('Catálogo de itens salvo!');
        renderItemList();
        const next =
            selectIdAfter && catalog.items.some((i) => i.id === selectIdAfter)
                ? selectIdAfter
                : catalog.items[0]?.id ?? null;
        selectItem(next);
    } catch (err: unknown) {
        popup.alert(
            `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`,
            'Erro ao Salvar'
        );
    }
}

function renderItemList(): void {
    const container = document.getElementById('itemListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (catalog.items.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:10px;color:var(--text-dim);line-height:1.4;margin:0;';
        empty.textContent =
            'Nenhum item cadastrado. Crie o primeiro para ligar loot de mobs. Itens só existem de fato após serem salvos aqui.';
        container.appendChild(empty);
        return;
    }

    for (const item of catalog.items) {
        const row = document.createElement('div');
        row.style.padding = '8px 12px';
        row.style.background = item.id === activeItemId ? 'var(--accent-color)' : '#1a1d24';
        row.style.color = '#fff';
        row.style.borderRadius = '4px';
        row.style.cursor = 'pointer';
        row.style.fontSize = '11px';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.gap = '8px';

        const thumb = document.createElement('img');
        thumb.width = 24;
        thumb.height = 24;
        thumb.style.imageRendering = 'pixelated';
        thumb.style.borderRadius = '4px';
        thumb.style.background = '#0f1115';
        thumb.style.flexShrink = '0';
        const iconUrl = item.sprite?.iconUrl ?? defaultItemIconUrl(item.id);
        thumb.src = `/${iconUrl}?t=${Date.now()}`;
        thumb.alt = '';
        thumb.onerror = () => {
            thumb.style.opacity = '0.25';
        };
        row.appendChild(thumb);

        const label = document.createElement('span');
        label.textContent = item.name;
        label.style.flex = '1';
        label.style.minWidth = '0';
        row.appendChild(label);

        const badge = document.createElement('span');
        badge.style.fontSize = '9px';
        badge.style.opacity = '0.85';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '999px';
        badge.style.flexShrink = '0';
        if (item.implemented) {
            badge.style.background = 'rgba(16, 185, 129, 0.25)';
            badge.style.color = '#6ee7b7';
            badge.textContent = 'OK';
        } else if (item.sprite?.iconUrl) {
            badge.style.background = 'rgba(99, 102, 241, 0.2)';
            badge.style.color = '#a5b4fc';
            badge.textContent = 'com arte';
        } else {
            badge.style.background = 'rgba(251, 191, 36, 0.2)';
            badge.style.color = '#fcd34d';
            badge.textContent = 'rascunho';
        }
        row.appendChild(badge);

        row.onclick = () => selectItem(item.id);
        container.appendChild(row);
    }
}

function selectItem(id: string | null): void {
    activeItemId = id;
    renderItemList();

    const deleteBtn = document.getElementById('itemDeleteBtn') as HTMLButtonElement | null;
    const idInput = document.getElementById('itemIdInput') as HTMLInputElement | null;

    if (!id) {
        if (idInput) {
            idInput.value = '';
            idInput.disabled = false;
        }
        if (deleteBtn) deleteBtn.style.display = 'none';
        resetForm();
        syncSpriteCalibratorButton();
        return;
    }

    const item = catalog.items.find((i) => i.id === id);
    if (!item) return;

    if (idInput) {
        idInput.value = item.id;
        idInput.disabled = false;
    }
    if (deleteBtn) deleteBtn.style.display = 'block';

    (document.getElementById('itemNameInput') as HTMLInputElement).value = item.name;
    (document.getElementById('itemCategorySelect') as HTMLSelectElement).value = item.category;
    (document.getElementById('itemSlotSelect') as HTMLSelectElement).value = item.slot ?? 'feet';
    (document.getElementById('itemSpeedBonusInput') as HTMLInputElement).value =
        item.speedBonus !== undefined ? String(item.speedBonus) : '';
    const attackInput = document.getElementById('itemAttackBonusInput') as HTMLInputElement | null;
    if (attackInput) {
        attackInput.value = item.attackBonus !== undefined ? String(item.attackBonus) : '';
    }
    const defenseInput = document.getElementById('itemDefenseBonusInput') as HTMLInputElement | null;
    if (defenseInput) {
        defenseInput.value = item.defenseBonus !== undefined ? String(item.defenseBonus) : '';
    }
    (document.getElementById('itemDescriptionInput') as HTMLInputElement).value =
        item.description ?? '';
    (document.getElementById('itemImplementedCheck') as HTMLInputElement).checked = item.implemented;
    const rules = getItemStackRules(item);
    (document.getElementById('itemStackableCheck') as HTMLInputElement).checked = rules.stackable;
    (document.getElementById('itemMaxStackInput') as HTMLInputElement).value = String(rules.maxStack);
    syncSlotFieldVisibility();
    syncStackFieldState();
    syncSpriteCalibratorButton();
}

function syncSpriteCalibratorButton(): void {
    const btn = document.getElementById('itemOpenSpriteCalibratorBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = !activeItemId;
}

function resetForm(): void {
    (document.getElementById('itemNameInput') as HTMLInputElement).value = '';
    (document.getElementById('itemCategorySelect') as HTMLSelectElement).value = 'loot';
    (document.getElementById('itemSlotSelect') as HTMLSelectElement).value = 'feet';
    (document.getElementById('itemSpeedBonusInput') as HTMLInputElement).value = '';
    const attackInput = document.getElementById('itemAttackBonusInput') as HTMLInputElement | null;
    if (attackInput) attackInput.value = '';
    const defenseInput = document.getElementById('itemDefenseBonusInput') as HTMLInputElement | null;
    if (defenseInput) defenseInput.value = '';
    (document.getElementById('itemDescriptionInput') as HTMLInputElement).value = '';
    (document.getElementById('itemImplementedCheck') as HTMLInputElement).checked = false;
    applyDefaultStackFieldsForCategory();
    syncSlotFieldVisibility();
    syncStackFieldState();
}

function applyDefaultStackFieldsForCategory(): void {
    const category = (document.getElementById('itemCategorySelect') as HTMLSelectElement)?.value;
    const stackableCheck = document.getElementById('itemStackableCheck') as HTMLInputElement | null;
    const maxStackInput = document.getElementById('itemMaxStackInput') as HTMLInputElement | null;
    if (!stackableCheck || !maxStackInput) return;
    if (category === 'equipment') {
        stackableCheck.checked = false;
        maxStackInput.value = '1';
    } else {
        stackableCheck.checked = true;
        if (maxStackInput.value === '1') maxStackInput.value = '100';
    }
}

function syncStackFieldState(): void {
    const category = (document.getElementById('itemCategorySelect') as HTMLSelectElement)?.value;
    const stackableCheck = document.getElementById('itemStackableCheck') as HTMLInputElement | null;
    const maxStackInput = document.getElementById('itemMaxStackInput') as HTMLInputElement | null;
    const isEquipment = category === 'equipment';
    if (stackableCheck) {
        stackableCheck.disabled = isEquipment;
        if (isEquipment) stackableCheck.checked = false;
    }
    if (maxStackInput) {
        maxStackInput.disabled = isEquipment || !(stackableCheck?.checked ?? true);
        if (isEquipment) maxStackInput.value = '1';
    }
}

function syncSlotFieldVisibility(): void {
    const category = (document.getElementById('itemCategorySelect') as HTMLSelectElement)?.value;
    const slotWrap = document.getElementById('itemSlotWrap');
    const speedWrap = document.getElementById('itemSpeedWrap');
    const attackWrap = document.getElementById('itemAttackWrap');
    const defenseWrap = document.getElementById('itemDefenseWrap');
    const isEquipment = category === 'equipment';
    if (slotWrap) slotWrap.style.display = isEquipment ? 'block' : 'none';
    if (speedWrap) speedWrap.style.display = isEquipment ? 'block' : 'none';
    if (attackWrap) attackWrap.style.display = isEquipment ? 'block' : 'none';
    if (defenseWrap) defenseWrap.style.display = isEquipment ? 'block' : 'none';

    const slotSelect = document.getElementById('itemSlotSelect') as HTMLSelectElement | null;
    if (slotSelect && slotSelect.options.length === 0) {
        slotSelect.innerHTML = EQUIPMENT_SLOTS.map(
            (slot) => `<option value="${slot}">${slot}</option>`
        ).join('');
    }
}
