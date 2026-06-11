import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config/paths.js';
import { countItemCatalogEntries } from '../config/catalogVolumeSync.js';
import {
    sanitizeItemCatalogDocument,
    type ItemCatalogDocument,
} from '../../../src/game-data/itemCatalogTypes.js';

let cachedCatalog: ItemCatalogDocument | null = null;

function readCatalogFromPath(filePath: string): ItemCatalogDocument {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
        return sanitizeItemCatalogDocument(raw);
    } catch {
        return { items: [] };
    }
}

export function loadServerItemCatalog(): ItemCatalogDocument {
    if (cachedCatalog) return cachedCatalog;

    let catalog = readCatalogFromPath(paths.itemCatalogPath);
    const repoPath = path.join(paths.repoPublicDir, 'item_catalog.json');
    if (countItemCatalogEntries(catalog) === 0 && fs.existsSync(repoPath)) {
        const repoCatalog = readCatalogFromPath(repoPath);
        if (countItemCatalogEntries(repoCatalog) > 0) {
            console.warn(
                '[ItemCatalog] Catálogo do volume vazio — usando item_catalog.json do repo.'
            );
            catalog = repoCatalog;
        }
    }

    cachedCatalog = catalog;
    return cachedCatalog;
}

export function invalidateServerItemCatalogCache(): void {
    cachedCatalog = null;
}
