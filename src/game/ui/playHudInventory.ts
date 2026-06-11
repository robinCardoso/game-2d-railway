import {
    BACKPACK_SLOT_COUNT,
    INVENTORY_BAG_COUNT,
    repairInventoryState,
    validateCharacterInventory,
} from '../../../shared/inventory';
import type { CharacterInventoryDocument } from '../../../shared/inventory';
import {
    countGoldInBags,
    isBagUnlocked,
    occupiedInBag,
    totalOccupiedInUnlockedBags,
} from '../../../shared/inventoryBags';
import {
    canEquipItem,
    describeItemStats,
    equipFromBackpack,
    unequipToBackpack,
} from '../../../shared/inventoryEquip';
import type { EquipmentSlot, ItemCatalogEntry } from '../../game-data/itemCatalogTypes';
import { getItemCatalog, getItemCatalogEntry } from '../../game-data/itemCatalog';
import { drawItemIconFrame, fetchItemIconImage } from '../../game-data/itemIconRegistry';
import { itemSpriteHasAnimation } from '../../../shared/itemSprite';
import { fetchCharacterInventory, saveCharacterInventory } from '../characterInventoryApi';
import {
    clearInventoryIconAnimations,
    registerInventoryIconAnimation,
} from './itemIconAnimator';
import { onPlayPanelOpen } from './playHudPanels';
import { markHudUpdate } from '../debug/playPerformanceMonitor';
import { toast } from '../../utils/popup';

const SLOT_LABELS: Record<EquipmentSlot, string> = {
    head: 'Cabeça',
    body: 'Corpo',
    legs: 'Pernas',
    feet: 'Pés',
    ring: 'Anel',
    amulet: 'Amuleto',
    weapon: 'Arma',
    shield: 'Escudo',
};

const ICON_SIZE = 28;
const DETAIL_ICON_SIZE = 48;
const LOCKED_BAG_TOOLTIP = 'Bolsa extra — desbloqueie na loja (em breve)';

type InventorySelection =
    | { kind: 'backpack'; bagIndex: number; slotIndex: number }
    | { kind: 'equipment'; slot: EquipmentSlot };

let activeCharacterId: string | null = null;
let lastInventory: CharacterInventoryDocument | null = null;
let selection: InventorySelection | null = null;
let activeBagIndex = 0;
let bagGridReady = false;
let saving = false;
let onInventoryChange: ((inventory: CharacterInventoryDocument) => void) | null = null;

function isActiveBagLocked(): boolean {
    if (!lastInventory) return false;
    return !isBagUnlocked(activeBagIndex, lastInventory.unlockedBagSlots);
}

function setActiveBagIndex(bagIndex: number): void {
    if (bagIndex < 0 || bagIndex >= INVENTORY_BAG_COUNT) return;
    if (lastInventory && !isBagUnlocked(bagIndex, lastInventory.unlockedBagSlots)) {
        toast.show(LOCKED_BAG_TOOLTIP, 'info');
        return;
    }
    activeBagIndex = bagIndex;
    syncBagTabs();
    if (lastInventory) {
        renderBackpack(lastInventory.bags[activeBagIndex] ?? [], lastInventory);
        if (selection?.kind === 'backpack' && selection.bagIndex !== activeBagIndex) {
            selection = null;
            renderItemDetail();
        }
        updateSelectionHighlight();
    }
}

function syncBagTabs(): void {
    const unlocked = lastInventory?.unlockedBagSlots ?? 3;
    document.querySelectorAll<HTMLButtonElement>('.inventory-tab[data-bag-index]').forEach((tab) => {
        const bagIndex = Number(tab.dataset.bagIndex);
        const locked = !isBagUnlocked(bagIndex, unlocked);
        tab.classList.toggle('inventory-tab--locked', locked);
        tab.classList.toggle('is-active', bagIndex === activeBagIndex && !locked);
        tab.setAttribute('aria-selected', bagIndex === activeBagIndex && !locked ? 'true' : 'false');
        tab.title = locked ? LOCKED_BAG_TOOLTIP : `Bolsa ${bagIndex + 1}`;
    });
}

function ensureBagGrid(): void {
    if (bagGridReady) return;
    const grid = document.getElementById('bagGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bag-slot';
        btn.dataset.slotIndex = String(i);
        grid.appendChild(btn);
    }
    bagGridReady = true;
}

function ensureSlotIconCanvas(container: HTMLElement, size = ICON_SIZE): HTMLCanvasElement {
    let canvas = container.querySelector('canvas.item-slot-icon') as HTMLCanvasElement | null;
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'item-slot-icon';
        container.appendChild(canvas);
    }
    canvas.width = size;
    canvas.height = size;
    return canvas;
}

function ensureTextFallback(container: HTMLElement, className: string): HTMLSpanElement {
    let el = container.querySelector(`.${className}`) as HTMLSpanElement | null;
    if (!el) {
        el = document.createElement('span');
        el.className = className;
        container.appendChild(el);
    }
    return el;
}

async function paintItemInSlot(
    container: HTMLElement,
    itemId: string,
    textClass: string,
    iconSize = ICON_SIZE
): Promise<void> {
    const entry = getItemCatalogEntry(itemId);
    const canvas = ensureSlotIconCanvas(container, iconSize);
    const textEl = ensureTextFallback(container, textClass);
    const displayName = entry?.name ?? itemId;
    container.title = displayName;

    if (!entry?.sprite?.iconUrl) {
        canvas.hidden = true;
        textEl.hidden = false;
        textEl.textContent = displayName;
        return;
    }

    const img = await fetchItemIconImage(entry.sprite.iconUrl);
    const ctx = canvas.getContext('2d');
    if (!img || !ctx) {
        canvas.hidden = true;
        textEl.hidden = false;
        textEl.textContent = displayName;
        return;
    }

    drawItemIconFrame(ctx, img, entry.sprite, 0, 0, iconSize);
    canvas.hidden = false;
    textEl.hidden = true;
    textEl.textContent = '';

    if (itemSpriteHasAnimation(entry.sprite)) {
        registerInventoryIconAnimation(canvas, img, entry.sprite);
    }
}

function clearSlotVisual(container: HTMLElement, textClass: string): void {
    container.removeAttribute('title');
    const canvas = container.querySelector('canvas.item-slot-icon') as HTMLCanvasElement | null;
    if (canvas) canvas.hidden = true;
    const textEl = container.querySelector(`.${textClass}`) as HTMLSpanElement | null;
    if (textEl) {
        textEl.hidden = true;
        textEl.textContent = '';
    }
}

function updateSelectionHighlight(): void {
    document.querySelectorAll<HTMLElement>('.bag-slot, .equipment-slot').forEach((el) => {
        el.classList.remove('is-selected');
    });
    if (!selection) return;
    if (selection.kind === 'backpack') {
        if (selection.bagIndex !== activeBagIndex) return;
        const el = document.querySelector<HTMLElement>(
            `.bag-slot[data-slot-index="${selection.slotIndex}"]`
        );
        el?.classList.add('is-selected');
    } else {
        const el = document.querySelector<HTMLElement>(
            `.equipment-slot[data-slot="${selection.slot}"]`
        );
        el?.classList.add('is-selected');
    }
}

function resolveSelectedItem(): { itemId: string; entry: ItemCatalogEntry | undefined; quantity?: number } | null {
    if (!selection || !lastInventory) return null;
    const sel = selection;
    if (sel.kind === 'equipment') {
        const itemId = lastInventory.equipment[sel.slot];
        if (!itemId) return null;
        return { itemId, entry: getItemCatalogEntry(itemId) };
    }
    const bag = lastInventory.bags[sel.bagIndex] ?? [];
    const row = bag.find((r) => r.slotIndex === sel.slotIndex);
    if (!row) return null;
    return { itemId: row.itemId, entry: getItemCatalogEntry(row.itemId), quantity: row.quantity };
}

async function paintDetailIcon(entry: ItemCatalogEntry | undefined): Promise<void> {
    const canvas = document.getElementById('inventoryItemDetailIcon') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, DETAIL_ICON_SIZE, DETAIL_ICON_SIZE);
    if (!entry?.sprite?.iconUrl) return;
    const img = await fetchItemIconImage(entry.sprite.iconUrl);
    if (!img) return;
    drawItemIconFrame(ctx, img, entry.sprite, 0, 0, DETAIL_ICON_SIZE);
}

function renderItemDetail(): void {
    const panel = document.getElementById('inventoryItemDetail');
    const nameEl = document.getElementById('inventoryItemDetailName');
    const metaEl = document.getElementById('inventoryItemDetailMeta');
    const descEl = document.getElementById('inventoryItemDetailDesc');
    const equipBtn = document.getElementById('inventoryItemEquipBtn') as HTMLButtonElement | null;
    const unequipBtn = document.getElementById('inventoryItemUnequipBtn') as HTMLButtonElement | null;

    const selected = resolveSelectedItem();
    if (!panel || !selected?.entry) {
        panel?.setAttribute('hidden', '');
        return;
    }

    panel.removeAttribute('hidden');
    const { itemId, entry, quantity } = selected;

    if (nameEl) nameEl.textContent = entry.name;
    if (descEl) descEl.textContent = entry.description ?? '';

    const stats = describeItemStats(entry);
    const metaParts: string[] = [];
    if (entry.category === 'equipment' && entry.slot) {
        metaParts.push(`Slot: ${SLOT_LABELS[entry.slot]}`);
    } else if (entry.category === 'loot') {
        metaParts.push(entry.id === 'gold_coin' ? 'Moeda' : 'Consumível / loot');
    }
    if (quantity && quantity > 1) metaParts.push(`Quantidade: ${quantity}`);
    if (stats.length) metaParts.push(stats.join(' · '));
    if (metaEl) metaEl.textContent = metaParts.join(' — ');

    void paintDetailIcon(entry);

    const equipable = canEquipItem(itemId, getItemCatalog());
    const showEquip =
        selection?.kind === 'backpack' &&
        equipable.ok === true &&
        !isActiveBagLocked();
    const showUnequip = selection?.kind === 'equipment';

    if (equipBtn) {
        equipBtn.hidden = !showEquip;
        equipBtn.disabled = saving;
    }
    if (unequipBtn) {
        unequipBtn.hidden = !showUnequip;
        unequipBtn.disabled = saving;
    }
}

function renderEquipment(equipment: CharacterInventoryDocument['equipment']): void {
    document.querySelectorAll<HTMLButtonElement>('.equipment-slot').forEach((slot) => {
        const key = slot.dataset.slot as EquipmentSlot | undefined;
        if (!key) return;
        const itemId = equipment[key] ?? '';
        const currentItemId = slot.dataset.equippedItemId ?? '';

        const label = slot.querySelector('.equipment-slot__label');
        if (!label) {
            const span = document.createElement('span');
            span.className = 'equipment-slot__label';
            span.textContent = SLOT_LABELS[key];
            slot.prepend(span);
        }

        if (currentItemId === itemId) {
            return;
        }

        slot.dataset.equippedItemId = itemId;

        if (itemId) {
            slot.classList.add('has-item');
            void paintItemInSlot(slot, itemId, 'equipment-slot__item');
        } else {
            slot.classList.remove('has-item');
            clearSlotVisual(slot, 'equipment-slot__item');
        }
    });
}

function renderBackpack(
    bag: CharacterInventoryDocument['bags'][number],
    inventory: CharacterInventoryDocument
): void {
    ensureBagGrid();
    const locked = !isBagUnlocked(activeBagIndex, inventory.unlockedBagSlots);
    const bagPanel = document.getElementById('inventoryBagPanel');
    bagPanel?.classList.toggle('inventory-bag-panel--locked', locked);

    const byIndex = new Map(bag.map((row) => [row.slotIndex, row]));
    document.querySelectorAll<HTMLButtonElement>('.bag-slot').forEach((slot) => {
        const index = Number(slot.dataset.slotIndex);
        const row = locked ? undefined : byIndex.get(index);

        const currentBagIndex = slot.dataset.renderedBagIndex ?? '';
        const currentItemId = slot.dataset.itemId || '';
        const currentQty = slot.dataset.qty || '';
        const currentLocked = slot.dataset.locked || 'false';

        const targetBagIndex = String(activeBagIndex);
        const targetItemId = row ? row.itemId : '';
        const targetQty = row ? String(row.quantity) : '';
        const targetLocked = locked ? 'true' : 'false';

        if (
            currentBagIndex === targetBagIndex &&
            currentItemId === targetItemId &&
            currentQty === targetQty &&
            currentLocked === targetLocked
        ) {
            return;
        }

        slot.dataset.renderedBagIndex = targetBagIndex;
        slot.dataset.itemId = targetItemId;
        slot.dataset.qty = targetQty;
        slot.dataset.locked = targetLocked;

        slot.classList.toggle('has-item', Boolean(row));
        slot.disabled = locked;
        if (row) {
            void paintItemInSlot(slot, row.itemId, 'bag-slot__name');
            let qty = slot.querySelector('.bag-slot__qty') as HTMLSpanElement | null;
            if (row.quantity > 1) {
                if (!qty) {
                    qty = document.createElement('span');
                    qty.className = 'bag-slot__qty';
                    slot.appendChild(qty);
                }
                qty.hidden = false;
                qty.textContent = `×${row.quantity}`;
            } else if (qty) {
                qty.hidden = true;
                qty.textContent = '';
            }
        } else {
            clearSlotVisual(slot, 'bag-slot__name');
            const qty = slot.querySelector('.bag-slot__qty') as HTMLSpanElement | null;
            if (qty) {
                qty.hidden = true;
                qty.textContent = '';
            }
        }
    });

    const capEl = document.getElementById('inventoryCapacity');
    if (capEl) {
        capEl.textContent = `${occupiedInBag(bag)} / ${BACKPACK_SLOT_COUNT}`;
    }

    const totalEl = document.getElementById('inventoryTotalCapacity');
    if (totalEl) {
        const unlocked = inventory.unlockedBagSlots;
        const occupied = totalOccupiedInUnlockedBags(inventory.bags, unlocked);
        totalEl.textContent = `Total: ${occupied} / ${unlocked * BACKPACK_SLOT_COUNT}`;
    }

    const goldEl = document.getElementById('inventoryGold');
    if (goldEl) {
        const total = countGoldInBags(inventory.bags, inventory.unlockedBagSlots);
        goldEl.textContent = total > 0 ? `${total} moeda(s) de ouro` : '—';
    }
}

function applyInventoryToHud(inventory: CharacterInventoryDocument): void {
    lastInventory = repairInventoryState(inventory).inventory;
    if (!isBagUnlocked(activeBagIndex, lastInventory.unlockedBagSlots)) {
        activeBagIndex = 0;
    }
    syncBagTabs();
    renderEquipment(lastInventory.equipment);
    renderBackpack(lastInventory.bags[activeBagIndex] ?? [], lastInventory);
    updateSelectionHighlight();
    renderItemDetail();
    markHudUpdate('inventory');
    onInventoryChange?.(inventory);
}

function setInventoryMessage(loading: boolean, error: string | null): void {
    const loadingEl = document.getElementById('inventoryLoading');
    const errorEl = document.getElementById('inventoryError');
    if (loadingEl) loadingEl.hidden = !loading;
    if (errorEl) {
        errorEl.hidden = !error;
        errorEl.textContent = error ?? '';
    }
}

function setSavingState(isSaving: boolean): void {
    saving = isSaving;
    const panel = document.getElementById('inventoryPanel');
    panel?.classList.toggle('inventory-panel--saving', isSaving);
    renderItemDetail();
}

async function persistInventory(next: CharacterInventoryDocument): Promise<boolean> {
    if (!activeCharacterId || !lastInventory) return false;

    const catalog = getItemCatalog();
    const repairedNext = repairInventoryState(next).inventory;
    const repairedPrevious = repairInventoryState(lastInventory).inventory;
    const parsed = validateCharacterInventory(repairedNext, catalog, { previous: repairedPrevious });
    if (!parsed.ok) {
        toast.show(parsed.errors[0] ?? 'Inventário inválido.', 'error');
        return false;
    }

    setSavingState(true);
    try {
        const saved = await saveCharacterInventory(activeCharacterId, parsed.value);
        applyInventoryToHud(saved);
        setInventoryMessage(false, null);
        return true;
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao salvar inventário.';
        toast.show(msg, 'error');
        setInventoryMessage(false, msg);
        return false;
    } finally {
        setSavingState(false);
    }
}

async function handleEquip(): Promise<void> {
    if (!lastInventory || selection?.kind !== 'backpack') return;
    const result = equipFromBackpack(
        lastInventory,
        selection.bagIndex,
        selection.slotIndex,
        getItemCatalog()
    );
    if (!result.ok) {
        toast.show(result.message, 'error');
        return;
    }
    if (await persistInventory(result.inventory)) {
        toast.show('Item equipado.', 'success');
    }
}

async function handleUnequip(): Promise<void> {
    if (!lastInventory || selection?.kind !== 'equipment') return;
    const result = unequipToBackpack(lastInventory, selection.slot, getItemCatalog());
    if (!result.ok) {
        toast.show(result.message, 'error');
        return;
    }
    if (await persistInventory(result.inventory)) {
        toast.show('Item desequipado.', 'success');
    }
}

function onSlotClick(target: EventTarget | null): void {
    if (saving || isActiveBagLocked()) return;
    const bagSlot = (target as HTMLElement).closest<HTMLButtonElement>('.bag-slot');
    if (bagSlot) {
        const index = Number(bagSlot.dataset.slotIndex);
        const bag = lastInventory?.bags[activeBagIndex] ?? [];
        const row = bag.find((r) => r.slotIndex === index);
        selection = row ? { kind: 'backpack', bagIndex: activeBagIndex, slotIndex: index } : null;
        updateSelectionHighlight();
        renderItemDetail();
        return;
    }
    const equipSlot = (target as HTMLElement).closest<HTMLButtonElement>('.equipment-slot');
    if (equipSlot?.dataset.slot) {
        const slot = equipSlot.dataset.slot as EquipmentSlot;
        const itemId = lastInventory?.equipment[slot];
        selection = itemId ? { kind: 'equipment', slot } : null;
        updateSelectionHighlight();
        renderItemDetail();
    }
}

function bindInventoryInteractions(): void {
    const body = document.getElementById('inventoryPanelBody');
    body?.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement;
        const tab = target.closest<HTMLButtonElement>('.inventory-tab[data-bag-index]');
        if (tab?.dataset.bagIndex !== undefined) {
            setActiveBagIndex(Number(tab.dataset.bagIndex));
            return;
        }
        onSlotClick(target);
    });

    document.getElementById('inventoryItemEquipBtn')?.addEventListener('click', () => {
        void handleEquip();
    });
    document.getElementById('inventoryItemUnequipBtn')?.addEventListener('click', () => {
        void handleUnequip();
    });
}

let interactionsBound = false;

export async function refreshPlayHudInventory(): Promise<void> {
    if (!activeCharacterId) return;
    setInventoryMessage(true, null);
    try {
        const inventory = await fetchCharacterInventory(activeCharacterId);
        selection = null;
        clearInventoryIconAnimations();
        applyInventoryToHud(inventory);
        setInventoryMessage(false, null);
    } catch (err) {
        setInventoryMessage(false, err instanceof Error ? err.message : 'Falha ao carregar inventário.');
    }
}

export function initPlayHudInventory(
    characterId: string,
    options?: { onInventoryChange?: (inventory: CharacterInventoryDocument) => void }
): void {
    activeCharacterId = characterId;
    onInventoryChange = options?.onInventoryChange ?? null;
    activeBagIndex = 0;
    ensureBagGrid();
    if (!interactionsBound) {
        bindInventoryInteractions();
        interactionsBound = true;
    }
    syncBagTabs();

    void refreshPlayHudInventory();

    onPlayPanelOpen((name) => {
        if (name === 'inventory') {
            void refreshPlayHudInventory();
        }
    });
}

export function getLastPlayInventory(): CharacterInventoryDocument | null {
    return lastInventory;
}

/** Atualiza HUD com snapshot autoritativo (ex.: autoloot via WebSocket). */
export function applyPlayInventorySnapshot(inventory: CharacterInventoryDocument): void {
    applyInventoryToHud(inventory);
    setInventoryMessage(false, null);
}
