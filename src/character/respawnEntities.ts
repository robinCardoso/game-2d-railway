import { ENGINE_CONFIG } from '../engine/config';
import type { CreatureSpawn } from '../engine/types';
import { getCreaturePreset } from '../editor/creaturePresets';
import { resolveCreatureCombatStats } from '../game/creatureCombatStats';
import { createCreatureConfigForSpawn } from './creatureConfigs';
import { GameEntity } from './entity';

export interface RespawnEntitiesOptions {
    spawns: CreatureSpawn[];
    npcs: GameEntity[];
    mapSize: number;
    tileSize?: number;
}

/** Reconstrói entidades ativas a partir dos spawns pintados no mapa. */
export function respawnEntitiesFromSpawns(options: RespawnEntitiesOptions): void {
    const { spawns, npcs, mapSize, tileSize = ENGINE_CONFIG.TILE_SIZE } = options;
    npcs.length = 0;

    spawns.forEach((spawn) => {
        if (
            !Number.isFinite(spawn.x) ||
            !Number.isFinite(spawn.y) ||
            !Number.isFinite(spawn.z) ||
            spawn.x < 0 ||
            spawn.y < 0 ||
            spawn.x >= mapSize ||
            spawn.y >= mapSize ||
            spawn.z < ENGINE_CONFIG.MIN_FLOOR_Z ||
            spawn.z > ENGINE_CONFIG.MAX_FLOOR_Z
        ) {
            return;
        }

        const config = createCreatureConfigForSpawn(spawn.name);
        const entity = new GameEntity(
            spawn.id,
            spawn.name,
            config,
            spawn.x,
            spawn.y,
            spawn.z,
            spawn.type === 'monster' ? 5 : 3,
            spawn.type,
            tileSize
        );
        if (spawn.type === 'monster') {
            const preset = getCreaturePreset(spawn.name);
            entity.initCombatStats(resolveCreatureCombatStats(preset));
        }
        npcs.push(entity);
    });
}
