import fs from 'node:fs';
import { paths } from '../config/paths.js';
import {
    sanitizeItemCatalogDocument,
    type ItemCatalogDocument,
} from '../../../src/game-data/itemCatalogTypes.js';

let cachedCatalog: ItemCatalogDocument | null = null;

export function loadServerItemCatalog(): ItemCatalogDocument {
    if (cachedCatalog) return cachedCatalog;
    try {
        const raw = JSON.parse(fs.readFileSync(paths.itemCatalogPath, 'utf-8')) as unknown;
        cachedCatalog = sanitizeItemCatalogDocument(raw);
    } catch {
        cachedCatalog = { items: [] };
    }
    return cachedCatalog;
}

export function invalidateServerItemCatalogCache(): void {
    cachedCatalog = null;
}
