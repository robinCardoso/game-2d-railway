/**
 * Registro central de todos os mapas disponíveis no jogo.
 * Builtins vêm do código; custom/overrides são hidratados via mapRegistryStorage.
 */

import {
    hydrateMapRegistry,
    persistMapRegistry,
    type MapEntry,
} from './mapRegistryStorage';

export type { MapEntry };

const BUILTIN_MAP_REGISTRY: MapEntry[] = [
    {
        id: 'rookgaard',
        name: 'Rookgaard',
        file: 'maps/rookgaard.json',
        size: 256,
        instanced: false,
        description: 'A ilha de treinamento para novos aventureiros.',
    },
    {
        id: 'mainland',
        name: 'Continente Principal',
        file: 'maps/mainland.json',
        size: 256,
        instanced: false,
        description: 'O continente principal do mundo.',
    },
    {
        id: 'orc_cave',
        name: 'Caverna dos Orcs',
        file: 'maps/orc_cave.json',
        size: 256,
        instanced: true,
        description: 'Dungeon instanciada — cada grupo tem sua cópia (futuro).',
    },
];

export const BUILTIN_MAP_IDS = new Set(BUILTIN_MAP_REGISTRY.map((m) => m.id));

export const MAP_REGISTRY: MapEntry[] = BUILTIN_MAP_REGISTRY.map((e) => ({ ...e }));

hydrateMapRegistry(MAP_REGISTRY, BUILTIN_MAP_IDS);

export function getKnownMapIds(): Set<string> {
    return new Set(MAP_REGISTRY.map((m) => m.id));
}

export function getMapEntry(id: string): MapEntry | undefined {
    return MAP_REGISTRY.find((m) => m.id === id);
}

export function registerMap(entry: MapEntry): void {
    const existing = MAP_REGISTRY.findIndex((m) => m.id === entry.id);
    if (existing !== -1) {
        MAP_REGISTRY[existing] = entry;
    } else {
        MAP_REGISTRY.push(entry);
    }
    persistMapRegistry(MAP_REGISTRY, BUILTIN_MAP_IDS);
}

export function unregisterMap(id: string): boolean {
    if (BUILTIN_MAP_IDS.has(id)) {
        console.warn('[MapRegistry] Mapas builtin não podem ser removidos do registry.');
        return false;
    }
    const idx = MAP_REGISTRY.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    MAP_REGISTRY.splice(idx, 1);
    persistMapRegistry(MAP_REGISTRY, BUILTIN_MAP_IDS);
    return true;
}
