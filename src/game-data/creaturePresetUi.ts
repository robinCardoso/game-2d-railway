import type { CreaturePresetEntry } from './mobPresetTypes';

export const CREATURE_PRESETS_UPDATED = 'game:creature-presets-updated';

export function dispatchCreaturePresetsUpdated(presets?: CreaturePresetEntry[]): void {
    window.dispatchEvent(
        new CustomEvent(CREATURE_PRESETS_UPDATED, { detail: { presets } })
    );
}
