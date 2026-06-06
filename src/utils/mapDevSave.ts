/**
 * Salva MapDocument via API /api/save-map (Vite dev ou servidor Express em produção).
 */

import { apiFetch } from '../shared/apiFetch';
import { buildFullTileCatalog } from '../engine/tileCatalog';
import { validateMapDocument } from '../engine/mapDocumentValidation';
import { formatMapDocumentJson } from '../engine/mapDocumentFormat';
import type { MapDocument, TileRegistry } from '../engine/types';

const MAX_FILENAME_LEN = 64;

export function sanitizeMapJsonFilename(filename: string): string | null {
    const base = filename.replace(/^.*[/\\]/, '').trim().toLowerCase();
    const withExt = base.endsWith('.json') ? base : `${base}.json`;
    const id = withExt.slice(0, -5);
    if (!id || !/^[a-z0-9_-]+$/.test(id)) return null;
    if (withExt.length > MAX_FILENAME_LEN + 5) return null;
    return withExt;
}

export function isMapSaveAvailable(): boolean {
    return true;
}

/** @deprecated Use isMapSaveAvailable */
export const isMapDevSaveAvailable = isMapSaveAvailable;

export async function saveMapDocumentToDevPublic(
    filename: string,
    document: MapDocument,
    options?: { registry?: TileRegistry; blockOnValidationErrors?: boolean }
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    const safeName = sanitizeMapJsonFilename(filename);
    if (!safeName) {
        return { ok: false, error: 'Nome de arquivo inválido. Use apenas a-z, 0-9, _ e -.' };
    }

    const validation = validateMapDocument(document, options?.registry);
    for (const warning of validation.warnings) {
        console.warn(`[MapSave] ${warning}`);
    }
    if (validation.errors.length > 0) {
        for (const err of validation.errors) {
            console.error(`[MapSave] ${err}`);
        }
        if (options?.blockOnValidationErrors !== false) {
            return {
                ok: false,
                error: validation.errors[0] ?? 'Mapa inválido para salvar.',
            };
        }
    }

    try {
        const response = await apiFetch('/api/save-map', {
            method: 'POST',
            body: JSON.stringify({
                filename: safeName,
                json: formatMapDocumentJson(document),
            }),
        });

        const payload = (await response.json()) as {
            success?: boolean;
            path?: string;
            error?: string;
        };

        if (!response.ok || !payload.success) {
            return {
                ok: false,
                error: payload.error ?? `HTTP ${response.status}`,
            };
        }

        return { ok: true, path: payload.path ?? `public/maps/${safeName}` };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}

export async function saveTileCatalogToDevPublic(
    registry: TileRegistry
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    const catalog = buildFullTileCatalog(registry);

    try {
        const response = await apiFetch('/api/save-tile-catalog', {
            method: 'POST',
            body: JSON.stringify({ catalog }),
        });

        const payload = (await response.json()) as {
            success?: boolean;
            path?: string;
            error?: string;
        };

        if (!response.ok || !payload.success) {
            return { ok: false, error: payload.error ?? `HTTP ${response.status}` };
        }

        return { ok: true, path: payload.path ?? 'public/tile_catalog.json' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}
