import {
    sanitizeSpellCatalogDocument,
    type SpellCatalogDocument,
    type SpellDefinition,
} from './spellCatalogTypes';
import { resolveApiUrl } from '../shared/apiUrl';
import { assetLoader } from './assetLoader';

const CATALOG_URL = '/spell_catalog.json';

let catalog: SpellCatalogDocument = { spells: [] };
const byId = new Map<string, SpellDefinition>();

function rebuildIndex(doc: SpellCatalogDocument): void {
    catalog = doc;
    byId.clear();
    for (const spell of doc.spells) {
        byId.set(spell.id, spell);
    }
}

export function getSpellCatalog(): SpellCatalogDocument {
    return catalog;
}

export function getSpellById(spellId: string): SpellDefinition | undefined {
    return byId.get(spellId.trim());
}

export function getSpellCatalogEntries(): readonly SpellDefinition[] {
    return catalog.spells;
}

/** Carrega `public/spell_catalog.json`. */
export async function loadSpellCatalog(): Promise<SpellCatalogDocument> {
    try {
        let raw;
        if (assetLoader.isPackaged()) {
            raw = await assetLoader.getJson<SpellCatalogDocument>('spell_catalog.json');
            if (!raw) throw new Error('spell_catalog.json não encontrado no pacote assets.pak');
        } else {
            const res = await fetch(resolveApiUrl(CATALOG_URL), { cache: 'no-store' });
            if (!res.ok) {
                console.warn('[SpellCatalog] spell_catalog.json ausente — catálogo vazio.');
                rebuildIndex({ spells: [] });
                return catalog;
            }
            raw = await res.json();
        }
        rebuildIndex(sanitizeSpellCatalogDocument(raw));
        console.log(`[SpellCatalog] ${catalog.spells.length} magia(s) carregada(s).`);
        return catalog;
    } catch (err) {
        console.warn('[SpellCatalog] Falha ao carregar catálogo:', err);
        rebuildIndex({ spells: [] });
        return catalog;
    }
}

export function applySpellCatalogDocument(doc: SpellCatalogDocument): void {
    rebuildIndex(sanitizeSpellCatalogDocument(doc));
}
