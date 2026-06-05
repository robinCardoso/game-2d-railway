import {
    computeCreatureDrawScale,
    getCreatureConfigForSpawn,
    getCreaturePreset,
} from '../editor/creaturePresets';
import type { CharacterSpriteConfig } from './spriteAnimation';
import { createDefaultCharacterConfig } from './characterSerializer';

export type { CreatureVisualSize, CreaturePreset } from '../editor/creaturePresets';

/** Monta config de sprite para um spawn do mapa (via creature_presets.json). */
export function createCreatureConfigForSpawn(spawnName: string): CharacterSpriteConfig {
    const cached = getCreatureConfigForSpawn(spawnName);
    if (cached) {
        const config = { ...cached, name: spawnName };
        const preset = getCreaturePreset(spawnName);
        if (preset?.visualSize) {
            config.drawScale = computeCreatureDrawScale(
                config.frameWidth,
                config.frameHeight,
                preset.visualSize
            );
        }
        return config;
    }

    const config = createDefaultCharacterConfig();
    config.name = spawnName;
    return config;
}
