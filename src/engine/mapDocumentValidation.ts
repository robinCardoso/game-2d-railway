import { buildFileKeyToIdMap } from './tileRefResolver';
import { isVariantBrush } from './tileVariants';
import type { MapDocument, MapTileEntry, TileRegistry } from './types';

export interface MapDocumentValidationResult {
    errors: string[];
    warnings: string[];
}

function collectEntries(doc: MapDocument): MapTileEntry[] {
    const entries: MapTileEntry[] = [];
    const { tiles, layers } = doc;

    if (tiles) {
        for (const floor of Object.values(tiles)) {
            entries.push(...floor);
        }
    }

    if (layers) {
        for (const floor of Object.values(layers.grass ?? {})) entries.push(...floor);
        for (const floor of Object.values(layers.border ?? {})) entries.push(...floor);
        for (const floor of Object.values(layers.items ?? {})) entries.push(...floor);
    }

    return entries;
}

/** Valida contrato ref-first antes de persistir mapa. */
export function validateMapDocument(
    doc: MapDocument,
    registry?: TileRegistry
): MapDocumentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const byFileKey = registry ? buildFileKeyToIdMap(registry) : undefined;

    for (const entry of collectEntries(doc)) {
        const { x, y, id, ref } = entry;
        const label = `(${x},${y}) id=${id}`;

        if (isVariantBrush(id)) {
            errors.push(`Célula ${label}: id de pincel aleatório (${id}) não pode ser salvo.`);
            continue;
        }

        if (!ref?.trim()) {
            warnings.push(`Célula ${label}: sem ref — mapa pode quebrar se ids mudarem no registry.`);
            continue;
        }

        if (byFileKey && !byFileKey.has(ref.trim())) {
            warnings.push(`Célula ${label}: ref "${ref}" não encontrado no tile registry atual.`);
        }
    }

    return { errors, warnings };
}
