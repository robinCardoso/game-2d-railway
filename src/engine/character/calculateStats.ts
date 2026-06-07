import { CharacterStats } from '../../../shared/types/character.js';
import type { VocationAttackProfileConfig } from '../../../shared/playerAttack.js';

export interface VocationConfig {
  readonly name: string;
  readonly baseStats: CharacterStats;
  readonly growthPerLevel: {
    readonly melee: number;
    readonly magicAttack: number;
    readonly distanceAttack: number;
    readonly defense: number;
    readonly health: number;
    readonly mana: number;
  };
  /** Tipo e alcance de ataque — editável no Studio (Gerenciar Vocações). */
  readonly attackProfile?: VocationAttackProfileConfig;
}

/**
 * Calculates level based on accumulated experience.
 */
export function getLevelFromExp(exp: number): number {
  if (exp < 0) return 1;
  return Math.floor(Math.sqrt(exp / 100)) + 1;
}

/**
 * Calculates required experience to reach a specific level.
 */
export function getExpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

/**
 * Calculates character stats at a given level for any Vocation configuration.
 */
export function calculateStatsForLevel(vocation: VocationConfig, level: number): CharacterStats {
  const levelsGrown = Math.max(0, level - 1);

  return {
    melee: Math.round((vocation.baseStats.melee + vocation.growthPerLevel.melee * levelsGrown) * 10) / 10,
    magicAttack: Math.round((vocation.baseStats.magicAttack + vocation.growthPerLevel.magicAttack * levelsGrown) * 10) / 10,
    distanceAttack: Math.round((vocation.baseStats.distanceAttack + vocation.growthPerLevel.distanceAttack * levelsGrown) * 10) / 10,
    defense: Math.round((vocation.baseStats.defense + vocation.growthPerLevel.defense * levelsGrown) * 10) / 10,
    attackSpeed: vocation.baseStats.attackSpeed,
    defenseAttack: vocation.baseStats.defenseAttack,
    health: Math.round(vocation.baseStats.health + vocation.growthPerLevel.health * levelsGrown),
    mana: Math.round(vocation.baseStats.mana + vocation.growthPerLevel.mana * levelsGrown),
  };
}
