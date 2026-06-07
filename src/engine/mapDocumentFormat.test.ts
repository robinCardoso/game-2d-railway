import { describe, expect, it } from 'vitest';
import { createEmptyWorldMap } from './worldMap';
import { serializeMapDocument } from './worldMap';
import { formatMapDocumentJson } from './mapDocumentFormat';
import { loadMapFromJson } from './worldMap';

describe('mapDocumentFormat pvpEnabled round-trip', () => {
    it('preserves pvpEnabled and instanced in exported JSON', () => {
        const worldMap = createEmptyWorldMap(64);
        const doc = serializeMapDocument(worldMap, {
            name: 'test_map',
            mapId: 'test_map',
            size: 64,
            spawn: { x: 10, y: 10, z: 0 },
            pvpEnabled: false,
            instanced: true,
        });

        const json = formatMapDocumentJson(doc);
        const parsed = JSON.parse(json);

        expect(parsed.pvpEnabled).toBe(false);
        expect(parsed.instanced).toBe(true);

        const loaded = loadMapFromJson(parsed);
        expect(loaded.pvpEnabled).toBe(false);
        expect(loaded.instanced).toBe(true);
    });
});
