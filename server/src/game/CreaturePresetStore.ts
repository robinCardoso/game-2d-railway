import { readFile } from 'node:fs/promises';
import {
    resolveMobChaseConfig,
    resolveMobCombatStats,
    sanitizeCreaturePresetEntry,
    type ResolvedMobCombatStats,
} from '../../../src/game-data/mobPresetTypes.js';
import type { ChaseMobConfig } from '../../../shared/creatureChase.js';
import { paths } from '../config/paths.js';

export class CreaturePresetStore {
    private byName = new Map<string, ResolvedMobCombatStats>();
    private chaseByName = new Map<string, ChaseMobConfig>();

    async load(): Promise<void> {
        this.byName.clear();
        this.chaseByName.clear();
        try {
            const raw = JSON.parse(await readFile(paths.creaturePresetsPath, 'utf8')) as unknown;
            if (!Array.isArray(raw)) return;
            for (const row of raw) {
                const entry = sanitizeCreaturePresetEntry(row);
                if (!entry) continue;
                this.byName.set(entry.name, resolveMobCombatStats(entry));
                this.chaseByName.set(entry.name, resolveMobChaseConfig(entry));
            }
            console.log(`[CreaturePresetStore] ${this.byName.size} preset(s) de combate`);
        } catch (err) {
            console.warn('[CreaturePresetStore] creature_presets.json não carregado:', err);
        }
    }

    getStats(creatureName: string): ResolvedMobCombatStats {
        return this.byName.get(creatureName) ?? resolveMobCombatStats(undefined);
    }

    getChaseConfig(creatureName: string): ChaseMobConfig {
        return this.chaseByName.get(creatureName) ?? resolveMobChaseConfig(undefined);
    }
}
