import type { ItemCatalogDocument, ItemCatalogEntry } from './itemCatalogTypes';

export const ITEM_CATALOG_UPDATED = 'game:item-catalog-updated';

export function dispatchItemCatalogUpdated(catalog?: ItemCatalogDocument): void {
    window.dispatchEvent(
        new CustomEvent(ITEM_CATALOG_UPDATED, { detail: { catalog } })
    );
}

export function formatItemCatalogLabel(entry: ItemCatalogEntry): string {
    const status = entry.implemented ? '' : ' [não implementado]';
    const slot = entry.slot ? ` (${entry.slot})` : '';
    return `${entry.name}${slot}${status}`;
}
