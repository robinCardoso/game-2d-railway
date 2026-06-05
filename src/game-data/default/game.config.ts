export const DEFAULT_GAME_CONFIG = {
  id: 'default',
  name: 'Game 2D Default',

  start: {
    mapId: 'rookgaard',
    position: {
      x: 10,
      y: 10,
      z: 0,
    },
    direction: 'south' as const,
  },

  rules: {
    maxCharactersPerAccount: 4,
    allowPvp: false,
    allowGenderChange: false,
    allowVocationChange: false,
  },
} as const;
