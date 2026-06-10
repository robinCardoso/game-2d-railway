import { calculateStatsForLevel } from '../../../src/engine/character/calculateStats.js';
import type { VocationId } from '../../../shared/types/character.js';
import type { VocationStore } from '../game/VocationStore.js';
import type { ConnectedPlayer, PlayerResourcesSnapshot } from './types.js';

export function snapshotPlayerResources(player: ConnectedPlayer): PlayerResourcesSnapshot {
    return {
        health: player.health,
        maxHealth: player.maxHealth,
        mana: player.mana,
        maxMana: player.maxMana,
    };
}

export function playerResourcesChanged(
    prev: PlayerResourcesSnapshot | undefined,
    next: PlayerResourcesSnapshot
): boolean {
    if (!prev) return true;
    return (
        prev.health !== next.health ||
        prev.maxHealth !== next.maxHealth ||
        prev.mana !== next.mana ||
        prev.maxMana !== next.maxMana
    );
}

export function recalcPlayerMaxStats(
    player: ConnectedPlayer,
    vocations: VocationStore
): void {
    const vocationId = (player.appearance.vocationId || 'knight') as VocationId;
    const vocationConfig = vocations.get(vocationId);
    const stats = vocationConfig
        ? calculateStatsForLevel(vocationConfig, player.level)
        : { health: 100, mana: 50 };
    player.maxHealth = stats.health;
    player.maxMana = stats.mana;
    player.mana = Math.min(player.mana, player.maxMana);
    player.health = Math.min(player.health, player.maxHealth);
}
