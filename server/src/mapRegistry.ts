/** Registry de mapas no servidor — builtins + descoberta em maps/ (volume ou repo). */

import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config/paths.js';

export interface ServerMapEntry {
    id: string;
    file: string;
    instanced: boolean;
    pvpEnabled?: boolean;
}

const BUILTIN_SERVER_MAP_REGISTRY: ServerMapEntry[] = [
    { id: 'rookgaard', file: 'maps/rookgaard.json', instanced: false, pvpEnabled: false },
    { id: 'mainland', file: 'maps/mainland.json', instanced: false, pvpEnabled: true },
    { id: 'orc_cave', file: 'maps/orc_cave.json', instanced: true, pvpEnabled: true },
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
        
        let pvpEnabled = true;
        let instanced = false;
        try {
            const rawContent = fs.readFileSync(path.join(mapsDir, file), 'utf-8');
            const parsed = JSON.parse(rawContent);
            if (typeof parsed.pvpEnabled === 'boolean') {
                pvpEnabled = parsed.pvpEnabled;
            }
            if (typeof parsed.instanced === 'boolean') {
                instanced = parsed.instanced;
            }
        } catch {
            // ignore
        }

        discovered.push({
            id,
            file: `maps/${file}`,
            instanced,
            pvpEnabled,
        });
    }
    return discovered;
}

function readMapFlagsFromJsonFile(filePath: string): Pick<ServerMapEntry, 'pvpEnabled' | 'instanced'> {
    let pvpEnabled: boolean | undefined;
    let instanced: boolean | undefined;
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (typeof parsed.pvpEnabled === 'boolean') {
            pvpEnabled = parsed.pvpEnabled;
        }
        if (typeof parsed.instanced === 'boolean') {
            instanced = parsed.instanced;
        }
    } catch {
        // ignore
    }
    return {
        pvpEnabled: pvpEnabled ?? true,
        instanced: instanced ?? false,
    };
}

export function buildServerMapRegistry(): ServerMapEntry[] {
    const byId = new Map<string, ServerMapEntry>();
    for (const entry of BUILTIN_SERVER_MAP_REGISTRY) {
        byId.set(entry.id, { ...entry });
    }
    for (const entry of discoverMapsFromDir(paths.mapsDir)) {
        const existing = byId.get(entry.id);
        if (existing) {
            byId.set(entry.id, { ...existing, ...entry });
        } else {
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

/** Recarrega flags de um mapa salvo em disco (pvpEnabled, instanced). */
export function refreshServerMapEntry(mapId: string): void {
    if (!mapId || !/^[a-z0-9_-]+$/.test(mapId)) return;

    const filePath = path.join(paths.mapsDir, `${mapId}.json`);
    if (!fs.existsSync(filePath)) return;

    const flags = readMapFlagsFromJsonFile(filePath);
    const idx = registry.findIndex((m) => m.id === mapId);

    if (idx === -1) {
        registry.push({
            id: mapId,
            file: `maps/${mapId}.json`,
            instanced: flags.instanced,
            pvpEnabled: flags.pvpEnabled,
        });
        return;
    }

    registry[idx] = {
        ...registry[idx],
        instanced: flags.instanced,
        pvpEnabled: flags.pvpEnabled,
    };
}
