import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCreaturePresetEntry } from '../../../src/game-data/mobPresetTypes.js';
import { sanitizeItemCatalogDocument, findUnknownLootItemIds } from '../../../src/game-data/itemCatalogTypes.js';
import { paths } from '../config/paths.js';
import { refreshServerMapEntry } from '../mapRegistry.js';
import type { MapCollisionStore } from '../MapCollisionStore.js';
import {
    MAX_MAP_SAVE_BYTES,
    alternateMapSpriteFileKeys,
    borderSetManifestToListEntry,
    collectBorderSetUsage,
    collectCharacterUsage,
    collectMapSpriteUsage,
    deleteBorderSetFromDisk,
    fileKeyFromDisplayName,
    findMapSpritePngPath,
    getBorderSetManifestEntry,
    getGameConfig,
    getJsonFiles,
    getPngFiles,
    getSubdirectories,
    lookupTileProperties,
    mapsTilesDir,
    mergeMapSpriteCalibrationEntry,
    normalizeMapSpriteFileKey,
    readAutoBorderManifest,
    resolveMapSpriteFileKey,
    resolveTilesRelative,
    sanitizeMapSaveFilename,
    sanitizeMapSpriteFilename,
    sanitizeMapSpriteSubPath,
    updateVariantGroupsAfterSpriteDelete,
    writeAutoBorderManifest,
    writePngBase64,
} from './helpers.js';

export interface ApiResult {
    status: number;
    body: unknown;
}

export class StudioService {
    private collision?: MapCollisionStore;

    setCollisionStore(collision: MapCollisionStore): void {
        this.collision = collision;
    }

    getSpriteUsage(filenameParam: unknown): ApiResult {
        const filename = sanitizeMapSpriteFilename(filenameParam);
        if (!filename) return { status: 400, body: { error: 'Parâmetro filename inválido.' } };
        return { status: 200, body: collectMapSpriteUsage(filename) };
    }

    deleteMapSprite(filenameParam: unknown, categoryParam: unknown, force: boolean): ApiResult {
        const filename = sanitizeMapSpriteFilename(filenameParam);
        if (!filename) return { status: 400, body: { error: 'Parâmetro filename inválido.' } };
        const category = String(categoryParam ?? '')
            .replace(/[^a-zA-Z0-9_\-/]/g, '')
            .replace(/\.\./g, '');
        const usage = collectMapSpriteUsage(filename);
        if (!force && usage.totalCells > 0) {
            return {
                status: 409,
                body: {
                    error: `Sprite em uso em ${usage.maps.length} mapa(s).`,
                    maps: usage.maps,
                    totalCells: usage.totalCells,
                },
            };
        }
        const pngPath = findMapSpritePngPath(filename, category || undefined);
        if (pngPath && fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
        if (fs.existsSync(paths.tilePropertiesPath)) {
            const allProperties = JSON.parse(fs.readFileSync(paths.tilePropertiesPath, 'utf-8'));
            let removed = false;
            for (const key of alternateMapSpriteFileKeys(filename)) {
                if (allProperties[key]) {
                    delete allProperties[key];
                    removed = true;
                }
            }
            if (removed) {
                fs.writeFileSync(paths.tilePropertiesPath, JSON.stringify(allProperties, null, 2));
            }
        }
        updateVariantGroupsAfterSpriteDelete(filename);
        return {
            status: 200,
            body: { success: true, filename, deletedPng: pngPath ?? null, variantGroups: usage.variantGroups },
        };
    }

    deleteCharacter(relativePath: string, force: boolean): ApiResult {
        if (!relativePath || relativePath.includes('..')) {
            return { status: 400, body: { error: 'Parâmetro relativePath inválido.' } };
        }
        const jsonPath = path.join(paths.charactersDir, relativePath);
        if (!fs.existsSync(jsonPath)) {
            return { status: 404, body: { error: 'Personagem não encontrado.' } };
        }
        const usage = collectCharacterUsage(relativePath);
        if (!force && usage.totalSpawns > 0) {
            return {
                status: 409,
                body: {
                    error: `Personagem em uso em ${usage.maps.length} mapa(s).`,
                    maps: usage.maps,
                    totalSpawns: usage.totalSpawns,
                },
            };
        }
        let spriteSheetUrl: string | undefined;
        try {
            const charConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            spriteSheetUrl = charConfig.spriteSheetUrl;
        } catch {
            // ignore
        }
        const config = getGameConfig();
        const cleanBase = config.charactersDir.replace(/\/+$/, '');
        if (spriteSheetUrl && typeof spriteSheetUrl === 'string' && spriteSheetUrl.startsWith(cleanBase + '/')) {
            const pngPath = resolveTilesRelative(spriteSheetUrl);
            if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
        }
        fs.unlinkSync(jsonPath);
        if (fs.existsSync(paths.creaturePresetsPath) && usage.presetName) {
            try {
                const presets = JSON.parse(fs.readFileSync(paths.creaturePresetsPath, 'utf-8'));
                if (Array.isArray(presets)) {
                    const filtered = presets.filter((p) => !p || p.name !== usage.presetName);
                    fs.writeFileSync(paths.creaturePresetsPath, JSON.stringify(filtered, null, 2) + '\n');
                }
            } catch {
                // ignore
            }
        }
        if (fs.existsSync(paths.outfitPresetsPath)) {
            try {
                const presets = JSON.parse(fs.readFileSync(paths.outfitPresetsPath, 'utf-8'));
                if (Array.isArray(presets)) {
                    const presetId = relativePath.split('/').pop()?.replace(/\.json$/, '');
                    if (presetId) {
                        const filtered = presets.filter((p) => !p || p.id !== presetId);
                        fs.writeFileSync(paths.outfitPresetsPath, JSON.stringify(filtered, null, 2) + '\n');
                    }
                }
            } catch {
                // ignore
            }
        }
        return {
            status: 200,
            body: {
                success: true,
                relativePath,
                deletedJson: jsonPath,
                deletedPng: spriteSheetUrl || null,
                presetRemoved: usage.presetName || null,
            },
        };
    }

    listMaps(): ApiResult {
        const entries = fs.existsSync(paths.mapsDir)
            ? fs
                  .readdirSync(paths.mapsDir)
                  .filter((f) => f.endsWith('.json'))
                  .map((f) => ({ name: f, mtime: fs.statSync(path.join(paths.mapsDir, f)).mtimeMs }))
                  .sort((a, b) => b.mtime - a.mtime)
            : [];
        return {
            status: 200,
            body: { success: true, files: entries.map((e) => e.name), latest: entries[0]?.name ?? null },
        };
    }

    listCharacters(): ApiResult {
        const charactersDir = paths.charactersDir;
        const jsonFiles = getJsonFiles(charactersDir);
        const folders = getSubdirectories(charactersDir, charactersDir);
        const characters = jsonFiles.map((filePath) => {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const relativePath = path.relative(charactersDir, filePath).replace(/\\/g, '/');
            return {
                name: content.name || path.basename(filePath, '.json'),
                category: content.category || '',
                relativePath,
                config: content,
            };
        });
        return { status: 200, body: { success: true, characters, folders } };
    }

    listMapSprites(): ApiResult {
        const tilesDir = paths.tilesDir;
        const mapsDir = mapsTilesDir();
        const allPngs = getPngFiles(mapsDir);
        const folders = getSubdirectories(mapsDir, mapsDir);
        let properties: Record<string, Record<string, unknown>> = {};
        if (fs.existsSync(paths.tilePropertiesPath)) {
            properties = JSON.parse(fs.readFileSync(paths.tilePropertiesPath, 'utf-8'));
        }
        const mapSprites = allPngs.map((filePath) => {
            const relativePath = path.relative(tilesDir, filePath).replace(/\\/g, '/');
            const filename = path.basename(filePath, '.png');
            const relativeToMaps = path.relative(mapsDir, filePath).replace(/\\/g, '/');
            const parts = relativeToMaps.split('/');
            const props = lookupTileProperties(properties, filename);
            const assetType = (props.assetType as string) || (parts[0] === 'items' ? 'items' : 'terrain');
            const category = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
            return {
                name: (props.nameOverride as string) || filename.replace(/_/g, ' '),
                filename,
                assetType,
                category,
                relativePath: `tiles/${relativePath}`,
                properties: props,
            };
        });
        return { status: 200, body: { success: true, sprites: mapSprites, folders } };
    }

    listAutoBorderSets(): ApiResult {
        const manifest = readAutoBorderManifest();
        const sets = Object.entries(manifest.sets).map(([setId, entry]) =>
            borderSetManifestToListEntry(setId, entry as Record<string, unknown>)
        );
        return { status: 200, body: { success: true, sets } };
    }

    borderSetUsage(setIdParam: unknown): ApiResult {
        const setId = sanitizeMapSpriteFilename(setIdParam);
        if (!setId) return { status: 400, body: { error: 'Parâmetro setId inválido.' } };
        if (!getBorderSetManifestEntry(setId)) {
            return { status: 404, body: { error: `Conjunto "${setId}" não encontrado.` } };
        }
        return { status: 200, body: collectBorderSetUsage(setId) };
    }

    deleteBorderSet(setIdParam: unknown, force: boolean): ApiResult {
        const setId = sanitizeMapSpriteFilename(setIdParam);
        if (!setId) return { status: 400, body: { error: 'Parâmetro setId inválido.' } };
        if (!getBorderSetManifestEntry(setId)) {
            return { status: 404, body: { error: `Conjunto "${setId}" não encontrado.` } };
        }
        const usage = collectBorderSetUsage(setId);
        if (!force && usage.totalCells > 0) {
            return {
                status: 409,
                body: {
                    error: `Conjunto em uso em ${usage.maps.length} mapa(s).`,
                    maps: usage.maps,
                    totalCells: usage.totalCells,
                },
            };
        }
        const result = deleteBorderSetFromDisk(setId);
        return {
            status: 200,
            body: {
                success: true,
                setId,
                label: usage.label,
                deletedFiles: result.deletedFiles.length,
                removedProperties: result.removedProperties,
            },
        };
    }

    saveBorderSet(parsed: Record<string, unknown>): ApiResult {
        const setId = sanitizeMapSpriteFilename(parsed.setId);
        if (!setId) return { status: 400, body: { error: 'ID do conjunto inválido.' } };
        const label = String(parsed.label ?? setId).trim() || setId;
        const fillTerrain = String(parsed.fillTerrain ?? 'grass').trim().toLowerCase() || 'grass';
        const subPath = sanitizeMapSpriteSubPath(parsed.category);
        const targetDir = path.join(mapsTilesDir(), subPath);
        fs.mkdirSync(targetDir, { recursive: true });
        const sheetFile = `${setId}_sheet`;
        if (parsed.sheetBase64) writePngBase64(path.join(targetDir, `${sheetFile}.png`), String(parsed.sheetBase64));
        const masksInput = Array.isArray(parsed.masks) ? parsed.masks : [];
        const masksMap: Record<string, string> = {};
        let allProperties: Record<string, unknown> = {};
        if (fs.existsSync(paths.tilePropertiesPath)) {
            allProperties = JSON.parse(fs.readFileSync(paths.tilePropertiesPath, 'utf-8'));
        }
        const isWalkable = parsed.walkable !== false;
        allProperties[sheetFile] = {
            nameOverride: `${label} (spritesheet)`,
            assetType: 'border',
            tileRole: 'border_sheet',
            borderSetId: setId,
            paletteCategory: 'border',
            walkable: isWalkable,
            speedModifier: 1.0,
            isStair: false,
        };
        const manifest = readAutoBorderManifest();
        const previousEntry = manifest.sets[setId] as Record<string, unknown> | undefined;
        for (const oldFilename of Object.values((previousEntry?.masks ?? {}) as Record<string, string>)) {
            delete allProperties[oldFilename];
            const oldPath = path.join(targetDir, `${oldFilename}.png`);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        for (const maskEntry of masksInput) {
            const m = maskEntry as { mask?: unknown; filename?: unknown; spriteBase64?: unknown };
            const maskNum = Math.floor(Number(m?.mask));
            const filename = sanitizeMapSpriteFilename(m?.filename) ?? `${setId}_mask_${maskNum}`;
            if (!Number.isFinite(maskNum) || maskNum < 1 || maskNum > 255) continue;
            if (m?.spriteBase64) writePngBase64(path.join(targetDir, `${filename}.png`), String(m.spriteBase64));
            masksMap[String(maskNum)] = filename;
            allProperties[filename] = {
                nameOverride: `${label} · máscara ${maskNum}`,
                assetType: 'border',
                tileRole: 'border_overlay',
                borderMask: maskNum,
                borderSetId: setId,
                paletteCategory: 'border',
                walkable: isWalkable,
                speedModifier: 1.0,
                isStair: false,
            };
        }
        const cal = (parsed.calibration ?? {}) as Record<string, unknown>;
        const cells = Array.isArray(cal.borderSetCells) ? cal.borderSetCells : [];
        const { borderSetCells: _ignored, ...calibrationFields } = cal;
        manifest.sets[setId] = {
            label,
            fillTerrain,
            category: subPath,
            sheetFile,
            calibration: calibrationFields,
            cells,
            masks: masksMap,
            walkable: isWalkable,
        };
        writeAutoBorderManifest(manifest);
        fs.writeFileSync(paths.tilePropertiesPath, JSON.stringify(allProperties, null, 2));
        return { status: 200, body: { success: true, setId, maskCount: Object.keys(masksMap).length } };
    }

    listTileProperties(): ApiResult {
        let properties = {};
        if (fs.existsSync(paths.tilePropertiesPath)) {
            properties = JSON.parse(fs.readFileSync(paths.tilePropertiesPath, 'utf-8'));
        }
        return { status: 200, body: { success: true, properties } };
    }

    saveMapSprite(body: Record<string, unknown>): ApiResult {
        const name = body.name as string;
        const assetType = body.assetType;
        const category = body.category;
        const spriteBase64 = body.spriteBase64;
        const properties = (body.properties ?? {}) as Record<string, unknown>;
        const fileKey =
            resolveMapSpriteFileKey({ explicitFileKey: body.fileKey, displayName: name }) ??
            fileKeyFromDisplayName(String(name));
        if (!fileKey) {
            return { status: 400, body: { error: 'Nome ou fileKey do sprite inválido.' } };
        }
        const previousFileKey =
            typeof body.previousFileKey === 'string'
                ? normalizeMapSpriteFileKey(body.previousFileKey)
                : '';
        const subPath = sanitizeMapSpriteSubPath(category);
        const targetDir = path.join(mapsTilesDir(), subPath);
        fs.mkdirSync(targetDir, { recursive: true });
        if (spriteBase64 && String(spriteBase64).startsWith('data:image/png;base64,')) {
            const imageBuffer = Buffer.from(String(spriteBase64).replace(/^data:image\/png;base64,/, ''), 'base64');
            fs.writeFileSync(path.join(targetDir, `${fileKey}.png`), imageBuffer);
        } else if (spriteBase64 && typeof spriteBase64 === 'string' && spriteBase64.includes('/tiles/')) {
            const urlParts = spriteBase64.split('/tiles/');
            const sourcePath = resolveTilesRelative('tiles/' + urlParts[urlParts.length - 1]);
            const imagePath = path.join(targetDir, `${fileKey}.png`);
            if (fs.existsSync(sourcePath) && sourcePath !== imagePath) {
                fs.copyFileSync(sourcePath, imagePath);
                fs.unlinkSync(sourcePath);
            }
        }
        let allProperties: Record<string, unknown> = {};
        if (fs.existsSync(paths.tilePropertiesPath)) {
            allProperties = JSON.parse(fs.readFileSync(paths.tilePropertiesPath, 'utf-8'));
        }
        if (previousFileKey && previousFileKey !== fileKey) {
            for (const staleKey of alternateMapSpriteFileKeys(previousFileKey)) {
                if (allProperties[staleKey]) {
                    delete allProperties[staleKey];
                }
            }
        }
        const entry: Record<string, unknown> = {
            walkable: properties.walkable ?? true,
            speedModifier: parseFloat(String(properties.speedModifier)) || 1.0,
            isStair: properties.isStair ?? false,
            stairDirection: properties.isStair ? 'up' : undefined,
            nameOverride: name,
            assetType,
        };
        if (properties.variantGroup && String(properties.variantGroup).trim()) {
            entry.variantGroup = String(properties.variantGroup).trim().toLowerCase();
        }
        if (properties.variantStripFrames && Number(properties.variantStripFrames) > 1) {
            entry.variantStripFrames = Math.floor(Number(properties.variantStripFrames));
        }
        mergeMapSpriteCalibrationEntry(entry, properties);
        allProperties[fileKey] = entry;
        fs.writeFileSync(paths.tilePropertiesPath, JSON.stringify(allProperties, null, 2));
        return { status: 200, body: { success: true, name, fileKey } };
    }

    saveMapSpritesBatch(body: Record<string, unknown>): ApiResult {
        const assetType = body.assetType;
        const category = body.category;
        const sprites = body.sprites;
        if (!Array.isArray(sprites) || sprites.length === 0) {
            return { status: 400, body: { error: 'Lista de sprites vazia.' } };
        }
        if (sprites.length > 100) {
            return { status: 400, body: { error: 'Máximo de 100 sprites por lote.' } };
        }
        const subPath = sanitizeMapSpriteSubPath(category);
        const targetDir = path.join(mapsTilesDir(), subPath);
        fs.mkdirSync(targetDir, { recursive: true });
        let allProperties: Record<string, unknown> = {};
        if (fs.existsSync(paths.tilePropertiesPath)) {
            allProperties = JSON.parse(fs.readFileSync(paths.tilePropertiesPath, 'utf-8'));
        }
        let savedCount = 0;
        for (const sprite of sprites) {
            const s = sprite as Record<string, unknown>;
            const spriteName = String(s.name);
            const spriteBase64 = s.spriteBase64;
            const properties = (s.properties ?? {}) as Record<string, unknown>;
            const filename = spriteName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (spriteBase64 && String(spriteBase64).startsWith('data:image/png;base64,')) {
                const imageBuffer = Buffer.from(String(spriteBase64).replace(/^data:image\/png;base64,/, ''), 'base64');
                fs.writeFileSync(path.join(targetDir, `${filename}.png`), imageBuffer);
                savedCount++;
            }
            const entry: Record<string, unknown> = {
                walkable: properties.walkable ?? true,
                speedModifier: parseFloat(String(properties.speedModifier)) || 1.0,
                isStair: properties.isStair ?? false,
                stairDirection: properties.isStair ? 'up' : undefined,
                nameOverride: spriteName,
                assetType: assetType ?? 'terrain',
            };
            if (properties.variantGroup && String(properties.variantGroup).trim()) {
                entry.variantGroup = String(properties.variantGroup).trim().toLowerCase();
            }
            if (properties.variantStripFrames && Number(properties.variantStripFrames) > 1) {
                entry.variantStripFrames = Math.floor(Number(properties.variantStripFrames));
            }
            mergeMapSpriteCalibrationEntry(entry, properties);
            allProperties[filename] = entry;
        }
        fs.writeFileSync(paths.tilePropertiesPath, JSON.stringify(allProperties, null, 2));
        return { status: 200, body: { success: true, saved: savedCount } };
    }

    saveMap(body: Record<string, unknown>, bodySize: number): ApiResult {
        if (bodySize > MAX_MAP_SAVE_BYTES) {
            return { status: 413, body: { error: 'JSON do mapa excede o limite de 20MB.' } };
        }
        const safeName = sanitizeMapSaveFilename(body.filename);
        if (!safeName) return { status: 400, body: { error: 'Nome de arquivo inválido.' } };
        if (typeof body.json === 'string' && String(body.json).trim()) {
            try {
                JSON.parse(String(body.json));
            } catch {
                return { status: 400, body: { error: 'Campo json não é JSON válido.' } };
            }
        } else if (!body.document || typeof body.document !== 'object') {
            return { status: 400, body: { error: 'Campo json ou document ausente ou inválido.' } };
        }
        fs.mkdirSync(paths.mapsDir, { recursive: true });
        const targetPath = path.join(paths.mapsDir, safeName);
        const normalizedMaps = path.normalize(paths.mapsDir + path.sep);
        if (!targetPath.startsWith(normalizedMaps)) {
            return { status: 400, body: { error: 'Caminho de destino não permitido.' } };
        }
        const fileContents =
            typeof body.json === 'string' && String(body.json).trim()
                ? String(body.json).endsWith('\n')
                    ? String(body.json)
                    : `${body.json}\n`
                : `${JSON.stringify(body.document, null, 2)}\n`;
        fs.writeFileSync(targetPath, fileContents, 'utf-8');
        const mapId = safeName.replace(/\.json$/i, '');
        refreshServerMapEntry(mapId);
        if (this.collision) {
            void this.collision.reloadTemplate(mapId, `maps/${safeName}`).catch((err) => {
                console.error(`[StudioService] Falha ao recarregar colisão do mapa ${mapId}:`, err);
            });
        }
        return { status: 200, body: { success: true, path: `public/maps/${safeName}` } };
    }

    saveTileCatalog(body: Record<string, unknown>): ApiResult {
        if (!body.catalog || typeof body.catalog !== 'object') {
            return { status: 400, body: { error: 'Campo catalog ausente ou inválido.' } };
        }
        fs.writeFileSync(paths.tileCatalogPath, `${JSON.stringify(body.catalog, null, 2)}\n`, 'utf-8');
        return { status: 200, body: { success: true, path: 'public/tile_catalog.json' } };
    }

    saveCharacter(body: Record<string, unknown>): ApiResult {
        const name = body.name as string;
        const category = body.category;
        const spriteBase64 = body.spriteBase64;
        const configJson = body.configJson as Record<string, unknown>;
        const filename = String(name).toLowerCase().replace(/[^a-z0-9]/g, '_');
        const config = getGameConfig();
        const baseDirClean = config.charactersDir.replace(/\/+$/, '');
        let subPath = '';
        if (category) {
            let sanitizedCategory = String(category)
                .replace(/[^a-zA-Z0-9_\-/]/g, '')
                .replace(/\.\./g, '');
            const basePrefixReg = new RegExp(`^(${baseDirClean}/|characters/|tiles/characters/)?`, 'i');
            sanitizedCategory = sanitizedCategory.replace(basePrefixReg, '');
            subPath = sanitizedCategory;
        }
        const targetDir = path.join(paths.charactersDir, subPath);
        fs.mkdirSync(targetDir, { recursive: true });
        let spriteSheetUrl = configJson.spriteSheetUrl as string;
        const relativeUrlPrefix = subPath ? `${baseDirClean}/${subPath}` : baseDirClean;
        if (spriteBase64 && String(spriteBase64).startsWith('data:image/png;base64,')) {
            const imageBuffer = Buffer.from(String(spriteBase64).replace(/^data:image\/png;base64,/, ''), 'base64');
            const imagePath = path.join(targetDir, `${filename}.png`);
            fs.writeFileSync(imagePath, imageBuffer);
            spriteSheetUrl = `${relativeUrlPrefix}/${filename}.png`;
        }
        configJson.spriteSheetUrl = spriteSheetUrl;
        fs.writeFileSync(path.join(targetDir, `${filename}.json`), JSON.stringify(configJson, null, 2));
        return { status: 200, body: { success: true, spriteSheetUrl, name: configJson.name } };
    }

    upsertCreaturePreset(entry: Record<string, unknown>): ApiResult {
        if (!entry || typeof entry.name !== 'string' || !String(entry.name).trim()) {
            throw new Error('Campo name é obrigatório.');
        }
        if (entry.type !== 'npc' && entry.type !== 'monster') {
            throw new Error('Campo type deve ser "npc" ou "monster".');
        }
        if (typeof entry.configPath !== 'string' || !String(entry.configPath).trim()) {
            throw new Error('Campo configPath é obrigatório.');
        }
        let presets: unknown[] = [];
        if (fs.existsSync(paths.creaturePresetsPath)) {
            const raw = JSON.parse(fs.readFileSync(paths.creaturePresetsPath, 'utf-8'));
            if (Array.isArray(raw)) presets = raw;
        }
        const idx = presets.findIndex(
            (p) => p && typeof p === 'object' && (p as { name?: string }).name === String(entry.name).trim()
        );
        const merged =
            idx >= 0 && presets[idx] && typeof presets[idx] === 'object'
                ? { ...(presets[idx] as Record<string, unknown>), ...entry }
                : entry;
        const sanitized = sanitizeCreaturePresetEntry(merged);
        if (!sanitized) {
            throw new Error('Entrada de creature preset inválida.');
        }
        if (idx >= 0) presets[idx] = sanitized;
        else presets.push(sanitized);
        fs.writeFileSync(paths.creaturePresetsPath, JSON.stringify(presets, null, 2) + '\n');
        return { status: 200, body: { success: true, preset: sanitized } };
    }

    upsertOutfitPreset(entry: Record<string, unknown>): ApiResult {
        if (!entry.id || !entry.name || !entry.vocationId || !entry.gender || !entry.spriteSheetUrl) {
            throw new Error('Campos id, name, vocationId, gender e spriteSheetUrl são obrigatórios.');
        }
        let presets: Record<string, unknown>[] = [];
        if (fs.existsSync(paths.outfitPresetsPath)) {
            try {
                presets = JSON.parse(fs.readFileSync(paths.outfitPresetsPath, 'utf-8'));
            } catch {
                presets = [];
            }
        }
        const sanitized = {
            id: entry.id,
            name: entry.name,
            vocationId: entry.vocationId,
            gender: entry.gender,
            spriteSheetUrl: entry.spriteSheetUrl,
            showInCreation: entry.showInCreation !== false,
        };
        const idx = presets.findIndex((p) => p && p.id === sanitized.id);
        if (idx >= 0) presets[idx] = sanitized;
        else presets.push(sanitized);
        fs.writeFileSync(paths.outfitPresetsPath, JSON.stringify(presets, null, 2) + '\n');
        return { status: 200, body: { success: true, preset: sanitized } };
    }

    getVocations(): ApiResult {
        if (!fs.existsSync(paths.vocationsJsonPath)) {
            const defaultVocations = {
              "knight": {
                "name": "Knight",
                "baseStats": {
                  "melee": 10,
                  "magicAttack": 1,
                  "distanceAttack": 2,
                  "defense": 10,
                  "attackSpeed": 900,
                  "defenseAttack": 8,
                  "health": 180,
                  "mana": 30
                },
                "growthPerLevel": {
                  "melee": 3,
                  "magicAttack": 0.3,
                  "distanceAttack": 0.5,
                  "defense": 2,
                  "health": 25,
                  "mana": 5
                }
              },
              "mage": {
                "name": "Mage",
                "baseStats": {
                  "melee": 2,
                  "magicAttack": 12,
                  "distanceAttack": 1,
                  "defense": 3,
                  "attackSpeed": 1100,
                  "defenseAttack": 2,
                  "health": 90,
                  "mana": 180
                },
                "growthPerLevel": {
                  "melee": 0.3,
                  "magicAttack": 4,
                  "distanceAttack": 0.2,
                  "defense": 0.8,
                  "health": 10,
                  "mana": 30
                }
              },
              "archer": {
                "name": "Archer",
                "baseStats": {
                  "melee": 4,
                  "magicAttack": 3,
                  "distanceAttack": 10,
                  "defense": 5,
                  "attackSpeed": 1000,
                  "defenseAttack": 4,
                  "health": 110,
                  "mana": 90
                },
                "growthPerLevel": {
                  "melee": 1,
                  "magicAttack": 1.5,
                  "distanceAttack": 3,
                  "defense": 1.2,
                  "health": 15,
                  "mana": 15
                }
              }
            };
            fs.mkdirSync(path.dirname(paths.vocationsJsonPath), { recursive: true });
            fs.writeFileSync(paths.vocationsJsonPath, JSON.stringify(defaultVocations, null, 2), 'utf-8');
        }
        const data = JSON.parse(fs.readFileSync(paths.vocationsJsonPath, 'utf-8'));
        return { status: 200, body: { success: true, vocations: data } };
    }

    saveVocations(body: Record<string, unknown>): ApiResult {
        const vocations = body.vocations as Record<string, unknown>;
        if (!vocations || typeof vocations !== 'object') {
            return { status: 400, body: { error: 'Campo vocations ausente ou inválido.' } };
        }
        
        fs.mkdirSync(path.dirname(paths.vocationsJsonPath), { recursive: true });
        fs.writeFileSync(paths.vocationsJsonPath, JSON.stringify(vocations, null, 2), 'utf-8');

        const codeContent = `import { CharacterStats } from '../../../shared/types/character';

export interface VocationConfig {
  readonly name: string;
  readonly baseStats: CharacterStats;
  readonly growthPerLevel: {
    readonly melee: number;
    readonly magicAttack: number;
    readonly distanceAttack: number;
    readonly defense: number;
    readonly health: number;
    readonly mana: number;
  };
}

export const VOCATIONS: Record<string, VocationConfig> = ${JSON.stringify(vocations, null, 2)};
`;
        fs.writeFileSync(paths.vocationsConfigPath, codeContent, 'utf-8');
        return { status: 200, body: { success: true, vocations } };
    }

    getCreaturePresets(): ApiResult {
        let presets: unknown[] = [];
        if (fs.existsSync(paths.creaturePresetsPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(paths.creaturePresetsPath, 'utf-8'));
                if (Array.isArray(raw)) presets = raw;
            } catch {
                presets = [];
            }
        }
        const sanitized = presets
            .map((row) => sanitizeCreaturePresetEntry(row))
            .filter((row): row is NonNullable<typeof row> => row !== null);
        return { status: 200, body: { presets: sanitized } };
    }

    saveCreaturePresets(body: Record<string, unknown>): ApiResult {
        const rawPresets = body.presets;
        if (!Array.isArray(rawPresets)) {
            return { status: 400, body: { error: 'Campo presets ausente ou inválido.' } };
        }
        const sanitized = rawPresets
            .map((row) => sanitizeCreaturePresetEntry(row))
            .filter((row): row is NonNullable<typeof row> => row !== null);

        let catalogRaw: unknown = { items: [] };
        if (fs.existsSync(paths.itemCatalogPath)) {
            try {
                catalogRaw = JSON.parse(fs.readFileSync(paths.itemCatalogPath, 'utf-8'));
            } catch {
                catalogRaw = { items: [] };
            }
        }
        const itemCatalog = sanitizeItemCatalogDocument(catalogRaw);
        for (const preset of sanitized) {
            const unknown = findUnknownLootItemIds(preset.loot, itemCatalog);
            if (unknown.length > 0) {
                return {
                    status: 400,
                    body: {
                        error: `Loot inválido em "${preset.name}": item(ns) não cadastrado(s): ${unknown.join(', ')}.`,
                    },
                };
            }
        }

        fs.mkdirSync(path.dirname(paths.creaturePresetsPath), { recursive: true });
        fs.writeFileSync(paths.creaturePresetsPath, JSON.stringify(sanitized, null, 2) + '\n');
        return { status: 200, body: { success: true, presets: sanitized } };
    }

    getItemCatalog(): ApiResult {
        let raw: unknown = { items: [] };
        if (fs.existsSync(paths.itemCatalogPath)) {
            try {
                raw = JSON.parse(fs.readFileSync(paths.itemCatalogPath, 'utf-8'));
            } catch {
                raw = { items: [] };
            }
        }
        const catalog = sanitizeItemCatalogDocument(raw);
        return { status: 200, body: { catalog } };
    }

    saveItemCatalog(body: Record<string, unknown>): ApiResult {
        const catalog = sanitizeItemCatalogDocument(body.catalog ?? body);
        fs.mkdirSync(path.dirname(paths.itemCatalogPath), { recursive: true });
        fs.writeFileSync(paths.itemCatalogPath, JSON.stringify(catalog, null, 2) + '\n');
        return { status: 200, body: { success: true, catalog } };
    }
}

export const studioService = new StudioService();
