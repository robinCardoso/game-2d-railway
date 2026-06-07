import { getPool } from '../pool.js';

export interface CharacterDbRow {
    id: string;
    account_id: string;
    name: string;
    vocation_id: string;
    gender: 'male' | 'female';
    outfit_id: string;
    sprite_sheet_url: string;
    level: number;
    experience: string;
    map_id: string;
    position_x: number;
    position_y: number;
    position_z: number;
    direction: 'north' | 'south' | 'east' | 'west';
    outfit_config: Record<string, unknown>;
    spawn_map_id: string;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    last_played_at: string | null;
    health: number | null;
}

const SELECT_FIELDS = `
  id, account_id, name, vocation_id, gender, outfit_id, sprite_sheet_url,
  level, experience, map_id, position_x, position_y, position_z, direction,
  outfit_config, spawn_map_id, deleted_at, created_at, updated_at, last_played_at, health
`;

export async function listCharactersByAccount(accountId: string): Promise<CharacterDbRow[]> {
    const pool = getPool();
    const { rows } = await pool.query<CharacterDbRow>(
        `select ${SELECT_FIELDS} from characters
         where account_id = $1 and deleted_at is null
         order by last_played_at desc nulls last, created_at desc`,
        [accountId]
    );
    return rows;
}

export async function getCharacterForAccount(
    characterId: string,
    accountId: string
): Promise<CharacterDbRow | null> {
    const pool = getPool();
    const { rows } = await pool.query<CharacterDbRow>(
        `select ${SELECT_FIELDS} from characters
         where id = $1 and account_id = $2 and deleted_at is null`,
        [characterId, accountId]
    );
    return rows[0] ?? null;
}

export async function countCharactersByAccount(accountId: string): Promise<number> {
    const pool = getPool();
    const { rows } = await pool.query<{ count: string }>(
        `select count(*)::text as count from characters where account_id = $1 and deleted_at is null`,
        [accountId]
    );
    return Number(rows[0]?.count ?? 0);
}

export async function isCharacterNameTaken(name: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query<{ exists: boolean }>(
        `select exists(
           select 1 from characters where lower(name) = lower($1) and deleted_at is null
         ) as exists`,
        [name.trim()]
    );
    return rows[0]?.exists === true;
}

export interface CreateCharacterInput {
    accountId: string;
    name: string;
    vocationId: string;
    gender: 'male' | 'female';
    outfitId: string;
    spriteSheetUrl: string;
    spawnMapId: string;
    outfitConfig: Record<string, unknown>;
    mapId: string;
    positionX: number;
    positionY: number;
    positionZ: number;
    direction: 'north' | 'south' | 'east' | 'west';
}

export async function createCharacter(input: CreateCharacterInput): Promise<CharacterDbRow> {
    const pool = getPool();
    const { rows } = await pool.query<CharacterDbRow>(
        `insert into characters (
           account_id, name, vocation_id, gender, outfit_id, sprite_sheet_url,
           outfit_config, spawn_map_id, map_id, position_x, position_y, position_z, direction
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning ${SELECT_FIELDS}`,
        [
            input.accountId,
            input.name.trim(),
            input.vocationId,
            input.gender,
            input.outfitId,
            input.spriteSheetUrl,
            JSON.stringify(input.outfitConfig),
            input.spawnMapId,
            input.mapId,
            input.positionX,
            input.positionY,
            input.positionZ,
            input.direction,
        ]
    );
    return rows[0];
}

export async function softDeleteCharacter(characterId: string, accountId: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query(
        `update characters set deleted_at = now(), updated_at = now()
         where id = $1 and account_id = $2 and deleted_at is null`,
        [characterId, accountId]
    );
    return (rowCount ?? 0) > 0;
}

export async function markCharacterPlayed(characterId: string, accountId: string): Promise<boolean> {
    const pool = getPool();
    const { rowCount } = await pool.query(
        `update characters set last_played_at = now(), updated_at = now()
         where id = $1 and account_id = $2 and deleted_at is null`,
        [characterId, accountId]
    );
    return (rowCount ?? 0) > 0;
}

export async function updateCharacterLocation(
    characterId: string,
    accountId: string,
    location: {
        mapId: string;
        positionX: number;
        positionY: number;
        positionZ: number;
        direction: 'north' | 'south' | 'east' | 'west';
        health?: number;
    }
): Promise<CharacterDbRow | null> {
    const pool = getPool();
    const existing = await getCharacterForAccount(characterId, accountId);
    if (!existing) return null;

    const outfitConfig = {
        ...(existing.outfit_config ?? {}),
        mapId: location.mapId,
        position: { x: location.positionX, y: location.positionY, z: location.positionZ },
        direction: location.direction,
    };

    const { rows } = await pool.query<CharacterDbRow>(
        `update characters set
           map_id = $3,
           position_x = $4,
           position_y = $5,
           position_z = $6,
           direction = $7,
           outfit_config = $8,
           health = coalesce($9, health),
           updated_at = now()
         where id = $1 and account_id = $2 and deleted_at is null
         returning ${SELECT_FIELDS}`,
        [
            characterId,
            accountId,
            location.mapId,
            location.positionX,
            location.positionY,
            location.positionZ,
            location.direction,
            JSON.stringify(outfitConfig),
            location.health !== undefined ? location.health : null,
        ]
    );
    return rows[0] ?? null;
}

export async function updateCharacterProgress(
    characterId: string,
    accountId: string,
    progress: { level: number; experience: number }
): Promise<CharacterDbRow | null> {
    const pool = getPool();
    const existing = await getCharacterForAccount(characterId, accountId);
    if (!existing) return null;

    const safeLevel = Math.max(1, Math.floor(progress.level));
    const safeExperience = Math.max(0, Math.floor(progress.experience));
    const outfitConfig = {
        ...(existing.outfit_config ?? {}),
        level: safeLevel,
        experience: safeExperience,
    };

    const { rows } = await pool.query<CharacterDbRow>(
        `update characters set
           level = $3,
           experience = $4,
           outfit_config = $5,
           updated_at = now()
         where id = $1 and account_id = $2 and deleted_at is null
         returning ${SELECT_FIELDS}`,
        [
            characterId,
            accountId,
            safeLevel,
            String(safeExperience),
            JSON.stringify(outfitConfig),
        ]
    );
    return rows[0] ?? null;
}
