import { VocationId } from '../../../shared/types/character.js';
import { calculateStatsForLevel, VocationConfig } from '../../../src/engine/character/calculateStats.js';
import { calculateMeleeDamage, calculateDistanceDamage, calculateMagicDamage } from '../../../src/engine/combat/calculateDamage.js';

export interface CombatTarget {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  defense: number;
}

export interface CombatAttacker {
  id: string;
  name: string;
  vocation: VocationId;
  level: number;
}

export interface DamageResult {
  rawDamage: number;
  blockedDamage: number;
  finalDamage: number;
  isDead: boolean;
}

/**
 * Validates and executes combat damage on the server.
 */
export function processAttack(
  attacker: CombatAttacker,
  target: CombatTarget,
  attackType: 'melee' | 'distance' | 'magic',
  vocationConfig: VocationConfig,
  spellMultiplier: number = 1.0
): DamageResult {
  // 1. Calculate the attacker's server-authoritative stats for their level using the passed configuration
  const stats = calculateStatsForLevel(vocationConfig, attacker.level);

  let damageResult;
  if (attackType === 'melee') {
    damageResult = calculateMeleeDamage(stats.melee, target.defense);
  } else if (attackType === 'distance') {
    damageResult = calculateDistanceDamage(stats.distanceAttack, target.defense);
  } else {
    damageResult = calculateMagicDamage(stats.magicAttack, spellMultiplier);
  }

  const rawDamage = damageResult.max; // Use maximum possible as upper bound check or roll
  const finalDamage = damageResult.actual;
  const blockedDamage = Math.max(0, rawDamage - finalDamage);

  const remainingHealth = Math.max(0, target.health - finalDamage);

  return {
    rawDamage,
    blockedDamage,
    finalDamage,
    isDead: remainingHealth <= 0,
  };
}
