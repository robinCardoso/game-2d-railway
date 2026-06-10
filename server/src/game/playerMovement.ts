import { calculateEquipmentSpeedBonus } from '../../../shared/equipmentBonuses.js';
import type { CharacterEquipmentState } from '../../../shared/inventory.js';
import {
    resolveMovementSpeedWithStep,
    type CharacterSpeedState,
} from '../../../src/character/movementSpeed.js';
import { loadServerItemCatalog } from './itemCatalogStore.js';

/** Duração mínima de passo (ms) autorizada pelo servidor — inclui speedBonus de equipamento. */
export function resolveServerPlayerStepDurationMs(player: {
    level: number;
    equipment: CharacterEquipmentState;
}): number {
    const catalog = loadServerItemCatalog();
    const speedBonus = calculateEquipmentSpeedBonus(player.equipment, catalog);
    const state: CharacterSpeedState = {
        baseSpeed: 1,
        level: Math.max(1, player.level),
        equipmentBonus: speedBonus,
    };
    return resolveMovementSpeedWithStep(state, 'Player').stepDurationMs;
}
