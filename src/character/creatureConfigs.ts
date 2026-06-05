import {
    getCreatureConfigForSpawn,
} from '../editor/creaturePresets';
import type { CharacterSpriteConfig } from './spriteAnimation';
import { createDefaultCharacterConfig } from './characterSerializer';

export type { CreatureVisualSize, CreaturePreset } from '../editor/creaturePresets';

/** Monta config de sprite para um spawn do mapa (via creature_presets.json). */
export function createCreatureConfigForSpawn(spawnName: string): CharacterSpriteConfig {
    const cached = getCreatureConfigForSpawn(spawnName);
    if (cached) {
        return { ...cached, name: spawnName };
    }

    const config = createDefaultCharacterConfig();
    config.name = spawnName;
    return config;
}
