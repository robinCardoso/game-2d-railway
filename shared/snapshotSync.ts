import type { CreatureSnapshot, PlayerSnapshot } from './protocol.js';

function mixHash(h: number, value: number): number {
    return (Math.imul(h, 31) + (value | 0)) | 0;
}

function mixString(h: number, text: string): number {
    let out = h;
    for (let i = 0; i < text.length; i++) {
        out = mixHash(out, text.charCodeAt(i));
    }
    return out;
}

/** Hash estável para deduplicar snapshots periódicos no servidor. */
export function hashPlayerSnapshots(players: readonly PlayerSnapshot[]): number {
    let h = players.length | 0;
    const sorted = players.length > 1 ? [...players].sort((a, b) => a.playerId.localeCompare(b.playerId)) : players;
    for (const p of sorted) {
        h = mixString(h, p.playerId);
        h = mixHash(h, p.tileX);
        h = mixHash(h, p.tileY);
        h = mixHash(h, p.z);
        h = mixHash(h, p.direction === 'north' ? 1 : p.direction === 'south' ? 2 : p.direction === 'east' ? 3 : p.direction === 'west' ? 4 : 0);
        h = mixHash(h, p.health ?? -1);
        h = mixHash(h, p.maxHealth ?? -1);
        h = mixHash(h, p.mana ?? -1);
        h = mixHash(h, p.maxMana ?? -1);
        h = mixHash(h, p.stepDurationMs ?? -1);
    }
    return h;
}

export function hashCreatureSnapshots(creatures: readonly CreatureSnapshot[]): number {
    let h = creatures.length | 0;
    const sorted =
        creatures.length > 1
            ? [...creatures].sort((a, b) => a.creatureId.localeCompare(b.creatureId))
            : creatures;
    for (const c of sorted) {
        h = mixString(h, c.creatureId);
        h = mixHash(h, c.tileX);
        h = mixHash(h, c.tileY);
        h = mixHash(h, c.z);
        h = mixHash(h, c.health ?? -1);
        h = mixHash(h, c.maxHealth ?? -1);
        h = mixHash(h, c.isDead ? 1 : 0);
        h = mixHash(
            h,
            c.direction === 'north'
                ? 1
                : c.direction === 'south'
                  ? 2
                  : c.direction === 'east'
                    ? 3
                    : c.direction === 'west'
                      ? 4
                      : 0
        );
    }
    return h;
}

/** Atualiza snapshot existente sem trocar referência no Map (menos GC no cliente). */
export function mergePlayerSnapshot(target: PlayerSnapshot, source: PlayerSnapshot): void {
    target.name = source.name;
    target.mapId = source.mapId;
    target.instanceId = source.instanceId;
    target.tileX = source.tileX;
    target.tileY = source.tileY;
    target.z = source.z;
    if (source.direction !== undefined) target.direction = source.direction;
    if (source.appearance !== undefined) target.appearance = source.appearance;
    if (source.stepDurationMs !== undefined) target.stepDurationMs = source.stepDurationMs;
    if (source.health !== undefined) target.health = source.health;
    if (source.maxHealth !== undefined) target.maxHealth = source.maxHealth;
    if (source.mana !== undefined) target.mana = source.mana;
    if (source.maxMana !== undefined) target.maxMana = source.maxMana;
}

/** Merge incremental de `state_sync` — remove ausentes, reutiliza objetos existentes. */
export function applyPlayerSnapshotList(
    targetMap: Map<string, PlayerSnapshot>,
    players: readonly PlayerSnapshot[],
    excludePlayerId?: string
): void {
    const activeIds = new Set<string>();
    for (const p of players) {
        if (excludePlayerId && p.playerId === excludePlayerId) continue;
        activeIds.add(p.playerId);
        const existing = targetMap.get(p.playerId);
        if (existing) {
            mergePlayerSnapshot(existing, p);
        } else {
            targetMap.set(p.playerId, { ...p });
        }
    }
    for (const id of targetMap.keys()) {
        if (!activeIds.has(id)) {
            targetMap.delete(id);
        }
    }
}
