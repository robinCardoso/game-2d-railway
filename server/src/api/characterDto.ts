import type { CharacterDbRow } from '../db/repositories/characters.repo.js';

const DEFAULT_GAME_ID = 'default';
const DEFAULT_MAP_ID = 'rookgaard';

export function characterToApi(row: CharacterDbRow) {
    const config = (row.outfit_config ?? {}) as Record<string, unknown>;
    const vocation = row.vocation_id || (config.vocation as string) || 'knight';
    const gender = row.gender || (config.gender as string) || 'male';
    const spriteSheetUrl =
        row.sprite_sheet_url ||
        (config.spriteSheetUrl as string) ||
        `tiles/characters/vocations/${gender}/${vocation}.png`;

    const appearance = (config.appearance as Record<string, unknown>) ?? {
        gender,
        outfitId: row.outfit_id || `default_${vocation}_${gender}`,
        spriteSheetUrl,
    };

    return {
        id: row.id,
        accountId: row.account_id,
        name: row.name,
        outfitConfig: row.outfit_config,
        spawnMapId: row.spawn_map_id,
        createdAt: row.created_at,
        lastPlayedAt: row.last_played_at,
        deletedAt: row.deleted_at,
        vocation,
        level: row.level ?? (config.level as number) ?? 1,
        experience: Number(row.experience ?? (config.experience as number) ?? 0),
        gender: row.gender,
        appearance,
        gameId: (config.gameId as string) ?? DEFAULT_GAME_ID,
        mapId: row.map_id || row.spawn_map_id || DEFAULT_MAP_ID,
        position: {
            x: row.position_x,
            y: row.position_y,
            z: row.position_z,
        },
        direction: row.direction,
    };
}
