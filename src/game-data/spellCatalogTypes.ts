export type SpellGroup = 'attack' | 'healing' | 'support';

export type SpellDamageType = 'magic' | 'melee' | 'healing';

export interface SpellDamageConfig {
    type: SpellDamageType;
    multiplier: number;
    formula?: 'level_magic';
}

export interface SpellDefinition {
    id: string;
    name: string;
    description: string;
    words?: string;
    group: SpellGroup;
    icon: string;
    manaCost: number;
    cooldownMs: number;
    groupCooldownMs: number;
    minLevel: number;
    minMagicLevel?: number;
    vocations: string[];
    range: number;
    requiresTarget: boolean;
    requiresLineOfSight?: boolean;
    damage?: SpellDamageConfig;
    castEffect?: string;
    implemented: boolean;
}

export interface SpellCatalogDocument {
    spells: SpellDefinition[];
}

export function sanitizeSpellCatalogDocument(raw: unknown): SpellCatalogDocument {
    if (!raw || typeof raw !== 'object') return { spells: [] };
    const spellsRaw = (raw as { spells?: unknown }).spells;
    if (!Array.isArray(spellsRaw)) return { spells: [] };

    const spells: SpellDefinition[] = [];
    for (const entry of spellsRaw) {
        if (!entry || typeof entry !== 'object') continue;
        const row = entry as Record<string, unknown>;
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        if (!id || !name) continue;

        const group =
            row.group === 'healing' || row.group === 'support' ? row.group : 'attack';

        spells.push({
            id,
            name,
            description: typeof row.description === 'string' ? row.description : '',
            words: typeof row.words === 'string' ? row.words : undefined,
            group,
            icon: typeof row.icon === 'string' ? row.icon : '/ui/play-hud/combat/slot_empty.svg',
            manaCost: Math.max(0, Number(row.manaCost) || 0),
            cooldownMs: Math.max(0, Number(row.cooldownMs) || 1000),
            groupCooldownMs: Math.max(0, Number(row.groupCooldownMs) || 1000),
            minLevel: Math.max(1, Number(row.minLevel) || 1),
            minMagicLevel:
                row.minMagicLevel !== undefined ? Math.max(0, Number(row.minMagicLevel) || 0) : undefined,
            vocations: Array.isArray(row.vocations)
                ? row.vocations.filter((v): v is string => typeof v === 'string')
                : [],
            range: Math.max(1, Math.min(15, Number(row.range) || 1)),
            requiresTarget: row.requiresTarget !== false,
            requiresLineOfSight: row.requiresLineOfSight === true,
            damage:
                row.damage && typeof row.damage === 'object'
                    ? {
                          type:
                              (row.damage as SpellDamageConfig).type === 'melee' ||
                              (row.damage as SpellDamageConfig).type === 'healing'
                                  ? (row.damage as SpellDamageConfig).type
                                  : 'magic',
                          multiplier: Math.max(0, Number((row.damage as SpellDamageConfig).multiplier) || 1),
                          formula:
                              (row.damage as SpellDamageConfig).formula === 'level_magic'
                                  ? 'level_magic'
                                  : undefined,
                      }
                    : undefined,
            castEffect: typeof row.castEffect === 'string' ? row.castEffect : undefined,
            implemented: row.implemented === true,
        });
    }

    return { spells };
}
