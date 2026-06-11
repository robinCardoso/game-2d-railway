/** Tiles rejeitados por TILE_OCCUPIED — evita reenviar o mesmo destino enquanto segura WASD. */

const BLOCKED_TILE_COOLDOWN_MS = 250;

const blockedMoveTiles = new Map<string, number>();

function blockedTileKey(tileX: number, tileY: number, z: number): string {
    return `${tileX}:${tileY}:${z}`;
}

export function markBlockedTile(
    tileX: number,
    tileY: number,
    z: number,
    nowMs: number
): void {
    blockedMoveTiles.set(blockedTileKey(tileX, tileY, z), nowMs + BLOCKED_TILE_COOLDOWN_MS);
}

export function isBlockedTileCoolingDown(
    tileX: number,
    tileY: number,
    z: number,
    nowMs: number
): boolean {
    const until = blockedMoveTiles.get(blockedTileKey(tileX, tileY, z));
    if (until === undefined) return false;
    if (nowMs >= until) {
        blockedMoveTiles.delete(blockedTileKey(tileX, tileY, z));
        return false;
    }
    return true;
}

/** Só para testes. */
export function clearBlockedMoveTiles(): void {
    blockedMoveTiles.clear();
}
