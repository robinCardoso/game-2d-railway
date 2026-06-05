import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isTileWalkable, type WorldMapGrids } from '../../shared/tileWalkable.js';
import { SERVER_MAP_SIZE } from '../../shared/protocol.js';
import { getServerMapEntry } from './mapRegistry.js';
import { paths } from './config/paths.js';

const MAPS_DIR = paths.mapsDir;

interface LoadedCollisionMap {
    mapId: string;
    size: number;
    worldMap: WorldMapGrids;
}

export class MapCollisionStore {
    private templates = new Map<string, LoadedCollisionMap>();

    async loadAll(): Promise<void> {
        for (const entry of [getServerMapEntry('mainland'), getServerMapEntry('rookgaard'), getServerMapEntry('orc_cave')]) {
            if (!entry) continue;
            await this.loadTemplate(entry.id, entry.file);
        }
        console.log(`[MapCollisionStore] ${this.templates.size} template(s) carregado(s)`);
    }

    private async loadTemplate(mapId: string, file: string): Promise<void> {
        const path = join(MAPS_DIR, file.replace(/^maps\//, ''));
        const raw = JSON.parse(await readFile(path, 'utf8')) as {
            mapId?: string;
            size?: number;
            floors?: Record<string, number[][]>;
            tiles?: Record<string, { x: number; y: number; id: number }[]>;
            sparseTiles?: [number, number, number, number][];
        };

        const size = Math.min(raw.size ?? SERVER_MAP_SIZE, SERVER_MAP_SIZE);
        const worldMap: WorldMapGrids = {};

        if (raw.floors) {
            for (const [zKey, grid] of Object.entries(raw.floors)) {
                worldMap[Number(zKey)] = grid;
            }
        } else if (raw.tiles && typeof raw.tiles === 'object') {
            const tiles = raw.tiles as Record<string, { x: number; y: number; id: number }[]>;
            for (const [zKey, entries] of Object.entries(tiles)) {
                const z = Number(zKey);
                const grid: number[][] = Array(size)
                    .fill(0)
                    .map(() => Array(size).fill(-1));
                for (const { x, y, id } of entries) {
                    if (grid[y] && grid[y][x] !== undefined) {
                        grid[y][x] = id;
                    }
                }
                worldMap[z] = grid;
            }
        } else if (Array.isArray((raw as any).sparseTiles)) {
            const sparse = (raw as any).sparseTiles as [number, number, number, number][];
            for (const [x, y, z, id] of sparse) {
                if (!worldMap[z]) {
                    worldMap[z] = Array(size)
                        .fill(0)
                        .map(() => Array(size).fill(-1));
                }
                if (worldMap[z][y] && worldMap[z][y][x] !== undefined) {
                    worldMap[z][y][x] = id;
                }
            }
        }

        this.templates.set(mapId, {
            mapId,
            size,
            worldMap,
        });
    }

    hasTemplate(mapId: string): boolean {
        return this.templates.has(mapId);
    }

    isWalkable(mapId: string, tileX: number, tileY: number, z: number): boolean {
        const tpl = this.templates.get(mapId);
        if (!tpl) return true;
        return isTileWalkable(tpl.worldMap, tpl.size, tileX, tileY, z);
    }
}
