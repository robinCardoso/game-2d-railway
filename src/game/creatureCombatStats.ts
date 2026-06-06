import type { CreaturePreset } from '../editor/creaturePresets';
import {
    resolveMobCombatStats,
    type MobLootEntry,
    type MobRace,
    type ResolvedMobCombatStats,
} from '../game-data/mobPresetTypes';

export type CreatureCombatStats = ResolvedMobCombatStats;
export type { MobLootEntry, MobRace };

export function resolveCreatureCombatStats(preset: CreaturePreset | undefined): CreatureCombatStats {
    return resolveMobCombatStats(preset);
}
