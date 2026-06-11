import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBuiltinMapsFromRepo } from './mapVolumeSync.js';

describe('syncBuiltinMapsFromRepo', () => {
    const roots: string[] = [];

    function makeTempDirs(): { repoMapsDir: string; mapsDir: string } {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'map-volume-sync-'));
        roots.push(base);
        const repoMapsDir = path.join(base, 'repo', 'maps');
        const mapsDir = path.join(base, 'volume', 'maps');
        fs.mkdirSync(repoMapsDir, { recursive: true });
        fs.mkdirSync(mapsDir, { recursive: true });
        return { repoMapsDir, mapsDir };
    }

    afterEach(() => {
        for (const root of roots) {
            fs.rmSync(root, { recursive: true, force: true });
        }
        roots.length = 0;
    });

    it('copia mapa builtin quando volume não tem o arquivo', () => {
        const { repoMapsDir, mapsDir } = makeTempDirs();
        const content = '{"mapId":"rookgaard","size":16}\n';
        fs.writeFileSync(path.join(repoMapsDir, 'rookgaard.json'), content, 'utf-8');

        syncBuiltinMapsFromRepo(repoMapsDir, mapsDir);

        expect(fs.readFileSync(path.join(mapsDir, 'rookgaard.json'), 'utf-8')).toBe(content);
    });

    it('sobrescreve volume quando hash difere do repo', () => {
        const { repoMapsDir, mapsDir } = makeTempDirs();
        fs.writeFileSync(path.join(repoMapsDir, 'mainland.json'), '{"mapId":"mainland","v":2}\n', 'utf-8');
        fs.writeFileSync(path.join(mapsDir, 'mainland.json'), '{"mapId":"mainland","v":1}\n', 'utf-8');

        syncBuiltinMapsFromRepo(repoMapsDir, mapsDir);

        expect(fs.readFileSync(path.join(mapsDir, 'mainland.json'), 'utf-8')).toBe(
            '{"mapId":"mainland","v":2}\n'
        );
    });

    it('não altera volume quando hash coincide', () => {
        const { repoMapsDir, mapsDir } = makeTempDirs();
        const content = '{"mapId":"orc_cave","size":32}\n';
        fs.writeFileSync(path.join(repoMapsDir, 'orc_cave.json'), content, 'utf-8');
        fs.writeFileSync(path.join(mapsDir, 'orc_cave.json'), content, 'utf-8');
        const mtimeBefore = fs.statSync(path.join(mapsDir, 'orc_cave.json')).mtimeMs;

        syncBuiltinMapsFromRepo(repoMapsDir, mapsDir);

        const mtimeAfter = fs.statSync(path.join(mapsDir, 'orc_cave.json')).mtimeMs;
        expect(mtimeAfter).toBe(mtimeBefore);
    });

    it('ignora mapas fora da lista builtin', () => {
        const { repoMapsDir, mapsDir } = makeTempDirs();
        fs.writeFileSync(path.join(repoMapsDir, 'custom_dungeon.json'), '{"mapId":"custom"}\n', 'utf-8');

        syncBuiltinMapsFromRepo(repoMapsDir, mapsDir);

        expect(fs.existsSync(path.join(mapsDir, 'custom_dungeon.json'))).toBe(false);
    });
});
