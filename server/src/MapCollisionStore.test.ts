import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config/paths.js', () => {
    const pathMod = require('node:path') as typeof import('node:path');
    const osMod = require('node:os') as typeof import('node:os');
    const testRoot = pathMod.join(osMod.tmpdir(), 'elarion-map-collision-test');
    const mapsDir = pathMod.join(testRoot, 'maps');
    return {
        paths: {
            mapsDir,
            tilePropertiesPath: pathMod.join(testRoot, 'tiles', 'tile_properties.json'),
        },
        getMapsDirForCollision: () => mapsDir,
    };
});

vi.mock('./mapRegistry.js', () => ({
    getServerMapRegistry: () => [
        { id: 'parity_test', file: 'maps/parity_test.json', instanced: false },
    ],
}));

import { MapCollisionStore } from './MapCollisionStore.js';

const TEST_ROOT = path.join(os.tmpdir(), 'elarion-map-collision-test');
const MAPS_DIR = path.join(TEST_ROOT, 'maps');
const TILE_PROPS = path.join(TEST_ROOT, 'tiles', 'tile_properties.json');

describe('MapCollisionStore base walkability', () => {
    beforeEach(() => {
        fs.mkdirSync(MAPS_DIR, { recursive: true });
        fs.mkdirSync(path.dirname(TILE_PROPS), { recursive: true });

        fs.writeFileSync(
            TILE_PROPS,
            JSON.stringify({
                walkable_grass: { walkable: true },
                solid_rock: { walkable: false },
            }),
            'utf-8'
        );

        fs.writeFileSync(
            path.join(MAPS_DIR, 'parity_test.json'),
            JSON.stringify({
                mapId: 'parity_test',
                size: 8,
                tileRefs: {
                    '100': { ref: 'walkable_grass' },
                    '200': { ref: 'solid_rock' },
                },
                tiles: {
                    '0': [
                        { x: 0, y: 0, id: 100 },
                        { x: 1, y: 0, id: 200 },
                        { x: 2, y: 0, id: 9999 },
                    ],
                },
            }),
            'utf-8'
        );
    });

    afterAll(() => {
        fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    });

    it('resolve walkable via tileRefs + tile_properties (não só IDs legados)', async () => {
        const store = new MapCollisionStore();
        await store.loadAll();

        expect(store.isWalkable('parity_test', 0, 0, 0)).toBe(true);
        expect(store.isWalkable('parity_test', 1, 0, 0)).toBe(false);
    });

    it('IDs modernos sem ref continuam walkable por padrão', async () => {
        const store = new MapCollisionStore();
        await store.loadAll();

        expect(store.isWalkable('parity_test', 2, 0, 0)).toBe(true);
    });

    it('mantém bloqueio da camada items', async () => {
        fs.writeFileSync(
            path.join(MAPS_DIR, 'parity_test.json'),
            JSON.stringify({
                mapId: 'parity_test',
                size: 8,
                tileRefs: {
                    '100': { ref: 'walkable_grass' },
                },
                tiles: {
                    '0': [{ x: 0, y: 0, id: 100 }],
                },
                layers: {
                    items: {
                        '0': [{ x: 0, y: 0, id: 300, ref: 'solid_rock' }],
                    },
                },
            }),
            'utf-8'
        );

        const store = new MapCollisionStore();
        await store.loadAll();

        expect(store.isWalkable('parity_test', 0, 0, 0)).toBe(false);
    });
});
