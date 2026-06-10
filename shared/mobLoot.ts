import type { MobLootEntry } from '../src/game-data/mobPresetTypes.js';

/** Política A: roll completo por jogador elegível (sem escala de grupo). Ver docs/loot-system.md */
export const LOOT_GROUP_ECONOMY_POLICY = 'full_roll_per_player' as const;

export interface LootGrant {
    itemId: string;
    quantity: number;
}

export interface RollMobLootOptions {
    /** RNG em [0, 1). Padrão: Math.random. */
    random?: () => number;
}

function resolveLootQuantity(entry: MobLootEntry): number {
    const raw = entry.quantity;
    if (raw === undefined || raw === null) return 1;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
}

/** Rola a tabela de loot do mob — cada entrada é independente (chance 0–100%). */
export function rollMobLoot(
    lootTable: MobLootEntry[] | undefined,
    options?: RollMobLootOptions
): LootGrant[] {
    if (!lootTable?.length) return [];

    const random = options?.random ?? Math.random;
    const grants: LootGrant[] = [];

    for (const entry of lootTable) {
        const itemId = entry.itemId?.trim();
        if (!itemId) continue;
        const chance = entry.chance;
        if (!Number.isFinite(chance) || chance <= 0) continue;
        if (chance >= 100 || random() * 100 < chance) {
            grants.push({ itemId, quantity: resolveLootQuantity(entry) });
        }
    }

    return grants;
}
