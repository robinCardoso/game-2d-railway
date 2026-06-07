import type { CharacterStats } from '../../../shared/types/character';
import type { VocationAttackProfileConfig } from '../../../shared/playerAttack';

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
  readonly attackProfile?: VocationAttackProfileConfig;
}

export const VOCATIONS: Record<string, VocationConfig> = {
  knight: {
    name: 'Knight',
    attackProfile: { attackType: 'melee', range: 1, requiresLineOfSight: false },
    baseStats: {
      melee: 10,
      magicAttack: 1,
      distanceAttack: 2,
      defense: 10,
      attackSpeed: 900,
      defenseAttack: 8,
      health: 180,
      mana: 30,
    },
    growthPerLevel: {
      melee: 3,
      magicAttack: 0.3,
      distanceAttack: 0.5,
      defense: 2,
      health: 25,
      mana: 5,
    },
  },

  mage: {
    name: 'Mage',
    attackProfile: { attackType: 'magic', range: 7, requiresLineOfSight: false },
    baseStats: {
      melee: 2,
      magicAttack: 12,
      distanceAttack: 1,
      defense: 3,
      attackSpeed: 1100,
      defenseAttack: 2,
      health: 90,
      mana: 180,
    },
    growthPerLevel: {
      melee: 0.3,
      magicAttack: 4,
      distanceAttack: 0.2,
      defense: 0.8,
      health: 10,
      mana: 30,
    },
  },

  archer: {
    name: 'Archer',
    attackProfile: { attackType: 'distance', range: 7, requiresLineOfSight: false },
    baseStats: {
      melee: 4,
      magicAttack: 3,
      distanceAttack: 10,
      defense: 5,
      attackSpeed: 1000,
      defenseAttack: 4,
      health: 110,
      mana: 90,
    },
    growthPerLevel: {
      melee: 1,
      magicAttack: 1.5,
      distanceAttack: 3,
      defense: 1.2,
      health: 15,
      mana: 15,
    },
  },
};
