import type { MapDocument, MapTileEntry, SparseTileEntry } from './types';
import { MAP_FORMAT_ID, MAP_SCHEMA_PATH } from './tileCatalog';

function formatTileEntry(entry: MapTileEntry, indent: string): string {
    const parts = [`"x": ${entry.x}`, `"y": ${entry.y}`, `"id": ${entry.id}`];
    if (entry.ref) {
        parts.push(`"ref": ${JSON.stringify(entry.ref)}`);
    }
    return `${indent}{ ${parts.join(', ')} }`;
}

/** Agrupa entradas esparso legadas `[x,y,z,id]` por andar. */
export function groupSparseEntriesByFloor(
    entries: SparseTileEntry[]
): Record<string, MapTileEntry[]> {
    const grouped = new Map<number, MapTileEntry[]>();

    for (const [x, y, z, id] of entries) {
        const list = grouped.get(z) ?? [];
        list.push({ x, y, id });
        grouped.set(z, list);
    }

    const out: Record<string, MapTileEntry[]> = {};
    for (const z of [...grouped.keys()].sort((a, b) => a - b)) {
        out[String(z)] = grouped
            .get(z)!
            .sort((a, b) => a.y - b.y || a.x - b.x);
    }
    return out;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function isNonEmptyArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length > 0;
}

/** View enxuta para disco — omite campos vazios e usa `tiles` agrupados por andar. */
export function buildMapDocumentExportView(doc: MapDocument): Record<string, unknown> {
    const out: Record<string, unknown> = {
        $schema: doc.schema ?? MAP_SCHEMA_PATH,
        format: doc.format ?? MAP_FORMAT_ID,
        version: doc.version,
        coordSystem: doc.coordSystem,
        name: doc.name,
        size: doc.size,
        spawn: doc.spawn,
    };

    if (doc.mapId) out.mapId = doc.mapId;
    if (doc.tileSize !== undefined) out.tileSize = doc.tileSize;

    if (doc.tileRefs && Object.keys(doc.tileRefs).length > 0) {
        out.tileRefs = doc.tileRefs;
    }

    if (doc.tiles && Object.keys(doc.tiles).length > 0) {
        out.tiles = doc.tiles;
    } else if (isNonEmptyArray(doc.sparseTiles)) {
        out.tiles = groupSparseEntriesByFloor(doc.sparseTiles);
    }

    if (doc.layers) {
        const layersOut: NonNullable<MapDocument['layers']> = {};
        if (doc.layers.grass && Object.keys(doc.layers.grass).length > 0) {
            layersOut.grass = doc.layers.grass;
        }
        if (doc.layers.border && Object.keys(doc.layers.border).length > 0) {
            layersOut.border = doc.layers.border;
        }
        if (doc.layers.items && Object.keys(doc.layers.items).length > 0) {
            layersOut.items = doc.layers.items;
        }
        if (Object.keys(layersOut).length > 0) {
            out.layers = layersOut;
        }
    }

    if (isNonEmptyObject(doc.metadata)) out.metadata = doc.metadata;
    if (isNonEmptyObject(doc.houses)) out.houses = doc.houses;
    if (isNonEmptyArray(doc.spawns)) out.spawns = doc.spawns;
    if (isNonEmptyArray(doc.portals)) out.portals = doc.portals;

    return out;
}

function formatSpawn(spawn: MapDocument['spawn'], indent: string): string[] {
    return [
        `${indent}"spawn": {`,
        `${indent}  "x": ${spawn.x},`,
        `${indent}  "y": ${spawn.y},`,
        `${indent}  "z": ${spawn.z}`,
        `${indent}}`,
    ];
}

function formatTilesByFloor(
    tiles: Record<string, MapTileEntry[]>,
    indent: string,
    propertyName = 'tiles'
): string[] {
    const lines: string[] = [`${indent}"${propertyName}": {`];
    const floorKeys = Object.keys(tiles).sort((a, b) => Number(a) - Number(b));

    floorKeys.forEach((zKey, floorIndex) => {
        const entries = tiles[zKey] ?? [];
        lines.push(`${indent}  "${zKey}": [`);

        entries.forEach((entry, entryIndex) => {
            const comma = entryIndex < entries.length - 1 ? ',' : '';
            lines.push(`${formatTileEntry(entry, `${indent}    `)}${comma}`);
        });

        const floorComma = floorIndex < floorKeys.length - 1 ? ',' : '';
        lines.push(`${indent}  ]${floorComma}`);
    });

    lines.push(`${indent}}`);
    return lines;
}

function formatJsonValue(value: unknown, indent: string): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    return JSON.stringify(value, null, 2)
        .split('\n')
        .map((line, index) => (index === 0 ? line : indent + line))
        .join('\n');
}

function formatCoordSystem(coord: MapDocument['coordSystem'], indent: string): string {
    if (!coord) return '';
    return `${indent}"coordSystem": ${JSON.stringify(coord, null, 2)
        .split('\n')
        .map((line, i) => (i === 0 ? line : indent + line))
        .join('\n')}`;
}

function formatTileRefs(refs: MapDocument['tileRefs'], indent: string): string {
    if (!refs || Object.keys(refs).length === 0) return '';
    return `${indent}"tileRefs": ${JSON.stringify(refs, null, 2)
        .split('\n')
        .map((line, i) => (i === 0 ? line : indent + line))
        .join('\n')}`;
}

function formatLayers(layers: NonNullable<MapDocument['layers']>, indent: string): string[] {
    const lines: string[] = [`${indent}"layers": {`];
    const sections: string[] = [];

    if (layers.grass && Object.keys(layers.grass).length > 0) {
        sections.push(formatTilesByFloor(layers.grass, `${indent}  `, 'grass').join('\n'));
    }
    if (layers.border && Object.keys(layers.border).length > 0) {
        sections.push(formatTilesByFloor(layers.border, `${indent}  `, 'border').join('\n'));
    }
    if (layers.items && Object.keys(layers.items).length > 0) {
        sections.push(formatTilesByFloor(layers.items, `${indent}  `, 'items').join('\n'));
    }

    lines.push(sections.join(',\n'));
    lines.push(`${indent}}`);
    return lines;
}

/** JSON legível para humanos — compacto em KB, fácil de inspecionar no Git. */
export function formatMapDocumentJson(doc: MapDocument): string {
    const view = buildMapDocumentExportView(doc);
    const sections: string[] = [];

    if (view.$schema !== undefined) {
        sections.push(`  "$schema": ${JSON.stringify(view.$schema)}`);
    }
    if (view.format !== undefined) {
        sections.push(`  "format": ${JSON.stringify(view.format)}`);
    }

    const headerKeys = ['version', 'name', 'mapId', 'size', 'tileSize'] as const;
    for (const key of headerKeys) {
        if (view[key] === undefined) continue;
        sections.push(`  "${key}": ${JSON.stringify(view[key])}`);
    }

    if (view.coordSystem) {
        sections.push(formatCoordSystem(view.coordSystem as MapDocument['coordSystem'], '  '));
    }

    if (view.tileRefs && typeof view.tileRefs === 'object') {
        sections.push(formatTileRefs(view.tileRefs as MapDocument['tileRefs'], '  '));
    }

    if (view.spawn) {
        sections.push(formatSpawn(view.spawn as MapDocument['spawn'], '  ').join('\n'));
    }

    if (view.tiles && typeof view.tiles === 'object' && Object.keys(view.tiles).length > 0) {
        sections.push(formatTilesByFloor(view.tiles as Record<string, MapTileEntry[]>, '  ').join('\n'));
    }

    if (view.layers && typeof view.layers === 'object') {
        sections.push(formatLayers(view.layers as NonNullable<MapDocument['layers']>, '  ').join('\n'));
    }

    const tailKeys = ['metadata', 'houses', 'spawns', 'portals'] as const;
    for (const key of tailKeys) {
        if (view[key] === undefined) continue;
        sections.push(`  "${key}": ${formatJsonValue(view[key], '  ')}`);
    }

    const body = sections.join(',\n');
    return `{\n${body}\n}\n`;
}
