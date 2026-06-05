/** Registry builtin espelhado do cliente (servidor não lê localStorage). */

export interface ServerMapEntry {
    id: string;
    file: string;
    instanced: boolean;
}

export const SERVER_MAP_REGISTRY: ServerMapEntry[] = [
    { id: 'rookgaard', file: 'maps/rookgaard.json', instanced: false },
    { id: 'mainland', file: 'maps/mainland.json', instanced: false },
    { id: 'orc_cave', file: 'maps/orc_cave.json', instanced: true },
];

export function getServerMapEntry(mapId: string): ServerMapEntry | undefined {
    return SERVER_MAP_REGISTRY.find((m) => m.id === mapId);
}

export function isInstancedMap(mapId: string): boolean {
    return getServerMapEntry(mapId)?.instanced === true;
}
