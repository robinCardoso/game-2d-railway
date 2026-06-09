import { BACKPACK_SLOT_COUNT } from '../../../shared/inventory';
import type { CharacterInventoryDocument } from '../../../shared/inventory';
import type { EquipmentSlot } from '../../game-data/itemCatalogTypes';
import { getItemCatalogEntry } from '../../game-data/itemCatalog';
import { drawItemIconFrame, fetchItemIconImage } from '../../game-data/itemIconRegistry';
import { fetchCharacterInventory } from '../characterInventoryApi';
import { onPlayPanelOpen } from './playHudPanels';

const SLOT_LABELS: Record<EquipmentSlot, string> = {
    head: 'Cabeça',
    body: 'Corpo',
    legs: 'Pernas',
    feet: 'Pés',
    ring: 'Anel',
    amulet: 'Amuleto',
};

const ICON_SIZE = 28;

let activeCharacterId: string | null = null;
let lastInventory: CharacterInventoryDocument | null = null;
let bagGridReady = false;

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
        btn.disabled = true;
        grid.appendChild(btn);
    }
    bagGridReady = true;
}

function ensureSlotIconCanvas(container: HTMLElement): HTMLCanvasElement {
    let canvas = container.querySelector('canvas.item-slot-icon') as HTMLCanvasElement | null;
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'item-slot-icon';
        canvas.width = ICON_SIZE;
        canvas.height = ICON_SIZE;
        container.appendChild(canvas);
    }
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

async function paintItemInSlot(container: HTMLElement, itemId: string, textClass: string): Promise<void> {
    const entry = getItemCatalogEntry(itemId);
    const canvas = ensureSlotIconCanvas(container);
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

    drawItemIconFrame(ctx, img, entry.sprite, 0, 0, ICON_SIZE);
    canvas.hidden = false;
    textEl.hidden = true;
    textEl.textContent = '';
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

function renderEquipment(equipment: CharacterInventoryDocument['equipment']): void {
    document.querySelectorAll<HTMLButtonElement>('.equipment-slot').forEach((slot) => {
        const key = slot.dataset.slot as EquipmentSlot | undefined;
        if (!key) return;
        const itemId = equipment[key];
        const label = slot.querySelector('.equipment-slot__label');
        if (!label) {
            const span = document.createElement('span');
            span.className = 'equipment-slot__label';
            span.textContent = SLOT_LABELS[key];
            slot.prepend(span);
        }
        if (itemId) {
            slot.classList.add('has-item');
            void paintItemInSlot(slot, itemId, 'equipment-slot__item');
        } else {
            slot.classList.remove('has-item');
            clearSlotVisual(slot, 'equipment-slot__item');
        }
    });
}

function renderBackpack(backpack: CharacterInventoryDocument['backpack']): void {
    ensureBagGrid();
    const byIndex = new Map(backpack.map((row) => [row.slotIndex, row]));
    document.querySelectorAll<HTMLButtonElement>('.bag-slot').forEach((slot) => {
        const index = Number(slot.dataset.slotIndex);
        const row = byIndex.get(index);
        slot.replaceChildren();
        slot.classList.toggle('has-item', Boolean(row));
        if (row) {
            void paintItemInSlot(slot, row.itemId, 'bag-slot__name');
            if (row.quantity > 1) {
                const qty = document.createElement('span');
                qty.className = 'bag-slot__qty';
                qty.textContent = `×${row.quantity}`;
                slot.appendChild(qty);
            }
        } else {
            clearSlotVisual(slot, 'bag-slot__name');
        }
    });

    const capEl = document.getElementById('inventoryCapacity');
    if (capEl) {
        capEl.textContent = `${backpack.length} / ${BACKPACK_SLOT_COUNT}`;
    }
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

export async function refreshPlayHudInventory(): Promise<void> {
    if (!activeCharacterId) return;
    setInventoryMessage(true, null);
    try {
        const inventory = await fetchCharacterInventory(activeCharacterId);
        lastInventory = inventory;
        renderEquipment(inventory.equipment);
        renderBackpack(inventory.backpack);
        setInventoryMessage(false, null);
    } catch (err) {
        setInventoryMessage(false, err instanceof Error ? err.message : 'Falha ao carregar inventário.');
    }
}

export function initPlayHudInventory(characterId: string): void {
    activeCharacterId = characterId;
    ensureBagGrid();

    const goldEl = document.getElementById('inventoryGold');
    if (goldEl) goldEl.textContent = '—';

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
