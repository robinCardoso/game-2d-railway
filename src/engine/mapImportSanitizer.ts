/**
 * Normalização dos dados externos de um MapDocument antes do uso na engine,
 * contra JSON mal-formatado ou abusivo (DoS ou keys inválidas).
 */

import { ENGINE_CONFIG } from './config';
import { ZoneType } from './zones';
import { getKnownMapIds } from './mapRegistry';
import type {
    CreatureSpawn,
    HouseData,
    MapTileEntry,
    PortalData,
    SparseTileEntry,
    SpawnPoint,
    TileMetadata,
    WorldMap,
} from './types';

const { MAP_SIZE, MIN_FLOOR_Z, MAX_FLOOR_Z, EMPTY_TILE_ID } = ENGINE_CONFIG;

const MAX_SPAWNS_PER_MAP = 5000;
const MAX_PORTALS_PER_MAP = 500;
const MAX_METADATA_KEYS = 25_000;
const MAX_LARGE_INT = 2_147_483_647;
const MAX_TILE_ID = 9_999_999;
const MAX_HOUSE_ENTRIES = 500;
const MAX_MAP_NAME_CHARS = 96;
const MAX_HOUSE_NAME_CHARS = 128;
const VALID_ZONE_MAX = ZoneType.HOUSE;

export function clampImportMapSize(declaredSize: unknown): number {
    if (!Number.isFinite(declaredSize) || Number(declaredSize) <= 0) {
        return MAP_SIZE;
    }
    const s = Math.floor(Number(declaredSize));
    const clamped = Math.min(Math.max(8, s), MAP_SIZE);
    if (clamped !== s) {
        console.warn(
            `[Engine] Tamanho declarado no mapa (${s}) ajustado para ${clamped} (limite MAP_SIZE=${MAP_SIZE}).`
        );
    }
    return clamped;
}

export function sanitizeMapDocumentName(name: unknown): string {
    if (typeof name !== 'string') return 'importado';
    const t = name.trim().slice(0, MAX_MAP_NAME_CHARS);
    return t.length ? t : 'importado';
}

const MAX_SPARSE_TILES = 500_000;

export function sanitizeSparseTiles(raw: unknown, mapSize: number): SparseTileEntry[] {
    if (!Array.isArray(raw)) return [];

    const maxCoord = Math.max(0, mapSize - 1);
    const out: SparseTileEntry[] = [];

    for (const entry of raw) {
        if (out.length >= MAX_SPARSE_TILES) {
            console.warn(`[Engine] sparseTiles truncado em ${MAX_SPARSE_TILES} entradas.`);
            break;
        }
        if (!Array.isArray(entry) || entry.length < 4) continue;

        const x = Math.floor(Number(entry[0]));
        const y = Math.floor(Number(entry[1]));
        const z = Math.floor(Number(entry[2]));
        const id = Math.floor(Number(entry[3]));

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(id)) {
            continue;
        }
        if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) continue;
        if (z < MIN_FLOOR_Z || z > MAX_FLOOR_Z) continue;
        if (id < -2 || id > MAX_TILE_ID) continue;

        out.push([x, y, z, id]);
    }

    return out;
}

export function sanitizeTilesByFloor(
    raw: unknown,
    mapSize: number
): Record<string, MapTileEntry[]> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const maxCoord = Math.max(0, mapSize - 1);
    const out: Record<string, MapTileEntry[]> = {};
    let total = 0;

    for (const [zKey, entries] of Object.entries(raw as Record<string, unknown>)) {
        const z = Math.floor(Number(zKey));
        if (!Number.isFinite(z) || z < MIN_FLOOR_Z || z > MAX_FLOOR_Z) continue;
        if (!Array.isArray(entries)) continue;

        const floorTiles: MapTileEntry[] = [];
        for (const entry of entries) {
            if (total >= MAX_SPARSE_TILES) {
                console.warn(`[Engine] tiles truncado em ${MAX_SPARSE_TILES} entradas.`);
                break;
            }

            let x: number;
            let y: number;
            let id: number;

            if (Array.isArray(entry) && entry.length >= 3) {
                x = Math.floor(Number(entry[0]));
                y = Math.floor(Number(entry[1]));
                id = Math.floor(Number(entry[2]));
            } else if (entry && typeof entry === 'object') {
                const obj = entry as Record<string, unknown>;
                x = Math.floor(Number(obj.x));
                y = Math.floor(Number(obj.y));
                id = Math.floor(Number(obj.id));
            } else {
                continue;
            }

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(id)) continue;
            if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) continue;
            if (id < -2 || id > MAX_TILE_ID) continue;

            const cell: MapTileEntry = { x, y, id };
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                const refRaw = (entry as Record<string, unknown>).ref;
                if (typeof refRaw === 'string' && refRaw.trim()) {
                    cell.ref = refRaw.trim().slice(0, 256);
                }
            }

            floorTiles.push(cell);
            total++;
        }

        if (floorTiles.length > 0) {
            out[String(z)] = floorTiles;
        }
    }

    return out;
}

export function sanitizeSpawnPoint(
    raw: unknown,
    fallback: SpawnPoint,
    mapSize: number = MAP_SIZE
): SpawnPoint {
    const maxCoord = Math.max(0, mapSize - 1);
    const fbZ = Math.max(MIN_FLOOR_Z, Math.min(MAX_FLOOR_Z, Math.floor(fallback.z)));
    const fbX = Math.max(0, Math.min(maxCoord, Math.floor(fallback.x)));
    const fbY = Math.max(0, Math.min(maxCoord, Math.floor(fallback.y)));

    if (!raw || typeof raw !== 'object') {
        return { x: fbX, y: fbY, z: fbZ };
    }
    const obj = raw as Record<string, unknown>;
    if (
        !Number.isFinite(obj.x) ||
        !Number.isFinite(obj.y) ||
        !Number.isFinite(obj.z)
    ) {
        return { x: fbX, y: fbY, z: fbZ };
    }

    let x = Math.floor(Number(obj.x));
    let y = Math.floor(Number(obj.y));
    let z = Math.floor(Number(obj.z));
    let adjusted = false;

    if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) {
        x = fbX;
        y = fbY;
        adjusted = true;
    }
    if (z < MIN_FLOOR_Z || z > MAX_FLOOR_Z) {
        z = fbZ;
        adjusted = true;
    }
    if (adjusted) {
        console.warn('[Engine] Ponto spawn do jogador ajustado aos limites válidos.');
    }

    return { x, y, z };
}

function sanitizeSpawnName(name: unknown): string {
    if (typeof name !== 'string') return 'Unknown';
    const cleaned = name.trim().slice(0, 48);
    return cleaned.length > 0 ? cleaned : 'Unknown';
}

function isValidMetadataKey(key: string, mapSize: number): boolean {
    const m = /^(-?\d+)_(\d+)_(\d+)$/.exec(key);
    if (!m) return false;
    const z = Number(m[1]);
    const y = Number(m[2]);
    const x = Number(m[3]);
    return (
        z >= MIN_FLOOR_Z &&
        z <= MAX_FLOOR_Z &&
        y >= 0 &&
        x >= 0 &&
        y < mapSize &&
        x < mapSize
    );
}

function clampOptionalUint(n: unknown, max: number): number | undefined {
    if (!Number.isFinite(n)) return undefined;
    const v = Math.floor(Number(n));
    if (v < 0 || v > max) return undefined;
    return v;
}

export function sanitizeMetadata(
    raw: unknown,
    mapSize: number
): Record<string, TileMetadata> {
    const out: Record<string, TileMetadata> = {};
    if (!raw || typeof raw !== 'object') return out;

    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > MAX_METADATA_KEYS) {
        console.warn(
            `[Engine] metadata truncada: havia ${entries.length} entradas, limite ${MAX_METADATA_KEYS}.`
        );
    }

    const limit = Math.min(entries.length, MAX_METADATA_KEYS);
    let skipped = 0;

    for (let i = 0; i < limit; i++) {
        const [key, rawVal] = entries[i];
        if (!rawVal || typeof rawVal !== 'object') {
            skipped++;
            continue;
        }
        if (!isValidMetadataKey(key, mapSize)) {
            skipped++;
            continue;
        }

        const v = rawVal as Record<string, unknown>;
        const meta: TileMetadata = {};

        const zoneIdRaw = clampOptionalUint(v.zoneId, VALID_ZONE_MAX);
        if (zoneIdRaw !== undefined && zoneIdRaw > 0) {
            meta.zoneId = zoneIdRaw;
            if (zoneIdRaw === ZoneType.HOUSE) {
                const hid = clampOptionalUint(v.houseId, MAX_LARGE_INT);
                if (hid !== undefined && hid >= 1) {
                    meta.houseId = hid;
                }
            }
        }

        const actionId = clampOptionalUint(v.actionId, MAX_LARGE_INT);
        if (actionId !== undefined && actionId > 0) meta.actionId = actionId;

        const uniqueId = clampOptionalUint(v.uniqueId, MAX_LARGE_INT);
        if (uniqueId !== undefined && uniqueId > 0) meta.uniqueId = uniqueId;

        if (Object.keys(meta).length > 0) {
            out[key] = meta;
        } else skipped++;
    }

    if (skipped > 0) {
        console.warn(`[Engine] ${skipped} entrada(s) de metadata ignorada(s) na importação.`);
    }
    return out;
}

export function sanitizeHouses(raw: unknown, mapSize: number): Record<number, HouseData> {
    const out: Record<number, HouseData> = {};
    if (!raw || typeof raw !== 'object') return out;

    const entries = Object.entries(raw as Record<string, unknown>);
    let count = 0;
    let skipped = 0;

    const maxCoord = Math.max(0, mapSize - 1);

    for (const [numKey, val] of entries) {
        if (count >= MAX_HOUSE_ENTRIES) break;
        if (!val || typeof val !== 'object') {
            skipped++;
            continue;
        }

        const id = Number(numKey);
        if (!Number.isFinite(id) || id < 1 || id > MAX_LARGE_INT) {
            skipped++;
            continue;
        }

        const o = val as Record<string, unknown>;
        const rent = Number(o.rent);
        const entryX = Number(o.entryX);
        const entryY = Number(o.entryY);
        const entryZ = Number(o.entryZ);

        if (
            !Number.isFinite(rent) ||
            !Number.isFinite(entryX) ||
            !Number.isFinite(entryY) ||
            !Number.isFinite(entryZ)
        ) {
            skipped++;
            continue;
        }

        const nameRaw = typeof o.name === 'string' ? o.name.trim().slice(0, MAX_HOUSE_NAME_CHARS) : '';
        let ownerStr: string | undefined;
        if (typeof o.owner === 'string') {
            const otrim = o.owner.trim().slice(0, MAX_HOUSE_NAME_CHARS);
            if (otrim) ownerStr = otrim;
        }

        const house: HouseData = {
            id: Math.floor(id),
            name: nameRaw.length ? nameRaw : `House ${Math.floor(id)}`,
            rent: Math.max(0, Math.floor(rent)),
            entryX: Math.max(0, Math.min(maxCoord, Math.floor(entryX))),
            entryY: Math.max(0, Math.min(maxCoord, Math.floor(entryY))),
            entryZ: Math.max(MIN_FLOOR_Z, Math.min(MAX_FLOOR_Z, Math.floor(entryZ))),
        };

        if (ownerStr !== undefined) house.owner = ownerStr;

        out[Math.floor(id)] = house;
        count++;
    }

    if (skipped > 0) {
        console.warn(`[Engine] ${skipped} casa(s) inválida(s) ignoradas na importação.`);
    }
    if (entries.length > MAX_HOUSE_ENTRIES) {
        console.warn(
            `[Engine] só as primeiras ${MAX_HOUSE_ENTRIES} entradas de houses foram avaliadas.`
        );
    }

    return out;
}

export function sanitizeCreatureSpawns(
    rawSpawns: unknown,
    mapSize: number = MAP_SIZE
): CreatureSpawn[] {
    if (!Array.isArray(rawSpawns)) return [];

    const safeSpawns: CreatureSpawn[] = [];
    const seenTiles = new Set<string>();
    const seenIds = new Set<string>();

    const total = Math.min(rawSpawns.length, MAX_SPAWNS_PER_MAP);
    let dropped = 0;

    for (let i = 0; i < total; i++) {
        const entry = rawSpawns[i];
        if (!entry || typeof entry !== 'object') {
            dropped++;
            continue;
        }
        const item = entry as Record<string, unknown>;
        const type = item.type;

        if (type !== 'monster' && type !== 'npc') {
            dropped++;
            continue;
        }

        const xf = Number(item.x);
        const yf = Number(item.y);
        const zf = Number(item.z);
        if (!Number.isFinite(xf) || !Number.isFinite(yf) || !Number.isFinite(zf)) {
            dropped++;
            continue;
        }

        const intX = Math.floor(xf);
        const intY = Math.floor(yf);
        const intZ = Math.floor(zf);

        if (intX !== xf || intY !== yf || intZ !== zf) {
            dropped++;
            continue;
        }

        if (
            intX < 0 ||
            intY < 0 ||
            intX >= mapSize ||
            intY >= mapSize ||
            intZ < MIN_FLOOR_Z ||
            intZ > MAX_FLOOR_Z
        ) {
            dropped++;
            continue;
        }

        const tileKey = `${intX}_${intY}_${intZ}`;
        if (seenTiles.has(tileKey)) {
            dropped++;
            continue;
        }
        seenTiles.add(tileKey);

        let baseId =
            typeof item.id === 'string' && item.id.trim().length > 0
                ? item.id.trim().slice(0, 96)
                : `spawn_import_${i}`;
        let idFinal = baseId;
        let suffix = 1;
        while (seenIds.has(idFinal)) {
            idFinal = `${baseId.slice(0, 88)}_${suffix++}`;
        }
        seenIds.add(idFinal);

        safeSpawns.push({
            id: idFinal,
            name: sanitizeSpawnName(item.name),
            x: intX,
            y: intY,
            z: intZ,
            type,
        });
    }

    if (rawSpawns.length > MAX_SPAWNS_PER_MAP) {
        console.warn(
            `[Engine] Limite de spawns excedido (${rawSpawns.length}). Mantidos apenas ${MAX_SPAWNS_PER_MAP}.`
        );
    }
    if (dropped > 0) {
        console.warn(`[Engine] ${dropped} spawn(s) inválido(s) foram ignorados na importação.`);
    }

    return safeSpawns;
}

export function sanitizePortals(
    rawPortals: unknown,
    mapSize: number = MAP_SIZE
): PortalData[] {
    if (!Array.isArray(rawPortals)) return [];

    const knownMapIds = getKnownMapIds();
    const safe: PortalData[] = [];
    const seenTiles = new Set<string>();
    const seenIds = new Set<string>();

    const total = Math.min(rawPortals.length, MAX_PORTALS_PER_MAP);
    let dropped = 0;
    let unknownTarget = 0;

    for (let i = 0; i < total; i++) {
        const entry = rawPortals[i];
        if (!entry || typeof entry !== 'object') {
            dropped++;
            continue;
        }
        const item = entry as Record<string, unknown>;

        const targetMapId =
            typeof item.targetMapId === 'string' ? item.targetMapId.trim().slice(0, 64) : '';
        if (!targetMapId) {
            dropped++;
            continue;
        }
        if (!knownMapIds.has(targetMapId)) {
            unknownTarget++;
            dropped++;
            continue;
        }

        const coords = [
            Number(item.targetX),
            Number(item.targetY),
            Number(item.targetZ),
            Number(item.tileX),
            Number(item.tileY),
            Number(item.tileZ),
        ];
        if (!coords.every(Number.isFinite)) {
            dropped++;
            continue;
        }

        const [targetX, targetY, targetZ, tileX, tileY, tileZ] = coords.map(Math.floor);
        if (
            tileX < 0 ||
            tileY < 0 ||
            tileX >= mapSize ||
            tileY >= mapSize ||
            tileZ < MIN_FLOOR_Z ||
            tileZ > MAX_FLOOR_Z ||
            targetX < 0 ||
            targetY < 0 ||
            targetX >= mapSize ||
            targetY >= mapSize ||
            targetZ < MIN_FLOOR_Z ||
            targetZ > MAX_FLOOR_Z
        ) {
            dropped++;
            continue;
        }

        const tileKey = `${tileX}_${tileY}_${tileZ}`;
        if (seenTiles.has(tileKey)) {
            dropped++;
            continue;
        }
        seenTiles.add(tileKey);

        let baseId =
            typeof item.id === 'string' && item.id.trim().length > 0
                ? item.id.trim().slice(0, 96)
                : `portal_import_${i}`;
        let idFinal = baseId;
        let suffix = 1;
        while (seenIds.has(idFinal)) {
            idFinal = `${baseId.slice(0, 88)}_${suffix++}`;
        }
        seenIds.add(idFinal);

        safe.push({
            id: idFinal,
            targetMapId,
            targetX,
            targetY,
            targetZ,
            tileX,
            tileY,
            tileZ,
        });
    }

    if (rawPortals.length > MAX_PORTALS_PER_MAP) {
        console.warn(
            `[Engine] Limite de portais excedido (${rawPortals.length}). Mantidos ${MAX_PORTALS_PER_MAP}.`
        );
    }
    if (unknownTarget > 0) {
        console.warn(
            `[Engine] ${unknownTarget} portal(is) com targetMapId desconhecido foram descartados.`
        );
    }
    if (dropped > 0) {
        console.warn(`[Engine] ${dropped} portal(is) inválido(s) ignorados na importação.`);
    }

    return safe;
}

/**
 * Repara grades `worldMap[z][y][x]`: dimensões `size × size` e valores de tile numéricos.
 */
export function repairWorldMapGrids(worldMap: WorldMap, size: number): WorldMap {
    for (let z = MIN_FLOOR_Z; z <= MAX_FLOOR_Z; z++) {
        if (!worldMap[z] || !Array.isArray(worldMap[z])) {
            worldMap[z] = Array(size)
                .fill(0)
                .map(() => Array(size).fill(EMPTY_TILE_ID));
            continue;
        }

        while (worldMap[z].length < size) {
            worldMap[z].push(Array(size).fill(EMPTY_TILE_ID));
        }
        if (worldMap[z].length > size) {
            worldMap[z] = worldMap[z].slice(0, size);
            console.warn(`[Engine] Andar ${z}: linhas excedentes removidas (${size}×${size}).`);
        }

        for (let y = 0; y < size; y++) {
            const row = worldMap[z][y];
            const newRow: number[] = Array(size).fill(EMPTY_TILE_ID);
            const srcLen = Math.min(Array.isArray(row) ? row.length : 0, size);
            for (let x = 0; x < srcLen; x++) {
                const v = row[x];
                const okTile =
                    typeof v === 'number' &&
                    Number.isFinite(v) &&
                    Number.isSafeInteger(v) &&
                    v >= -1 &&
                    v <= MAX_TILE_ID;
                newRow[x] = okTile ? v : EMPTY_TILE_ID;
            }
            worldMap[z][y] = newRow;
        }
    }

    return worldMap;
}
