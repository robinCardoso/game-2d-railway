/**
 * Calculates melee attack damage.
 */
export function calculateMeleeDamage(meleeSkill: number, defenseValue: number = 0): { min: number; max: number; actual: number } {
  const max = Math.max(1, Math.round(meleeSkill * 2));
  const min = Math.max(1, Math.round(meleeSkill * 1));
  
  const raw = Math.floor(Math.random() * (max - min + 1)) + min;
  const actual = Math.max(0, raw - defenseValue);
  
  return { min, max, actual };
}

/**
 * Calculates distance/projectile attack damage.
 */
export function calculateDistanceDamage(distSkill: number, defenseValue: number = 0): { min: number; max: number; actual: number } {
  const max = Math.max(1, Math.round(distSkill * 2.5));
  const min = Math.max(1, Math.round(distSkill * 1.2));
  
  const raw = Math.floor(Math.random() * (max - min + 1)) + min;
  const actual = Math.max(0, raw - defenseValue);
  
  return { min, max, actual };
}

/**
 * Calculates magic spell damage.
 */
export function calculateMagicDamage(magicSkill: number, spellMultiplier: number = 1.0): { min: number; max: number; actual: number } {
  const basePower = magicSkill * 3 * spellMultiplier;
  const max = Math.max(1, Math.round(basePower * 1.2));
  const min = Math.max(1, Math.round(basePower * 0.8));
  
  const actual = Math.floor(Math.random() * (max - min + 1)) + min;
  
  return { min, max, actual };
}
