/** Remove sufixos de resolução do nome do arquivo (`grass_64x64` → `grass`). */
export function normalizeTileFileName(fileName: string): string {
    return fileName
        .replace(/\.png$/i, '')
        .trim()
        .toLowerCase()
        .replace(/_64x64$/i, '')
        .replace(/_32x32$/i, '');
}

export interface TileProperties {
    walkable: boolean;
    swimable?: boolean;        // É água profunda, exige barco/nadar
    blocksProjectiles?: boolean; // Bloqueia projéteis e feitiços
    blocksLight?: boolean;       // Bloqueia a visão (linha de visão)
    isStair?: boolean;          // Funciona como escada
    stairDirection?: 'up' | 'down'; // Direção da escada
    speedModifier?: number;      // Velocidade do jogador no piso (1.0 = normal)
    nameOverride?: string;       // Nome limpo na interface
    /** Grupo de variação aleatória (ex.: grass) — tiles com o mesmo valor sorteiam na pintura */
    variantGroup?: string;
    /** PNG strip horizontal: N frames de TILE_SIZE lado a lado → registry expande em N tiles */
    variantStripFrames?: number;
    assetType?: string;
    /** Máscara auto-borda 1–15 (bits N/E/S/O). */
    borderMask?: number;
    /** Conjunto auto-borda (ex. grass_edges). */
    borderSetId?: string;
    tileRole?: string;
    paletteCategory?: string;
    frameWidth?: number;
    frameHeight?: number;
    width?: number;
    height?: number;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
    sheetLayout?: string;
    /** Ajuste fino de ancoragem no tile (mesmo modelo dos personagens). */
    anchorX?: number;
    anchorY?: number;
}

export const TILE_CONFIG: Record<string, TileProperties> = {
    // Pisos (Floors)
    'grass': {
        walkable: true,
        speedModifier: 1.0,
        nameOverride: 'Grama',
    },
    'stone_floor': {
        walkable: true,
        speedModifier: 1.3, // Mais rápido em calçadas/pedra
        nameOverride: 'Piso de Pedra'
    },
    'wood': {
        walkable: true,
        speedModifier: 1.15, // Rápido em deck de madeira
        nameOverride: 'Piso de Madeira'
    },
    'water': {
        walkable: false,
        swimable: true, // Precisa de barco
        speedModifier: 0.6, // Lento
        nameOverride: 'Água Profunda',
    },

    // Paredes (Walls)
    'wall': {
        walkable: false,
        blocksProjectiles: true,
        blocksLight: true,
        nameOverride: 'Parede de Pedra'
    },

    // Natureza (Nature)
    'tree': {
        walkable: false,
        blocksProjectiles: true,
        blocksLight: false, // Árvores bloqueiam passagem mas deixam um pouco de luz passar
        nameOverride: 'Árvore Grande'
    },

    // Escadas (Stairs) — nome base sem sufixo _64x64
    'marble_stairs_up': {
        walkable: true,
        isStair: true,
        stairDirection: 'up',
        speedModifier: 1.0,
        nameOverride: 'Escada de Mármore'
    },
    'stone_stairs_up': {
        walkable: true,
        isStair: true,
        stairDirection: 'up',
        speedModifier: 1.0,
        nameOverride: 'Escada de Pedra'
    },
    'wood_stairs_up': {
        walkable: true,
        isStair: true,
        stairDirection: 'up',
        speedModifier: 1.0,
        nameOverride: 'Escada de Madeira'
    },
};

/**
 * Retorna as propriedades de um tile a partir de seu nome de arquivo de origem.
 */
export function getTileProperties(fileName: string): TileProperties {
    const cleanName = normalizeTileFileName(fileName);

    if (TILE_CONFIG[cleanName]) {
        return TILE_CONFIG[cleanName];
    }

    if (cleanName.includes('stairs_up')) {
        if (cleanName.includes('marble')) return TILE_CONFIG['marble_stairs_up'];
        if (cleanName.includes('stone')) return TILE_CONFIG['stone_stairs_up'];
        if (cleanName.includes('wood')) return TILE_CONFIG['wood_stairs_up'];
    }

    // Heurística padrão caso não esteja explicitamente configurado
    const isWall = cleanName.includes('wall') || cleanName.includes('stone_wall');
    const isNature = cleanName.includes('tree') || cleanName.includes('bush') || cleanName.includes('rock');
    
    return {
        walkable: !isWall && !isNature,
        blocksProjectiles: isWall || isNature,
        blocksLight: isWall,
        speedModifier: 1.0
    };
}

export function mergeCustomTileProperties(customProps: Record<string, TileProperties>): void {
    Object.assign(TILE_CONFIG, customProps);
}
