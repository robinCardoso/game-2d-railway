import { readFile } from 'node:fs/promises';
import type { VocationConfig } from '../../../src/engine/character/calculateStats.js';
import { paths } from '../config/paths.js';

export class VocationStore {
    private vocations: Record<string, VocationConfig> = {};

    async load(): Promise<void> {
        try {
            const raw = JSON.parse(await readFile(paths.vocationsJsonPath, 'utf8')) as Record<
                string,
                VocationConfig
            >;
            this.vocations = raw ?? {};
            console.log(`[VocationStore] ${Object.keys(this.vocations).length} vocação(ões)`);
        } catch (err) {
            console.warn('[VocationStore] vocations.json não carregado:', err);
            this.vocations = {};
        }
    }

    get(vocationId: string): VocationConfig | undefined {
        return this.vocations[vocationId] ?? this.vocations.knight;
    }
}
