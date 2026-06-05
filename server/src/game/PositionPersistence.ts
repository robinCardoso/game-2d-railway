import { isDatabaseConfigured } from '../db/pool.js';
import { updateCharacterLocation } from '../db/repositories/characters.repo.js';
import { isInstancedMap } from '../mapRegistry.js';

export interface PersistedLocation {
    characterId: string;
    accountId: string;
    mapId: string;
    tileX: number;
    tileY: number;
    z: number;
    direction: 'north' | 'south' | 'east' | 'west';
}

interface PendingEntry {
    accountId: string;
    mapId: string;
    tileX: number;
    tileY: number;
    z: number;
    direction: 'north' | 'south' | 'east' | 'west';
    timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Salva posição de personagem no PostgreSQL com debounce (autoridade do servidor WS).
 */
export class PositionPersistence {
    private pending = new Map<string, PendingEntry>();

    constructor(private readonly debounceMs: number) {}

    queue(loc: PersistedLocation): void {
        if (!isDatabaseConfigured()) return;
        if (isInstancedMap(loc.mapId)) return;

        const existing = this.pending.get(loc.characterId);
        if (existing?.timer) clearTimeout(existing.timer);

        const entry: PendingEntry = {
            accountId: loc.accountId,
            mapId: loc.mapId,
            tileX: loc.tileX,
            tileY: loc.tileY,
            z: loc.z,
            direction: loc.direction,
            timer: setTimeout(() => {
                void this.flush(loc.characterId);
            }, this.debounceMs),
        };
        this.pending.set(loc.characterId, entry);
    }

    async saveNow(loc: PersistedLocation): Promise<void> {
        if (!isDatabaseConfigured()) return;
        if (isInstancedMap(loc.mapId)) return;

        const existing = this.pending.get(loc.characterId);
        if (existing?.timer) clearTimeout(existing.timer);
        this.pending.delete(loc.characterId);

        try {
            await updateCharacterLocation(loc.characterId, loc.accountId, {
                mapId: loc.mapId,
                positionX: loc.tileX,
                positionY: loc.tileY,
                positionZ: loc.z,
                direction: loc.direction,
            });
        } catch (err) {
            console.error(`[PositionPersistence] Falha ao salvar ${loc.characterId}:`, err);
        }
    }

    async flush(characterId: string): Promise<void> {
        const entry = this.pending.get(characterId);
        if (!entry) return;
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        this.pending.delete(characterId);

        if (!isDatabaseConfigured() || isInstancedMap(entry.mapId)) return;

        try {
            await updateCharacterLocation(characterId, entry.accountId, {
                mapId: entry.mapId,
                positionX: entry.tileX,
                positionY: entry.tileY,
                positionZ: entry.z,
                direction: entry.direction,
            });
        } catch (err) {
            console.error(`[PositionPersistence] Falha ao salvar ${characterId}:`, err);
        }
    }

    async flushAll(): Promise<void> {
        const ids = [...this.pending.keys()];
        await Promise.all(ids.map((id) => this.flush(id)));
    }
}
