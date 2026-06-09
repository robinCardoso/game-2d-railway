import { BACKPACK_SLOT_COUNT } from '../../../shared/inventory';
import type { CharacterInventoryDocument } from '../../../shared/inventory';
import type { EquipmentSlot } from '../../game-data/itemCatalogTypes';
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

function renderEquipment(equipment: CharacterInventoryDocument['equipment']): void {
    document.querySelectorAll<HTMLButtonElement>('.equipment-slot').forEach((slot) => {
        const key = slot.dataset.slot as EquipmentSlot | undefined;
        if (!key) return;
        const itemId = equipment[key];
        const label = slot.querySelector('.equipment-slot__label');
        let itemEl = slot.querySelector('.equipment-slot__item');
        if (!itemEl) {
            itemEl = document.createElement('span');
            itemEl.className = 'equipment-slot__item';
            slot.appendChild(itemEl);
        }
        if (!label) {
            const span = document.createElement('span');
            span.className = 'equipment-slot__label';
            span.textContent = SLOT_LABELS[key];
            slot.prepend(span);
        }
        if (itemId) {
            slot.classList.add('has-item');
            itemEl.textContent = itemId;
        } else {
            slot.classList.remove('has-item');
            itemEl.textContent = '';
        }
    });
}

function renderBackpack(backpack: CharacterInventoryDocument['backpack']): void {
    ensureBagGrid();
    const byIndex = new Map(backpack.map((row) => [row.slotIndex, row]));
    document.querySelectorAll<HTMLButtonElement>('.bag-slot').forEach((slot) => {
        const index = Number(slot.dataset.slotIndex);
        const row = byIndex.get(index);
        slot.classList.toggle('has-item', Boolean(row));
        if (row) {
            slot.textContent = '';
            const name = document.createElement('span');
            name.textContent = row.itemId;
            const qty = document.createElement('span');
            qty.className = 'bag-slot__qty';
            qty.textContent = row.quantity > 1 ? `×${row.quantity}` : '';
            slot.appendChild(name);
            if (row.quantity > 1) slot.appendChild(qty);
        } else {
            slot.textContent = '';
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
