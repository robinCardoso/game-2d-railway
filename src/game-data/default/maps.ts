export type GameMapConfig = {
  id: string;
  name: string;
  path: string;
  instanced?: boolean;
};

export const MAPS: GameMapConfig[] = [
  {
    id: 'rookgaard',
    name: 'Rookgaard',
    path: '/maps/rookgaard.json',
  },
  {
    id: 'mainland',
    name: 'Mainland',
    path: '/maps/mainland.json',
  },
  {
    id: 'orc_cave',
    name: 'Orc Cave',
    path: '/maps/orc_cave.json',
    instanced: true,
  },
];
