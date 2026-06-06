export type Gender = 'male' | 'female';

/** Identificador da vocação (ex.: knight, mage, archer ou classes custom). */
export type VocationId = string;

export type CharacterAppearance = {
  gender: Gender;
  outfitId: string;
  spriteSheetUrl: string;
};

export type CharacterStats = {
  melee: number;
  magicAttack: number;
  distanceAttack: number;
  defense: number;
  attackSpeed: number;
  defenseAttack: number;
  health: number;
  mana: number;
};
