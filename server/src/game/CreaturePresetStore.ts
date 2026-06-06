import { readFile } from 'node:fs/promises';
import {
    resolveMobCombatStats,
    sanitizeCreaturePresetEntry,
    type ResolvedMobCombatStats,
} from '../../../src/game-data/mobPresetTypes.js';
import { paths } from '../config/paths.js';

export class CreaturePresetStore {
    private byName = new Map<string, ResolvedMobCombatStats>();

    async load(): Promise<void> {
        this.byName.clear();
        try {
            const raw = JSON.parse(await readFile(paths.creaturePresetsPath, 'utf8')) as unknown;
            if (!Array.isArray(raw)) return;
            for (const row of raw) {
                const entry = sanitizeCreaturePresetEntry(row);
                if (!entry) continue;
                this.byName.set(entry.name, resolveMobCombatStats(entry));
            }
            console.log(`[CreaturePresetStore] ${this.byName.size} preset(s) de combate`);
        } catch (err) {
            console.warn('[CreaturePresetStore] creature_presets.json não carregado:', err);
        }
    }

    getStats(creatureName: string): ResolvedMobCombatStats {
        return this.byName.get(creatureName) ?? resolveMobCombatStats(undefined);
    }
}
