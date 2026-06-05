export type Gender = 'male' | 'female';

export type VocationId = 'knight' | 'mage' | 'archer';

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
