import fs from 'node:fs';
import path from 'node:path';
import { paths, type AppPaths } from '../config/paths.js';

export const MAX_MAP_SAVE_BYTES = 20 * 1024 * 1024;

export interface GameConfig {
    charactersDir: string;
    mapsDir: string;
    tilesDir: string;
}

export function getGameConfig(): GameConfig {
    if (fs.existsSync(paths.gameConfigPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(paths.gameConfigPath, 'utf-8'));
            return {
                charactersDir: parsed.charactersDir || 'tiles/characters',
                mapsDir: parsed.mapsDir || 'public/maps',
                tilesDir: parsed.tilesDir || 'tiles',
            };
        } catch (e) {
            console.error('[Studio] Erro ao ler game_config.json:', e);
        }
    }
    return {
        charactersDir: 'tiles/characters',
        mapsDir: 'public/maps',
        tilesDir: 'tiles',
    };
}

export function mapsTilesDir(p: AppPaths = paths): string {
    return path.join(p.tilesDir, 'maps');
}

/** Ícones de inventário — `tiles/items/icons/` (fora do tile registry). */
export function itemIconsDir(p: AppPaths = paths): string {
    return path.join(p.tilesDir, 'items', 'icons');
}

export function resolveTilesRelative(relative: string, p: AppPaths = paths): string {
    const clean = relative.replace(/^tiles\//, '');
    return path.join(p.tilesDir, clean);
}

export function sanitizeMapSaveFilename(filename: unknown): string | null {
    if (typeof filename !== 'string') return null;
    const base = filename.replace(/^.*[/\\]/, '').trim().toLowerCase();
    const withExt = base.endsWith('.json') ? base : `${base}.json`;
    const id = withExt.slice(0, -5);
    if (!id || !/^[a-z0-9_-]+$/.test(id)) return null;
    return withExt;
}

/** Chave de tile_properties / basename do PNG (sem extensão). */
export function normalizeMapSpriteFileKey(raw: string): string {
    return raw.trim().toLowerCase().replace(/\.png$/i, '');
}

/** Chave derivada do nome exibido ao criar sprite nova. */
export function fileKeyFromDisplayName(name: string): string {
    return String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/** Variantes com hífen/underscore para compatibilidade com entradas antigas. */
export function alternateMapSpriteFileKeys(fileKey: string): string[] {
    const norm = normalizeMapSpriteFileKey(fileKey);
    const variants = new Set<string>([norm]);
    if (norm.includes('-')) variants.add(norm.replace(/-/g, '_'));
    if (norm.includes('_')) variants.add(norm.replace(/_/g, '-'));
    variants.add(norm.replace(/[^a-z0-9]/g, '_'));
    return [...variants];
}

export function lookupTileProperties(
    properties: Record<string, Record<string, unknown>>,
    fileKey: string
): Record<string, unknown> {
    for (const key of alternateMapSpriteFileKeys(fileKey)) {
        const entry = properties[key];
        if (entry && typeof entry === 'object') return entry;
    }
    return {};
}

export function resolveMapSpriteFileKey(options: {
    explicitFileKey?: unknown;
    displayName?: unknown;
}): string | null {
    if (typeof options.explicitFileKey === 'string') {
        const key = normalizeMapSpriteFileKey(options.explicitFileKey);
        if (/^[a-z0-9_-]+$/.test(key)) return key;
    }
    if (typeof options.displayName === 'string' && options.displayName.trim()) {
        const key = fileKeyFromDisplayName(options.displayName);
        if (/^[a-z0-9_-]+$/.test(key)) return key;
    }
    return null;
}

export function mergeMapSpriteCalibrationEntry(
    entry: Record<string, unknown>,
    properties: Record<string, unknown> | undefined
): void {
    if (!properties) return;
    const intFields = [
        'frameWidth', 'frameHeight', 'offsetX', 'offsetY', 'gapX', 'gapY', 'gridCols', 'gridRows', 'anchorX', 'anchorY',
    ] as const;
    for (const key of intFields) {
        const v = properties[key];
        if (v !== undefined && v !== null) {
            const numVal = typeof v === 'number' ? v : parseFloat(String(v));
            if (Number.isFinite(numVal)) {
                entry[key] = Math.floor(numVal);
            }
        }
    }
    const layout = properties.sheetLayout;
    if (layout === 'horizontal' || layout === 'vertical') entry.sheetLayout = layout;
}

export function sanitizeMapSpriteFilename(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeMapSpriteSubPath(category: unknown): string {
    if (!category) return '';
    let sanitizedCategory = String(category)
        .replace(/[^a-zA-Z0-9_\-/]/g, '')
        .replace(/\.\./g, '');
    sanitizedCategory = sanitizedCategory
        .replace(/^(tiles\/)?(maps|terrain|items)\//i, '')
        .replace(/^(tiles\/)?(maps|terrain|items)$/i, '');
    return sanitizedCategory;
}

export function readAutoBorderManifest(p: AppPaths = paths) {
    if (!fs.existsSync(p.autoBorderSetsPath)) return { version: 1, sets: {} as Record<string, unknown> };
    try {
        const parsed = JSON.parse(fs.readFileSync(p.autoBorderSetsPath, 'utf-8')) as {
            version?: number;
            sets?: Record<string, unknown>;
        };
        return { version: parsed.version ?? 1, sets: parsed.sets ?? {} };
    } catch {
        return { version: 1, sets: {} as Record<string, unknown> };
    }
}

export function writeAutoBorderManifest(
    data: { version: number; sets: Record<string, unknown> },
    p: AppPaths = paths
): void {
    fs.writeFileSync(p.autoBorderSetsPath, JSON.stringify(data, null, 2));
}

export function writePngBase64(targetPath: string, spriteBase64: string): void {
    if (!spriteBase64.startsWith('data:image/png;base64,')) return;
    const imageBuffer = Buffer.from(spriteBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(targetPath, imageBuffer);
}

export function borderSetManifestToListEntry(setId: string, entry: Record<string, unknown>) {
    const category = String(entry.category ?? '');
    const sheetFile = String(entry.sheetFile ?? `${setId}_sheet`);
    const sheetRelativePath = category
        ? `tiles/maps/${category}/${sheetFile}.png`
        : `tiles/maps/${sheetFile}.png`;
    return {
        id: setId,
        label: String(entry.label ?? setId),
        fillTerrain: String(entry.fillTerrain ?? 'grass'),
        category,
        sheetFile,
        sheetRelativePath,
        calibration: entry.calibration ?? {},
        cells: entry.cells ?? [],
        masks: entry.masks ?? {},
        walkable: entry.walkable !== false,
    };
}

export function getBorderSetManifestEntry(setId: string, p: AppPaths = paths) {
    const manifest = readAutoBorderManifest(p);
    const entry = manifest.sets[setId];
    return entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
}

export function refMatchesMapSprite(ref: string, filename: string): boolean {
    return ref === filename || ref.startsWith(`${filename}#`);
}

export function getJsonFiles(dir: string, filesList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return filesList;
    for (const file of fs.readdirSync(dir)) {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) getJsonFiles(name, filesList);
        else if (file.endsWith('.json') && !file.endsWith('.calibration.json')) filesList.push(name);
    }
    return filesList;
}

export function getSubdirectories(dir: string, baseDir: string, foldersList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return foldersList;
    for (const file of fs.readdirSync(dir)) {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) {
            foldersList.push(path.relative(baseDir, name).replace(/\\/g, '/'));
            getSubdirectories(name, baseDir, foldersList);
        }
    }
    return foldersList;
}

export function getPngFiles(dir: string, filesList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return filesList;
    for (const file of fs.readdirSync(dir)) {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) getPngFiles(name, filesList);
        else if (file.endsWith('.png')) filesList.push(name);
    }
    return filesList;
}

export function findMapSpritePngPath(filename: string, category?: string, p: AppPaths = paths): string | null {
    const mapsDir = mapsTilesDir(p);
    if (category) {
        const direct = path.join(mapsDir, category, `${filename}.png`);
        if (fs.existsSync(direct)) return direct;
    }
    const walk = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            if (fs.statSync(full).isDirectory()) {
                const nested = walk(full);
                if (nested) return nested;
            } else if (entry === `${filename}.png`) return full;
        }
        return null;
    };
    return walk(mapsDir);
}

export function collectBorderSetFilenames(setId: string, p: AppPaths = paths): string[] {
    const entry = getBorderSetManifestEntry(setId, p);
    const filenames = new Set<string>();
    if (entry) {
        filenames.add(String(entry.sheetFile ?? `${setId}_sheet`));
        for (const filename of Object.values((entry.masks ?? {}) as Record<string, string>)) {
            if (filename) filenames.add(filename);
        }
    }
    if (fs.existsSync(p.tilePropertiesPath)) {
        try {
            const props = JSON.parse(fs.readFileSync(p.tilePropertiesPath, 'utf-8')) as Record<
                string,
                { borderSetId?: string }
            >;
            for (const [key, val] of Object.entries(props)) {
                if (val?.borderSetId === setId) filenames.add(key);
            }
        } catch {
            // ignore
        }
    }
    return [...filenames];
}

function countRefsInMap(
    content: Record<string, unknown>,
    match: (ref: string) => boolean
): number {
    let cellCount = 0;
    const tileRefs = content.tileRefs as Record<string, { ref?: string }> | undefined;
    const countRef = (ref: unknown, id?: unknown): void => {
        if (typeof ref === 'string' && match(ref)) {
            cellCount++;
            return;
        }
        if (id !== undefined && tileRefs) {
            const fromCatalog = tileRefs[String(id)]?.ref;
            if (typeof fromCatalog === 'string' && match(fromCatalog)) cellCount++;
        }
    };
    const scan = (entries: unknown): void => {
        if (!Array.isArray(entries)) return;
        for (const item of entries) {
            if (Array.isArray(item) && item.length >= 3) countRef(undefined, item[2]);
            else if (item && typeof item === 'object') {
                const obj = item as { ref?: string; id?: number };
                countRef(obj.ref, obj.id);
            }
        }
    };
    if (content.tiles && typeof content.tiles === 'object') {
        for (const entries of Object.values(content.tiles as Record<string, unknown>)) scan(entries);
    }
    if (Array.isArray(content.sparseTiles)) {
        for (const e of content.sparseTiles) {
            if (Array.isArray(e) && e.length >= 4) countRef(undefined, e[3]);
        }
    }
    const layers = content.layers as { border?: Record<string, unknown> } | undefined;
    if (layers?.border) {
        for (const entries of Object.values(layers.border)) scan(entries);
    }
    return cellCount;
}

export function collectMapSpriteUsage(filename: string, p: AppPaths = paths) {
    const maps: Array<{ mapId: string; mapFile: string; cellCount: number }> = [];
    let totalCells = 0;
    if (fs.existsSync(p.mapsDir)) {
        for (const mapFile of fs.readdirSync(p.mapsDir).filter((f) => f.endsWith('.json'))) {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(p.mapsDir, mapFile), 'utf-8'));
                const cellCount = countRefsInMap(content, (ref) => refMatchesMapSprite(ref, filename));
                if (cellCount > 0) {
                    maps.push({
                        mapId: typeof content.mapId === 'string' ? content.mapId : mapFile.replace(/\.json$/, ''),
                        mapFile,
                        cellCount,
                    });
                    totalCells += cellCount;
                }
            } catch (err) {
                console.warn(`[Studio] Erro ao escanear mapa ${mapFile}:`, err);
            }
        }
    }
    const variantGroups: string[] = [];
    let isPreviewTile = false;
    if (fs.existsSync(p.tileVariantGroupsPath)) {
        try {
            const vg = JSON.parse(fs.readFileSync(p.tileVariantGroupsPath, 'utf-8'));
            for (const [groupKey, group] of Object.entries(vg.groups ?? {})) {
                const preview = (group as { previewTileFileKey?: string }).previewTileFileKey;
                if (preview === filename) {
                    variantGroups.push(groupKey);
                    isPreviewTile = true;
                }
            }
        } catch (err) {
            console.warn('[Studio] Erro ao ler tile_variant_groups.json:', err);
        }
    }
    if (fs.existsSync(p.tilePropertiesPath)) {
        try {
            const props = JSON.parse(fs.readFileSync(p.tilePropertiesPath, 'utf-8'));
            const group = props[filename]?.variantGroup;
            if (typeof group === 'string' && group.trim() && !variantGroups.includes(group.trim())) {
                variantGroups.push(group.trim());
            }
        } catch {
            // ignore
        }
    }
    return { filename, maps, totalCells, variantGroups, isPreviewTile };
}

export function collectBorderSetUsage(setId: string, p: AppPaths = paths) {
    const entry = getBorderSetManifestEntry(setId, p);
    const label = entry ? String(entry.label ?? setId) : setId;
    const filenameSet = new Set(collectBorderSetFilenames(setId, p));
    const maps: Array<{ mapId: string; mapFile: string; cellCount: number }> = [];
    let totalCells = 0;
    if (filenameSet.size === 0 || !fs.existsSync(p.mapsDir)) {
        return { setId, label, maps, totalCells };
    }
    for (const mapFile of fs.readdirSync(p.mapsDir).filter((f) => f.endsWith('.json'))) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(p.mapsDir, mapFile), 'utf-8'));
            const cellCount = countRefsInMap(content, (ref) =>
                [...filenameSet].some((fn) => refMatchesMapSprite(ref, fn))
            );
            if (cellCount > 0) {
                maps.push({
                    mapId: typeof content.mapId === 'string' ? content.mapId : mapFile.replace(/\.json$/, ''),
                    mapFile,
                    cellCount,
                });
                totalCells += cellCount;
            }
        } catch (err) {
            console.warn(`[Studio] Erro ao escanear mapa ${mapFile} (border-set):`, err);
        }
    }
    return { setId, label, maps, totalCells };
}

export function deleteBorderSetFromDisk(setId: string, p: AppPaths = paths) {
    const entry = getBorderSetManifestEntry(setId, p);
    if (!entry) throw new Error(`Conjunto auto-borda "${setId}" não encontrado.`);
    const category = String(entry.category ?? '');
    const targetDir = path.join(mapsTilesDir(p), category);
    const sheetFile = String(entry.sheetFile ?? `${setId}_sheet`);
    const masks = (entry.masks ?? {}) as Record<string, string>;
    const filenames = new Set<string>([sheetFile, ...Object.values(masks)]);
    let allProperties: Record<string, unknown> = {};
    if (fs.existsSync(p.tilePropertiesPath)) {
        allProperties = JSON.parse(fs.readFileSync(p.tilePropertiesPath, 'utf-8'));
        for (const [key, val] of Object.entries(allProperties)) {
            if ((val as { borderSetId?: string })?.borderSetId === setId) filenames.add(key);
        }
    }
    const deletedFiles: string[] = [];
    for (const filename of filenames) {
        const pngPath = path.join(targetDir, `${filename}.png`);
        if (fs.existsSync(pngPath)) {
            fs.unlinkSync(pngPath);
            deletedFiles.push(pngPath);
        }
    }
    const removedProperties: string[] = [];
    for (const filename of filenames) {
        if (allProperties[filename]) {
            delete allProperties[filename];
            removedProperties.push(filename);
        }
    }
    if (removedProperties.length > 0) {
        fs.writeFileSync(p.tilePropertiesPath, JSON.stringify(allProperties, null, 2));
    }
    const manifest = readAutoBorderManifest(p);
    delete manifest.sets[setId];
    writeAutoBorderManifest(manifest, p);
    if (fs.existsSync(targetDir)) {
        try {
            if (fs.readdirSync(targetDir).length === 0) fs.rmdirSync(targetDir);
        } catch {
            // ignore
        }
    }
    return { deletedFiles, removedProperties };
}

export function updateVariantGroupsAfterSpriteDelete(filename: string, p: AppPaths = paths): void {
    if (!fs.existsSync(p.tileVariantGroupsPath)) return;
    const vg = JSON.parse(fs.readFileSync(p.tileVariantGroupsPath, 'utf-8'));
    const groups = (vg.groups ?? {}) as Record<string, { previewTileFileKey?: string }>;
    const props: Record<string, { variantGroup?: string }> = fs.existsSync(p.tilePropertiesPath)
        ? JSON.parse(fs.readFileSync(p.tilePropertiesPath, 'utf-8'))
        : {};
    for (const [groupKey, group] of Object.entries(groups)) {
        if (group.previewTileFileKey !== filename) continue;
        const remaining = Object.entries(props)
            .filter(([key, val]) => key !== filename && val?.variantGroup === groupKey)
            .map(([key]) => key);
        if (remaining.length === 0) delete groups[groupKey];
        else group.previewTileFileKey = remaining[0];
    }
    vg.groups = groups;
    fs.writeFileSync(p.tileVariantGroupsPath, JSON.stringify(vg, null, 2));
}

export function collectCharacterUsage(relativePath: string, p: AppPaths = paths) {
    const config = getGameConfig();
    const configPath = `${config.charactersDir}/${relativePath}`.replace(/\\/g, '/');
    let presetName: string | null = null;
    if (fs.existsSync(p.creaturePresetsPath)) {
        try {
            const presets = JSON.parse(fs.readFileSync(p.creaturePresetsPath, 'utf-8'));
            if (Array.isArray(presets)) {
                const found = presets.find(
                    (item) => item && typeof item === 'object' && item.configPath === configPath
                );
                if (found) presetName = found.name;
            }
        } catch (e) {
            console.warn('[Studio] Erro ao ler creature_presets.json:', e);
        }
    }
    const maps: Array<{ mapId: string; mapFile: string; spawnCount: number }> = [];
    let totalSpawns = 0;
    if (presetName && fs.existsSync(p.mapsDir)) {
        for (const mapFile of fs.readdirSync(p.mapsDir).filter((f) => f.endsWith('.json'))) {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(p.mapsDir, mapFile), 'utf-8'));
                let spawnCount = 0;
                if (Array.isArray(content.spawns)) {
                    for (const spawn of content.spawns) {
                        if (spawn && spawn.name === presetName) spawnCount++;
                    }
                }
                if (spawnCount > 0) {
                    maps.push({
                        mapId: typeof content.mapId === 'string' ? content.mapId : mapFile.replace(/\.json$/, ''),
                        mapFile,
                        spawnCount,
                    });
                    totalSpawns += spawnCount;
                }
            } catch (err) {
                console.warn(`[Studio] Erro ao escanear spawns em ${mapFile}:`, err);
            }
        }
    }
    return { relativePath, presetName, maps, totalSpawns };
}
