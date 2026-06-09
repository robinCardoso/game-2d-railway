import type { ItemCatalogDocument, ItemCatalogEntry } from '../src/game-data/itemCatalogTypes.js';

/** Calibração visual do ícone de inventário (`tiles/items/icons/`). */
export interface ItemSpriteCalibration {
    iconUrl: string;
    frameWidth: number;
    frameHeight: number;
    gridCols: number;
    gridRows: number;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
}

const DEFAULT_FRAME = 32;

export function defaultItemIconUrl(itemId: string): string {
    const slug = itemId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return `tiles/items/icons/${slug}.png`;
}

export function sanitizeItemSpriteCalibration(raw: unknown, itemId: string): ItemSpriteCalibration | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const row = raw as Record<string, unknown>;

    const parseDim = (key: string, fallback: number): number => {
        const n = Number(row[key]);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };

    const parseOptionalDim = (key: string): number | undefined => {
        if (row[key] === undefined || row[key] === null || row[key] === '') return undefined;
        const n = Number(row[key]);
        return Number.isFinite(n) ? Math.floor(n) : undefined;
    };

    let iconUrl = typeof row.iconUrl === 'string' ? row.iconUrl.trim() : '';
    if (!iconUrl) {
        iconUrl = defaultItemIconUrl(itemId);
    }
    if (!iconUrl.startsWith('tiles/items/')) {
        return undefined;
    }

    return {
        iconUrl,
        frameWidth: parseDim('frameWidth', DEFAULT_FRAME),
        frameHeight: parseDim('frameHeight', DEFAULT_FRAME),
        gridCols: Math.max(1, parseDim('gridCols', 1)),
        gridRows: Math.max(1, parseDim('gridRows', 1)),
        offsetX: parseOptionalDim('offsetX'),
        offsetY: parseOptionalDim('offsetY'),
        gapX: parseOptionalDim('gapX'),
        gapY: parseOptionalDim('gapY'),
    };
}

export function itemHasSprite(entry: ItemCatalogEntry): boolean {
    return Boolean(entry.sprite?.iconUrl);
}

export function validateItemCatalogDocument(
    catalog: ItemCatalogDocument,
    options?: {
        /** Retorna true se o PNG do ícone existe no disco (servidor). */
        iconFileExists?: (iconUrl: string) => boolean;
    }
): { ok: true } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const checkFile = options?.iconFileExists;

    for (const item of catalog.items) {
        if (!item.implemented) continue;

        if (!item.sprite?.iconUrl) {
            errors.push(
                `Item "${item.id}": implemented=true exige bloco sprite.iconUrl no catálogo.`
            );
            continue;
        }

        if (checkFile && !checkFile(item.sprite.iconUrl)) {
            errors.push(
                `Item "${item.id}": PNG ausente em ${item.sprite.iconUrl} (obrigatório para implemented).`
            );
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
