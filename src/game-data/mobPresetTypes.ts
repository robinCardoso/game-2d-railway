/** Tipos compartilhados entre Studio, Play e servidor para stats de criaturas. */

export type CreatureVisualSize = 'tiny' | 'small' | 'medium' | 'large' | 'boss';

export const MOB_RACES = [
    'humanoid',
    'beast',
    'undead',
    'demon',
    'dragon',
    'elemental',
    'plant',
    'construct',
    'aquatic',
    'other',
] as const;

export type MobRace = (typeof MOB_RACES)[number];

export interface MobLootEntry {
    itemId: string;
    /** Chance de drop em percentual (0–100). */
    chance: number;
}

export interface CreaturePresetEntry {
    name: string;
    type: 'monster' | 'npc';
    configPath: string;
    description?: string;
    color?: string;
    visualSize?: CreatureVisualSize;
    maxHealth?: number;
    defense?: number;
    attack?: number;
    attackSpeed?: number;
    xpReward?: number;
    race?: MobRace;
    /** Persistido para loot futuro; gameplay ainda não consome. */
    loot?: MobLootEntry[];
}

const VALID_VISUAL_SIZES = new Set<CreatureVisualSize>([
    'tiny', 'small', 'medium', 'large', 'boss',
]);

const VALID_RACES = new Set<MobRace>(MOB_RACES);

function coerceOptionalPositiveInt(value: unknown): number | undefined {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
}

function coerceOptionalNonNegativeInt(value: unknown): number | undefined {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
}

function parseVisualSize(value: unknown): CreatureVisualSize | undefined {
    if (typeof value === 'string' && VALID_VISUAL_SIZES.has(value as CreatureVisualSize)) {
        return value as CreatureVisualSize;
    }
    return undefined;
}

function parseRace(value: unknown): MobRace | undefined {
    if (typeof value === 'string' && VALID_RACES.has(value as MobRace)) {
        return value as MobRace;
    }
    return undefined;
}

function sanitizeLoot(raw: unknown): MobLootEntry[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const entries: MobLootEntry[] = [];
    for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const itemId = typeof (row as { itemId?: unknown }).itemId === 'string'
            ? (row as { itemId: string }).itemId.trim()
            : '';
        if (!itemId) continue;
        const chanceRaw = (row as { chance?: unknown }).chance;
        const chance = typeof chanceRaw === 'number' ? chanceRaw : Number(chanceRaw);
        if (!Number.isFinite(chance) || chance < 0 || chance > 100) continue;
        entries.push({ itemId, chance: Math.round(chance * 100) / 100 });
    }
    return entries.length > 0 ? entries : undefined;
}

/** Normaliza uma entrada de `creature_presets.json`. */
export function sanitizeCreaturePresetEntry(raw: unknown): CreaturePresetEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()) return null;
    if (row.type !== 'monster' && row.type !== 'npc') return null;

    let configPath = '';
    if (typeof row.configPath === 'string' && row.configPath.trim()) {
        configPath = row.configPath.trim().replace(/^\//, '');
    } else if (typeof row.outfitPresetName === 'string' && row.outfitPresetName.trim()) {
        configPath = `tiles/characters/${row.outfitPresetName.trim()}.json`;
    }
    if (!configPath) return null;

    const entry: CreaturePresetEntry = {
        name: row.name.trim(),
        type: row.type,
        configPath,
        description: typeof row.description === 'string' ? row.description : '',
        color: typeof row.color === 'string' ? row.color : undefined,
        visualSize: parseVisualSize(row.visualSize),
        maxHealth: coerceOptionalPositiveInt(row.maxHealth),
        defense: coerceOptionalNonNegativeInt(row.defense),
        attack: coerceOptionalPositiveInt(row.attack),
        attackSpeed: coerceOptionalPositiveInt(row.attackSpeed),
        xpReward: coerceOptionalPositiveInt(row.xpReward),
        race: parseRace(row.race),
        loot: sanitizeLoot(row.loot),
    };

    return entry;
}

export interface ResolvedMobCombatStats {
    maxHealth: number;
    defense: number;
    attack: number;
    attackSpeed: number;
    xpReward: number;
    race: MobRace;
    loot: MobLootEntry[];
}

const DEFAULTS_BY_SIZE: Record<
    CreatureVisualSize,
    Omit<ResolvedMobCombatStats, 'loot'>
> = {
    tiny: { maxHealth: 15, defense: 2, attack: 5, attackSpeed: 2000, xpReward: 10, race: 'beast' },
    small: { maxHealth: 30, defense: 4, attack: 10, attackSpeed: 1800, xpReward: 25, race: 'beast' },
    medium: { maxHealth: 60, defense: 6, attack: 20, attackSpeed: 1600, xpReward: 50, race: 'beast' },
    large: { maxHealth: 120, defense: 10, attack: 35, attackSpeed: 1400, xpReward: 100, race: 'beast' },
    boss: { maxHealth: 300, defense: 15, attack: 50, attackSpeed: 1200, xpReward: 500, race: 'beast' },
};

const FALLBACK = DEFAULTS_BY_SIZE.medium;

function resolvePositive(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    return Math.max(1, Math.floor(value));
}

function resolveNonNegative(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    return Math.max(0, Math.floor(value));
}

export function resolveMobCombatStats(preset: CreaturePresetEntry | undefined): ResolvedMobCombatStats {
    const base = preset?.visualSize ? DEFAULTS_BY_SIZE[preset.visualSize] : FALLBACK;
    return {
        maxHealth: resolvePositive(preset?.maxHealth, base.maxHealth),
        defense: resolveNonNegative(preset?.defense, base.defense),
        attack: resolvePositive(preset?.attack, base.attack),
        attackSpeed: resolvePositive(preset?.attackSpeed, base.attackSpeed),
        xpReward: resolvePositive(preset?.xpReward, base.xpReward),
        race: preset?.race ?? base.race,
        loot: preset?.loot ? [...preset.loot] : [],
    };
}

/** Valores efetivos para preencher o formulário (mescla preset + defaults). */
export function getMobStatsFormDefaults(preset: CreaturePresetEntry): ResolvedMobCombatStats {
    return resolveMobCombatStats(preset);
}
