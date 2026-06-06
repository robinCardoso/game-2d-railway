/** Registry de mapas no servidor — builtins + descoberta em maps/ (volume ou repo). */

import fs from 'node:fs';
import { paths } from './config/paths.js';

export interface ServerMapEntry {
    id: string;
    file: string;
    instanced: boolean;
}

const BUILTIN_SERVER_MAP_REGISTRY: ServerMapEntry[] = [
    { id: 'rookgaard', file: 'maps/rookgaard.json', instanced: false },
    { id: 'mainland', file: 'maps/mainland.json', instanced: false },
    { id: 'orc_cave', file: 'maps/orc_cave.json', instanced: true },
];

/** @deprecated Use getServerMapRegistry() após initServerMapRegistry(). */
export const SERVER_MAP_REGISTRY: ServerMapEntry[] = BUILTIN_SERVER_MAP_REGISTRY;

let registry: ServerMapEntry[] = [...BUILTIN_SERVER_MAP_REGISTRY];

function discoverMapsFromDir(mapsDir: string): ServerMapEntry[] {
    if (!fs.existsSync(mapsDir)) return [];
    const discovered: ServerMapEntry[] = [];
    for (const file of fs.readdirSync(mapsDir)) {
        if (!file.endsWith('.json')) continue;
        const id = file.slice(0, -5);
        if (!id || !/^[a-z0-9_-]+$/.test(id)) continue;
        discovered.push({
            id,
            file: `maps/${file}`,
            instanced: false,
        });
    }
    return discovered;
}

export function buildServerMapRegistry(): ServerMapEntry[] {
    const byId = new Map<string, ServerMapEntry>();
    for (const entry of BUILTIN_SERVER_MAP_REGISTRY) {
        byId.set(entry.id, { ...entry });
    }
    for (const entry of discoverMapsFromDir(paths.mapsDir)) {
        if (!byId.has(entry.id)) {
            byId.set(entry.id, entry);
        }
    }
    return [...byId.values()];
}

export function initServerMapRegistry(): ServerMapEntry[] {
    registry = buildServerMapRegistry();
    return registry;
}

export function getServerMapRegistry(): ServerMapEntry[] {
    return registry;
}

export function getServerMapEntry(mapId: string): ServerMapEntry | undefined {
    return registry.find((m) => m.id === mapId);
}

export function isInstancedMap(mapId: string): boolean {
    return getServerMapEntry(mapId)?.instanced === true;
}
