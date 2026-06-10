/** Constantes globais da engine (tile, mapa, andares). */
export const ENGINE_CONFIG = {
    TILE_SIZE: 32,
    MAP_SIZE: 256,
    /** Hitbox de passagem calibrada para tile 32px; escala com TILE_SIZE. */
    COLLISION_HITBOX_AT_TILE_32: 22,
    /** Andar mais baixo (subsolo). */
    MIN_FLOOR_Z: -7,
    /** Andar mais alto (torres / céu). */
    MAX_FLOOR_Z: 7,
    EMPTY_TILE_ID: -1,
} as const;

/** Sufixo esperado nos PNG de escada: `_64x64` quando TILE_SIZE é 64. */
export function tileAssetSizeSuffix(tileSize: number = ENGINE_CONFIG.TILE_SIZE): string {
    return `_${tileSize}x${tileSize}`;
}

/** Largura da hitbox de colisão proporcional ao tile (22px em tile 32 → 44px em tile 64). */
export function collisionHitboxSize(tileSize: number = ENGINE_CONFIG.TILE_SIZE): number {
    return Math.round(
        tileSize * (ENGINE_CONFIG.COLLISION_HITBOX_AT_TILE_32 / 32)
    );
}

const ALL_FLOOR_ZS: readonly number[] = (() => {
    const floors: number[] = [];
    for (let z = ENGINE_CONFIG.MIN_FLOOR_Z; z <= ENGINE_CONFIG.MAX_FLOOR_Z; z++) {
        floors.push(z);
    }
    return floors;
})();

/** Lista ordenada de todos os Z (-7 … +7). Retorno compartilhado — não mutar. */
export function getAllFloorZs(): readonly number[] {
    return ALL_FLOOR_ZS;
}

export function clampFloorZ(z: number): number {
    return Math.max(
        ENGINE_CONFIG.MIN_FLOOR_Z,
        Math.min(ENGINE_CONFIG.MAX_FLOOR_Z, Math.floor(z))
    );
}

/** Rótulo na UI: -7, 0, +3 */
export function formatFloorLabel(z: number): string {
    return z > 0 ? `+${z}` : String(z);
}
