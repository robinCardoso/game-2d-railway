import fs from 'node:fs';
import { paths } from '../config/paths.js';
import {
    sanitizeSpellCatalogDocument,
    type SpellCatalogDocument,
} from '../../../src/game-data/spellCatalogTypes.js';

let cachedCatalog: SpellCatalogDocument | null = null;

export function loadServerSpellCatalog(): SpellCatalogDocument {
    if (cachedCatalog) return cachedCatalog;
    try {
        const raw = JSON.parse(fs.readFileSync(paths.spellCatalogPath, 'utf-8')) as unknown;
        cachedCatalog = sanitizeSpellCatalogDocument(raw);
    } catch {
        cachedCatalog = { spells: [] };
    }
    return cachedCatalog;
}

export function invalidateServerSpellCatalogCache(): void {
    cachedCatalog = null;
}
