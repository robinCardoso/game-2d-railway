import { apiFetch } from '../shared/apiFetch';
import { getItemCatalog } from '../game-data/itemCatalog';
import {
    normalizeInventoryForStackRules,
    type CharacterInventoryDocument,
} from '../../shared/inventory';

export async function fetchCharacterInventory(
    characterId: string
): Promise<CharacterInventoryDocument> {
    const res = await apiFetch(`/api/characters/${encodeURIComponent(characterId)}/inventory`);
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Falha ao carregar inventário (${res.status}).`);
    }
    const data = (await res.json()) as { inventory: CharacterInventoryDocument };
    return normalizeInventoryForStackRules(data.inventory, getItemCatalog()).inventory;
}

export async function saveCharacterInventory(
    characterId: string,
    inventory: CharacterInventoryDocument
): Promise<CharacterInventoryDocument> {
    const res = await apiFetch(`/api/characters/${encodeURIComponent(characterId)}/inventory`, {
        method: 'PUT',
        body: JSON.stringify(inventory),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            details?: string[];
        };
        const detail = body.details?.length ? `: ${body.details.join('; ')}` : '';
        throw new Error((body.error ?? `Falha ao salvar inventário (${res.status}).`) + detail);
    }
    const data = (await res.json()) as { inventory: CharacterInventoryDocument };
    return normalizeInventoryForStackRules(data.inventory, getItemCatalog()).inventory;
}
