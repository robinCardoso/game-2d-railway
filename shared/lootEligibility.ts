import { isTileInSpectatorRange, type SpectatorTile } from './creatureSpectatorRange.js';

/** Dano mínimo (% do maxHealth do mob) para receber loot/XP em kill compartilhado. */
export const LOOT_MIN_DAMAGE_SHARE_PERCENT = 5;

export interface LootEligiblePlayer {
    playerId: string;
    tileX: number;
    tileY: number;
    z: number;
    health: number;
}

export interface CreatureKillEligibilityContext {
    creatureTile: SpectatorTile;
    maxHealth: number;
    damageByPlayer: ReadonlyMap<string, number> | Record<string, number>;
}

function readDamage(
    damageByPlayer: ReadonlyMap<string, number> | Record<string, number>,
    playerId: string
): number {
    if (damageByPlayer instanceof Map) {
        return damageByPlayer.get(playerId) ?? 0;
    }
    const record = damageByPlayer as Record<string, number>;
    return Object.prototype.hasOwnProperty.call(record, playerId) ? record[playerId] : 0;
}

function meetsMinDamageShare(damage: number, maxHealth: number): boolean {
    if (maxHealth <= 0) return damage > 0;
    const minDamage = (maxHealth * LOOT_MIN_DAMAGE_SHARE_PERCENT) / 100;
    return damage >= minDamage;
}

/**
 * Jogadores que recebem XP + loot pessoal na morte do mob.
 * Ordem estável: maior dano primeiro, depois playerId.
 */
export function resolveLootEligiblePlayerIds(
    players: readonly LootEligiblePlayer[],
    ctx: CreatureKillEligibilityContext
): string[] {
    const eligible: { playerId: string; damage: number }[] = [];

    for (const player of players) {
        if (player.health <= 0) continue;

        const damage = readDamage(ctx.damageByPlayer, player.playerId);
        if (damage <= 0) continue;
        if (!meetsMinDamageShare(damage, ctx.maxHealth)) continue;

        if (
            !isTileInSpectatorRange(
                { tileX: player.tileX, tileY: player.tileY, z: player.z },
                ctx.creatureTile
            )
        ) {
            continue;
        }

        eligible.push({ playerId: player.playerId, damage });
    }

    eligible.sort((a, b) => b.damage - a.damage || a.playerId.localeCompare(b.playerId));
    return eligible.map((row) => row.playerId);
}
