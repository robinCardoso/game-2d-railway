/** Debug de desync visual de criaturas — `localStorage debug.creature.sync=1` */

const THROTTLE_MS = 200;
const lastLogAt = new Map<string, number>();

export function isCreatureSyncDebugEnabled(): boolean {
    try {
        return localStorage.getItem('debug.creature.sync') === '1';
    } catch {
        return false;
    }
}

export function logCreatureSync(
    event: string,
    creatureId: string,
    detail: Record<string, unknown>
): void {
    if (!isCreatureSyncDebugEnabled()) return;
    const key = `${event}:${creatureId}`;
    const now = performance.now();
    if (now - (lastLogAt.get(key) ?? 0) < THROTTLE_MS) return;
    lastLogAt.set(key, now);
    console.log(`[creature.sync] ${event}`, { creatureId, ...detail });
}

export function creatureVisualDesyncPx(
    worldX: number,
    worldY: number,
    tileX: number,
    tileY: number,
    tileSize: number
): { dx: number; dy: number; max: number } {
    const dx = Math.abs(worldX - tileX * tileSize);
    const dy = Math.abs(worldY - tileY * tileSize);
    return { dx, dy, max: Math.max(dx, dy) };
}
