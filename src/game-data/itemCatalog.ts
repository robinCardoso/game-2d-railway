import {
    sanitizeItemCatalogDocument,
    type ItemCatalogDocument,
    type ItemCatalogEntry,
} from './itemCatalogTypes';
import { resolveApiUrl } from '../shared/apiUrl';

const CATALOG_URL = '/item_catalog.json';

let catalog: ItemCatalogDocument = { items: [] };
const byId = new Map<string, ItemCatalogEntry>();

function rebuildIndex(doc: ItemCatalogDocument): void {
    catalog = doc;
    byId.clear();
    for (const item of doc.items) {
        byId.set(item.id, item);
    }
}

export function getItemCatalog(): ItemCatalogDocument {
    return catalog;
}

export function getItemCatalogEntry(itemId: string): ItemCatalogEntry | undefined {
    return byId.get(itemId.trim());
}

export function getItemCatalogEntries(): readonly ItemCatalogEntry[] {
    return catalog.items;
}

export function itemExistsInCatalog(itemId: string): boolean {
    return byId.has(itemId.trim());
}

/** Carrega `public/item_catalog.json`. */
export async function loadItemCatalog(): Promise<ItemCatalogDocument> {
    try {
        const res = await fetch(resolveApiUrl(CATALOG_URL), { cache: 'no-store' });
        if (!res.ok) {
            console.warn('[ItemCatalog] item_catalog.json ausente — catálogo vazio.');
            rebuildIndex({ items: [] });
            return catalog;
        }
        const raw = await res.json();
        rebuildIndex(sanitizeItemCatalogDocument(raw));
        console.log(`[ItemCatalog] ${catalog.items.length} item(ns) carregado(s).`);
        return catalog;
    } catch (err) {
        console.warn('[ItemCatalog] Falha ao carregar catálogo:', err);
        rebuildIndex({ items: [] });
        return catalog;
    }
}

/** Sincroniza cache local após save via API (sem refetch). */
export function applyItemCatalogDocument(doc: ItemCatalogDocument): void {
    rebuildIndex(sanitizeItemCatalogDocument(doc));
}
