import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isTileWalkable, type WorldMapGrids } from '../../shared/tileWalkable.js';
import { SERVER_MAP_SIZE } from '../../shared/protocol.js';
import { getServerMapRegistry } from './mapRegistry.js';
import { paths } from './config/paths.js';

const MAPS_DIR = paths.mapsDir;

interface MapSpawnEntry {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    type: 'monster' | 'npc';
}

interface ItemOverlayCell {
    ref: string;
    walkable: boolean;
}

/** items[z]["x,y"] — overlay de itens (árvores, etc.). */
type ItemOverlayByFloor = Record<number, Record<string, ItemOverlayCell>>;

export interface MapPlayerSpawn {
    x: number;
    y: number;
    z: number;
}

interface ServerTileMetadata {
    zoneId?: number;
    houseId?: number;
}

interface LoadedCollisionMap {
    mapId: string;
    size: number;
    worldMap: WorldMapGrids;
    spawns: MapSpawnEntry[];
    playerSpawn?: MapPlayerSpawn;
    items: ItemOverlayByFloor;
    metadata: Record<string, ServerTileMetadata>;
}

export class MapCollisionStore {
    private templates = new Map<string, LoadedCollisionMap>();
    private tileProperties: Record<string, { walkable?: boolean }> = {};

    async loadAll(): Promise<void> {
        await this.loadTileProperties();
        for (const entry of getServerMapRegistry()) {
            await this.loadTemplate(entry.id, entry.file);
        }
        console.log(`[MapCollisionStore] ${this.templates.size} template(s) carregado(s)`);
    }

    private async loadTileProperties(): Promise<void> {
        try {
            const raw = JSON.parse(await readFile(paths.tilePropertiesPath, 'utf8')) as Record<
                string,
                { walkable?: boolean }
            >;
            this.tileProperties = raw ?? {};
        } catch (err) {
            console.warn('[MapCollisionStore] tile_properties.json não carregado:', err);
            this.tileProperties = {};
        }
    }

    private resolveItemWalkable(ref: string | undefined, tileId: number): boolean {
        if (ref && ref in this.tileProperties) {
            return this.tileProperties[ref]?.walkable !== false;
        }
        // Fallback: IDs legados sem ref
        if (tileId === 42) return false;
        return true;
    }

    private parseItemOverlay(
        raw: {
            layers?: { items?: Record<string, { x: number; y: number; id: number; ref?: string }[]> };
            tileRefs?: Record<string, { ref?: string }>;
        },
        mapSize: number
    ): ItemOverlayByFloor {
        const items: ItemOverlayByFloor = {};
        const layerItems = raw.layers?.items;
        if (!layerItems) return items;

        for (const [zKey, entries] of Object.entries(layerItems)) {
            const z = Number(zKey);
            if (!Number.isInteger(z)) continue;
            const floor: Record<string, ItemOverlayCell> = {};

            for (const entry of entries) {
                const x = Number(entry.x);
                const y = Number(entry.y);
                if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y >= mapSize || y < 0 || x >= mapSize) {
                    continue;
                }
                const ref =
                    entry.ref ??
                    (raw.tileRefs?.[String(entry.id)] as { ref?: string } | undefined)?.ref ??
                    '';
                floor[`${x},${y}`] = {
                    ref,
                    walkable: this.resolveItemWalkable(ref, entry.id),
                };
            }
            items[z] = floor;
        }
        return items;
    }

    private async loadTemplate(mapId: string, file: string): Promise<void> {
        const path = join(MAPS_DIR, file.replace(/^maps\//, ''));
        const raw = JSON.parse(await readFile(path, 'utf8')) as {
            mapId?: string;
            size?: number;
            floors?: Record<string, number[][]>;
            tiles?: Record<string, { x: number; y: number; id: number }[]>;
            sparseTiles?: [number, number, number, number][];
            spawns?: MapSpawnEntry[];
            spawn?: { x?: number; y?: number; z?: number };
            layers?: { items?: Record<string, { x: number; y: number; id: number; ref?: string }[]> };
            tileRefs?: Record<string, { ref?: string }>;
            metadata?: Record<string, ServerTileMetadata>;
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

        const spawns = this.sanitizeSpawns(raw.spawns, size);
        const playerSpawn = this.sanitizePlayerSpawn(raw.spawn, size);
        const items = this.parseItemOverlay(raw, size);

        const metadata = raw.metadata ?? {};

        this.templates.set(mapId, {
            mapId,
            size,
            worldMap,
            spawns,
            playerSpawn,
            items,
            metadata,
        });
    }

    private sanitizePlayerSpawn(
        raw: { x?: number; y?: number; z?: number } | undefined,
        mapSize: number
    ): MapPlayerSpawn | undefined {
        if (!raw) return undefined;
        const x = Number(raw.x);
        const y = Number(raw.y);
        const z = Number(raw.z ?? 0);
        if (
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            !Number.isInteger(z) ||
            x < 0 ||
            y < 0 ||
            x >= mapSize ||
            y >= mapSize
        ) {
            return undefined;
        }
        return { x, y, z };
    }

    private sanitizeSpawns(raw: MapSpawnEntry[] | undefined, mapSize: number): MapSpawnEntry[] {
        if (!Array.isArray(raw)) return [];
        const out: MapSpawnEntry[] = [];
        for (const spawn of raw) {
            if (!spawn || typeof spawn.id !== 'string' || typeof spawn.name !== 'string') continue;
            const x = Number(spawn.x);
            const y = Number(spawn.y);
            const z = Number(spawn.z);
            if (
                !Number.isInteger(x) ||
                !Number.isInteger(y) ||
                !Number.isInteger(z) ||
                x < 0 ||
                y < 0 ||
                x >= mapSize ||
                y >= mapSize
            ) {
                continue;
            }
            const type = spawn.type === 'npc' ? 'npc' : 'monster';
            out.push({
                id: spawn.id.slice(0, 80),
                name: spawn.name.slice(0, 64),
                x,
                y,
                z,
                type,
            });
        }
        return out;
    }

    hasTemplate(mapId: string): boolean {
        return this.templates.has(mapId);
    }

    isWalkable(mapId: string, tileX: number, tileY: number, z: number): boolean {
        const tpl = this.templates.get(mapId);
        if (!tpl) return true;
        if (!isTileWalkable(tpl.worldMap, tpl.size, tileX, tileY, z)) return false;

        const item = tpl.items[z]?.[`${tileX},${tileY}`];
        if (item && !item.walkable) return false;

        return true;
    }

    getMapSpawn(mapId: string): MapPlayerSpawn | undefined {
        return this.templates.get(mapId)?.playerSpawn;
    }

    /**
     * Posição autoritativa para join WS: usa tile salvo se walkable,
     * senão cai no spawn do mapa (alinha cliente `resolveEffectiveSpawn`).
     */
    resolveJoinPosition(
        mapId: string,
        tileX: number,
        tileY: number,
        z: number
    ): { tileX: number; tileY: number; z: number; corrected: boolean } {
        if (this.isWalkable(mapId, tileX, tileY, z)) {
            return { tileX, tileY, z, corrected: false };
        }

        const spawn = this.getMapSpawn(mapId);
        if (spawn && this.isWalkable(mapId, spawn.x, spawn.y, spawn.z)) {
            console.warn(
                `[MapCollisionStore] Join em (${tileX},${tileY},${z}) não walkable em ${mapId}; usando spawn (${spawn.x},${spawn.y},${spawn.z}).`
            );
            return { tileX: spawn.x, tileY: spawn.y, z: spawn.z, corrected: true };
        }

        return { tileX, tileY, z, corrected: false };
    }

    getSpawns(mapId: string): MapSpawnEntry[] {
        return this.templates.get(mapId)?.spawns ?? [];
    }

    getMapSize(mapId: string): number {
        return this.templates.get(mapId)?.size ?? SERVER_MAP_SIZE;
    }

    getZoneIdAt(mapId: string, tileX: number, tileY: number, z: number): number {
        const tpl = this.templates.get(mapId);
        if (!tpl) return 0;
        const key = `${z}_${tileY}_${tileX}`;
        return tpl.metadata?.[key]?.zoneId ?? 0;
    }

    async reloadTemplate(mapId: string, file: string): Promise<void> {
        await this.loadTemplate(mapId, file);
    }
}
