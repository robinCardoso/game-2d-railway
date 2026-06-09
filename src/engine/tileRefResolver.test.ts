import { describe, expect, it } from 'vitest';
import { deserializeMapDocument } from './worldMap';
import {
    buildFileKeyToIdMap,
    resolveMapTileId,
} from './tileRefResolver';
import { isExcludedFromTileRegistry } from './tileRegistry';
import type { MapDocument, TileRegistry } from './types';

function mockRegistry(entries: Array<{ id: number; fileKey: string }>): TileRegistry {
    const registry: TileRegistry = {
        [-1]: { id: -1, name: 'Vazio', walkable: false, category: 'all' },
    };
    for (const e of entries) {
        registry[e.id] = {
            id: e.id,
            name: e.fileKey,
            fileKey: e.fileKey,
            walkable: true,
            category: 'test',
            paletteCategory: 'ground',
        };
    }
    return registry;
}

describe('isExcludedFromTileRegistry', () => {
    it('exclui tiles/effects/', () => {
        expect(isExcludedFromTileRegistry('../../tiles/effects/combat/target_ring.png')).toBe(true);
    });

    it('exclui tiles/characters/', () => {
        expect(isExcludedFromTileRegistry('../../tiles/characters/vocations/male/knight.png')).toBe(
            true
        );
    });

    it('inclui tiles/maps/', () => {
        expect(isExcludedFromTileRegistry('../../tiles/maps/nature/tree/01_arvore.png')).toBe(false);
    });

    it('exclui ícones de inventário em tiles/items/', () => {
        expect(isExcludedFromTileRegistry('../../tiles/items/icons/gold_coin.png')).toBe(true);
        expect(isExcludedFromTileRegistry('../../tiles/maps/items/vase.png')).toBe(false);
    });
});

describe('resolveMapTileId', () => {
    const registry = mockRegistry([
        { id: 39, fileKey: '01_ground_pedra_variants#0' },
        { id: 42, fileKey: '01_arvore' },
    ]);
    const byFileKey = buildFileKeyToIdMap(registry);

    it('prioriza ref da célula sobre tileRefs[id]', () => {
        const id = resolveMapTileId(
            38,
            '01_ground_pedra_variants#0',
            { '42': { id: 42, name: 'tree', ref: '01_arvore' } },
            byFileKey,
            registry
        );
        expect(id).toBe(39);
    });

    it('usa tileRefs quando célula não tem ref', () => {
        const id = resolveMapTileId(
            42,
            undefined,
            { '42': { id: 42, name: 'tree', ref: '01_arvore' } },
            byFileKey,
            registry
        );
        expect(id).toBe(42);
    });
});

describe('deserializeMapDocument anti double-remap', () => {
    it('não corrompe células já resolvidas por ref (sparse tiles)', () => {
        const registry = mockRegistry([
            { id: 39, fileKey: '01_ground_pedra_variants#0' },
            { id: 42, fileKey: '01_arvore' },
        ]);

        const doc: MapDocument = {
            version: 1,
            format: 'game-2d/map-sparse-v1',
            name: 'test',
            size: 16,
            tileSize: 32,
            spawn: { x: 0, y: 0, z: 0 },
            tileRefs: {
                '42': { id: 42, name: '01-arvore', ref: '01_arvore' },
            },
            tiles: {
                '0': [{ x: 5, y: 5, id: 38, ref: '01_ground_pedra_variants#0' }],
            },
        };

        const worldMap = deserializeMapDocument(doc, registry);
        expect(worldMap[0]?.[5]?.[5]).toBe(39);
    });
});
