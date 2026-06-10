import { readFile } from 'node:fs/promises';
import {
    sanitizeSpellCatalogDocument,
    type SpellDefinition,
} from '../../../src/game-data/spellCatalogTypes.js';
import { paths } from '../config/paths.js';

export class SpellCatalogStore {
    private byId = new Map<string, SpellDefinition>();

    async load(): Promise<void> {
        this.byId.clear();
        try {
            const raw = JSON.parse(await readFile(paths.spellCatalogPath, 'utf8')) as unknown;
            const doc = sanitizeSpellCatalogDocument(raw);
            for (const spell of doc.spells) {
                this.byId.set(spell.id, spell);
            }
            console.log(`[SpellCatalogStore] ${this.byId.size} magia(s) carregada(s)`);
        } catch (err) {
            console.warn('[SpellCatalogStore] spell_catalog.json não carregado:', err);
        }
    }

    getSpell(spellId: string): SpellDefinition | undefined {
        return this.byId.get(spellId.trim());
    }

    getAll(): SpellDefinition[] {
        return [...this.byId.values()];
    }
}
