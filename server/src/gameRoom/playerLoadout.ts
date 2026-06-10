import {
    calculateEquipmentAttackBonus,
    calculateEquipmentDefenseBonus,
} from '../../../shared/equipmentBonuses.js';
import { computeEligibleSpellIds } from '../../../shared/characterSpells.js';
import {
    resolveSpellBarOrDefaults,
    validateCharacterSpellBar,
} from '../../../shared/spellSlots.js';
import type { VocationId } from '../../../shared/types/character.js';
import { syncEligibleLearnedSpells } from '../db/repositories/characterSpells.repo.js';
import { getCharacterInventory } from '../db/repositories/inventory.repo.js';
import {
    getCharacterSpellSlots,
    replaceCharacterSpellSlots,
} from '../db/repositories/spellSlots.repo.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { getDevCharacterInventory } from '../game/devInventoryStore.js';
import { loadServerItemCatalog } from '../game/itemCatalogStore.js';
import { loadServerSpellCatalog } from '../game/serverSpellCatalog.js';
import type { ConnectedPlayer } from './types.js';

export function resolvePlayerEquipmentBonuses(player: ConnectedPlayer): {
    attackBonus: number;
    defenseBonus: number;
} {
    const catalog = loadServerItemCatalog();
    return {
        attackBonus: calculateEquipmentAttackBonus(player.equipment, catalog),
        defenseBonus: calculateEquipmentDefenseBonus(player.equipment, catalog),
    };
}

export async function hydratePlayerEquipment(player: ConnectedPlayer): Promise<void> {
    if (!player.characterId) return;

    if (!isDatabaseConfigured()) {
        const inventory = getDevCharacterInventory(player.characterId);
        player.equipment = inventory.equipment;
        return;
    }

    if (!player.accountId) return;
    try {
        const inventory = await getCharacterInventory(player.characterId, player.accountId);
        if (inventory) {
            player.equipment = inventory.equipment;
        }
    } catch (err) {
        console.warn(
            `[GameRoom] falha ao carregar equipamento de ${player.characterId}:`,
            err
        );
    }
}

export async function syncPlayerLearnedSpells(player: ConnectedPlayer): Promise<void> {
    const vocationId = (player.appearance.vocationId || 'knight') as VocationId;
    const catalog = loadServerSpellCatalog();
    if (!isDatabaseConfigured() || !player.characterId || !player.accountId) {
        player.learnedSpellIds = computeEligibleSpellIds(catalog, vocationId, player.level);
        return;
    }
    try {
        const learned = await syncEligibleLearnedSpells(
            player.characterId,
            player.accountId,
            vocationId,
            player.level,
            catalog
        );
        player.learnedSpellIds = learned ?? computeEligibleSpellIds(catalog, vocationId, player.level);
    } catch (err) {
        console.warn(
            `[GameRoom] falha ao sincronizar magias aprendidas de ${player.characterId}:`,
            err
        );
        player.learnedSpellIds = computeEligibleSpellIds(catalog, vocationId, player.level);
    }
}

export async function hydratePlayerSpellBar(player: ConnectedPlayer): Promise<void> {
    if (!player.characterId || !player.accountId) return;
    const vocationId = (player.appearance.vocationId || 'knight') as VocationId;
    await syncPlayerLearnedSpells(player);
    if (!isDatabaseConfigured()) {
        player.spellBar = resolveSpellBarOrDefaults({}, vocationId);
        return;
    }
    try {
        const stored =
            (await getCharacterSpellSlots(player.characterId, player.accountId)) ?? {};
        const bar = resolveSpellBarOrDefaults(stored, vocationId);
        player.spellBar = bar;

        if (!stored.slot1 && !stored.slot2 && !stored.slot3) {
            const catalog = loadServerSpellCatalog();
            const validated = validateCharacterSpellBar(bar, catalog, {
                vocationId,
                level: player.level,
                learnedSpellIds: player.learnedSpellIds,
            });
            if (validated.ok) {
                await replaceCharacterSpellSlots(
                    player.characterId,
                    player.accountId,
                    validated.value
                );
            }
        }
    } catch (err) {
        console.warn(
            `[GameRoom] falha ao carregar spell bar de ${player.characterId}:`,
            err
        );
        player.spellBar = resolveSpellBarOrDefaults({}, vocationId);
    }
}
