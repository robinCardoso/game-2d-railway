export type GamePortalConfig = {
  id: string;
  fromMapId: string;
  from: {
    x: number;
    y: number;
    z: number;
  };
  toMapId: string;
  to: {
    x: number;
    y: number;
    z: number;
  };
};

export const PORTALS: GamePortalConfig[] = [
  {
    id: 'portal_rook_to_main',
    fromMapId: 'rookgaard',
    from: { x: 50, y: 50, z: 0 },
    toMapId: 'mainland',
    to: { x: 50, y: 50, z: 0 },
  },
  {
    id: 'portal_cave_to_main',
    fromMapId: 'orc_cave',
    from: { x: 50, y: 50, z: 0 },
    toMapId: 'mainland',
    to: { x: 50, y: 50, z: 0 },
  },
  {
    id: 'portal_main_to_rook',
    fromMapId: 'mainland',
    from: { x: 50, y: 55, z: 0 },
    toMapId: 'rookgaard',
    to: { x: 50, y: 50, z: 0 },
  },
  {
    id: 'portal_main_to_orc_cave',
    fromMapId: 'mainland',
    from: { x: 55, y: 50, z: 0 },
    toMapId: 'orc_cave',
    to: { x: 50, y: 50, z: 0 },
  },
];
