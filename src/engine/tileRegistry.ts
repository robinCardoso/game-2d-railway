import { getTileProperties, normalizeTileFileName, type TileProperties } from '../functions/tileConfig';
import type { PaletteCategory, RegistryTile, TileRegistry } from './types';
import { ENGINE_CONFIG, tileAssetSizeSuffix } from './config';
import customTileProperties from '../../tiles/tile_properties.json';

/** Mapeia pasta do PNG para as abas da paleta (Pisos, Natureza, Paredes, Itens). */
export function resolvePaletteCategory(
    globPath: string,
    folderCategory: string
): PaletteCategory {
    const pathLower = globPath.replace(/\\/g, '/').toLowerCase();
    const folder = folderCategory.toLowerCase();

    if (pathLower.includes('/items/') || folder === 'items') {
        return 'items';
    }
    if (
        folder.includes('wall') ||
        pathLower.includes('/walls/') ||
        pathLower.includes('stone_wall')
    ) {
        return 'walls';
    }
    if (
        folder === 'nature' ||
        folder.includes('natureza') ||
        folder.includes('tree') ||
        folder.includes('arvore') ||
        folder.includes('bush') ||
        folder.includes('arbusto') ||
        folder.includes('planta') ||
        folder.includes('mato') ||
        folder.includes('floresta') ||
        pathLower.includes('/nature/') ||
        pathLower.includes('/natureza/') ||
        pathLower.includes('/arvores/')
    ) {
        return 'nature';
    }
    return 'ground';
}

const OLD_ID_MAP: Record<string, number> = {
    grass: 0,
    stone_floor: 1,
    water: 2,
    wood: 3,
    wall: 4,
    tree: 5,
};

/** PNGs de personagem/outfit não entram na paleta de pintura do mapa. */
function isCharacterTilePath(path: string): boolean {
    const pathNorm = path.replace(/\\/g, '/').toLowerCase();
    return pathNorm.includes('/characters/') || pathNorm.includes('/character/');
}

/** FX de combate/UI (`tiles/effects/**`) — carregados à parte, não são tiles de mapa. */
function isEffectsTilePath(path: string): boolean {
    const pathNorm = path.replace(/\\/g, '/').toLowerCase();
    return pathNorm.includes('/effects/');
}

function isExcludedFromTileRegistry(path: string): boolean {
    return isCharacterTilePath(path) || isEffectsTilePath(path);
}

/** Lê tile_properties.json em runtime (dev server) para pegar strip recém-salvo. */
let runtimeTileProperties: Record<string, TileProperties> | null = null;

export function mergeRuntimeTileProperties(props: Record<string, TileProperties>): void {
    runtimeTileProperties = { ...props };
}

function getCustomProperties(fileName: string, baseName: string): TileProperties | undefined {
    const tryKeys = (store: Record<string, TileProperties> | null | undefined): TileProperties | undefined => {
        if (!store) return undefined;
        const keys = [fileName, baseName];
        const norm = normalizeTileFileName(fileName);
        if (!keys.includes(norm)) keys.push(norm);
        if (norm.includes('-')) keys.push(norm.replace(/-/g, '_'));
        if (norm.includes('_')) keys.push(norm.replace(/_/g, '-'));
        for (const key of keys) {
            if (store[key]) return store[key];
        }
        return undefined;
    };
    const fromRuntime = tryKeys(runtimeTileProperties ?? undefined);
    const fromFile = tryKeys(customTileProperties as Record<string, TileProperties>);
    return fromRuntime ? { ...fromFile, ...fromRuntime } : fromFile;
}

export interface VariantStripMismatch {
    fileName: string;
    expectedFrames: number;
    imageWidth: number;
}

const variantStripMismatches: VariantStripMismatch[] = [];

export function takeVariantStripMismatches(): VariantStripMismatch[] {
    const out = [...variantStripMismatches];
    variantStripMismatches.length = 0;
    return out;
}

/** Detecta strip horizontal N×TILE_SIZE a partir da largura do PNG (metadados só se baterem). */
export function inferVariantStripFrameCount(
    img: HTMLImageElement,
    custom?: TileProperties,
    _fileName?: string
): number {
    const tileSize = ENGINE_CONFIG.TILE_SIZE;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    const explicit = Math.max(0, Math.floor(Number(custom?.variantStripFrames) || 0));

    if (explicit > 1) {
        return explicit;
    }

    const fromImage =
        h === tileSize && w > tileSize && w % tileSize === 0
            ? Math.floor(w / tileSize)
            : 0;

    return fromImage;
}

type NextIdAllocator = { next: number; take(): number };

function createNextIdAllocator(start = 7): NextIdAllocator {
    let next = start;
    return {
        get next() {
            return next;
        },
        set next(v: number) {
            next = v;
        },
        take() {
            return next++;
        },
    };
}

/** Inferir variantGroup para strips `_variants` exportados com "Sem grupo" marcado. */
function inferVariantGroupForStrip(fileName: string, custom?: TileProperties): string | undefined {
    const explicit = custom?.variantGroup?.trim();
    if (explicit) return explicit;

    const stripFrames = Number(custom?.variantStripFrames) || 0;
    const looksLikeStrip =
        /_var_variants$/i.test(fileName) ||
        /_variants$/i.test(fileName) ||
        stripFrames > 1;
    if (!looksLikeStrip) return undefined;

    let base = fileName
        .replace(/_var_variants$/i, '')
        .replace(/_variants$/i, '')
        .replace(/^\d+-/, '')
        .replace(/-/g, '_')
        .toLowerCase();

    if (/grama|grass/.test(base)) return 'grass';
    if (/pedra|stone|ground_pedra|ground/.test(base)) return 'stone';
    if (/dirt|terra|earth/.test(base)) return 'dirt';
    if (/sand|areia/.test(base)) return 'sand';
    if (/water|agua/.test(base)) return 'water';

    const sanitized = base.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return sanitized || undefined;
}

function registerVariantStrip(
    registry: TileRegistry,
    ids: NextIdAllocator,
    options: {
        fileName: string;
        img: HTMLImageElement;
        category: string;
        paletteCategory: PaletteCategory;
        props: TileProperties;
        custom?: TileProperties;
        stripFrames: number;
    }
): void {
    const { fileName, img, category, paletteCategory, props, custom, stripFrames } = options;
    const tileSize = ENGINE_CONFIG.TILE_SIZE;
    const baseLabel =
        custom?.nameOverride ||
        props.nameOverride ||
        fileName.replace(/_/g, ' ');
    const { variantStripFrames: _stripMeta, ...customWithoutStrip } = custom ?? {};
    const resolvedGroup = inferVariantGroupForStrip(fileName, custom);
    const stripProps = {
        ...customWithoutStrip,
        ...(resolvedGroup ? { variantGroup: resolvedGroup } : {}),
    };

    const ox = custom?.offsetX ?? 0;
    const oy = custom?.offsetY ?? 0;
    const gx = custom?.gapX ?? 0;
    const gy = custom?.gapY ?? 0;
    const fw = custom?.frameWidth ?? tileSize;
    const fh = custom?.frameHeight ?? tileSize;
    const isVertical = custom?.sheetLayout === 'vertical';

    for (let i = 0; i < stripFrames; i++) {
        const frameId = ids.take();
        const sx = isVertical ? ox : ox + i * (fw + gx);
        const sy = isVertical ? oy + i * (fh + gy) : oy;

        registry[frameId] = {
            id: frameId,
            name: `${baseLabel} · ${i + 1}`,
            image: img,
            category,
            paletteCategory,
            fileKey: `${fileName}#${i}`,
            sourceRect: {
                x: sx,
                y: sy,
                w: fw,
                h: fh,
            },
            variantStripIndex: i,
            variantStripFrames: stripFrames,
            ...props,
            ...stripProps,
        };
    }
}

function buildSingleTileSourceRect(
    custom: TileProperties | undefined,
    img: HTMLImageElement
): { x: number; y: number; w: number; h: number } | undefined {
    if (!custom) return undefined;
    const ox = custom.offsetX ?? 0;
    const oy = custom.offsetY ?? 0;
    const fw = custom.frameWidth ?? 0;
    const fh = custom.frameHeight ?? 0;
    const imgW = img.naturalWidth || img.width || 0;
    const imgH = img.naturalHeight || img.height || 0;
    const hasExplicitFrame = fw > 0 && fh > 0;
    const hasOffset = ox !== 0 || oy !== 0;
    if (!hasExplicitFrame && !hasOffset) return undefined;
    const w = hasExplicitFrame ? fw : imgW;
    const h = hasExplicitFrame ? fh : imgH;
    if (w <= 0 || h <= 0) return undefined;
    return { x: ox, y: oy, w, h };
}

function registerSingleTile(
    registry: TileRegistry,
    ids: NextIdAllocator,
    options: {
        fileName: string;
        baseName: string;
        img: HTMLImageElement;
        category: string;
        paletteCategory: PaletteCategory;
        props: TileProperties;
        custom?: TileProperties;
    }
): void {
    const { fileName, baseName, img, category, paletteCategory, props, custom } = options;

    let id = OLD_ID_MAP[baseName];
    if (id === undefined) {
        id = ids.take();
    }

    const sourceRect = buildSingleTileSourceRect(custom, img);

    registry[id] = {
        id,
        name:
            custom?.nameOverride ||
            props.nameOverride ||
            baseName.replace(/_/g, ' '),
        image: img,
        category,
        paletteCategory,
        fileKey: fileName,
        ...(sourceRect ? { sourceRect } : {}),
        ...props,
        ...custom,
    };
}

function loadImageElement(url: string, bustCache = false): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        const src =
            bustCache && !url.startsWith('data:')
                ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`
                : url;
        img.src = src;
    });
}

function shouldSkipTilePath(path: string, fileName: string): boolean {
    const sizeSuffix = tileAssetSizeSuffix();
    if (
        (!fileName.endsWith(sizeSuffix) && path.includes('stone_stairs_up')) ||
        (!fileName.endsWith(sizeSuffix) && path.includes('wood_stairs_up')) ||
        (!fileName.endsWith(sizeSuffix) && path.includes('marble_stairs_up'))
    ) {
        return true;
    }
    const custom = getCustomProperties(
        fileName,
        normalizeTileFileName(fileName)
    );
    return (custom as { assetType?: string; tileRole?: string } | undefined)?.assetType === 'character'
        || (custom as { assetType?: string } | undefined)?.assetType === 'effect'
        || (custom as { tileRole?: string } | undefined)?.tileRole === 'border_sheet';
}

function registerLoadedTile(
    registry: TileRegistry,
    ids: NextIdAllocator,
    path: string,
    img: HTMLImageElement
): void {
    const parts = path.split('/');
    const fileName = parts.pop()!.replace('.png', '');
    const category = parts.pop()!;
    const baseName = normalizeTileFileName(fileName);

    const props = getTileProperties(fileName);
    const custom = getCustomProperties(fileName, baseName);
    const paletteCategory =
        (custom?.paletteCategory as PaletteCategory | undefined) ||
        (custom?.assetType === 'border' ? ('border' as PaletteCategory) : resolvePaletteCategory(path, category));

    const stripFrames = inferVariantStripFrameCount(img, custom, fileName);
    if (stripFrames > 1) {
        registerVariantStrip(registry, ids, {
            fileName,
            img,
            category,
            paletteCategory,
            props,
            custom,
            stripFrames,
        });
        return;
    }

    registerSingleTile(registry, ids, {
        fileName,
        baseName,
        img,
        category,
        paletteCategory,
        props,
        custom,
    });
}

function registerTileFromPath(
    registry: TileRegistry,
    ids: NextIdAllocator,
    path: string,
    url: string
): Promise<void> {
    const parts = path.split('/');
    const fileName = parts.pop()!.replace('.png', '');

    if (shouldSkipTilePath(path, fileName)) {
        return Promise.resolve();
    }

    return loadImageElement(url).then((img) => {
        registerLoadedTile(registry, ids, path, img);
    });
}

function createEmptyRegistry(): TileRegistry {
    return {
        [ENGINE_CONFIG.EMPTY_TILE_ID]: {
            id: ENGINE_CONFIG.EMPTY_TILE_ID,
            name: 'Vazio',
            walkable: false,
            category: 'all',
        },
    };
}

function getTileImageGlob(): Record<string, string> {
    return (import.meta as any).glob('../../tiles/**/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
    }) as Record<string, string>;
}

/**
 * Carrega PNGs aguardando dimensões — necessário para detectar variant strips.
 */
export async function buildTileRegistryAsync(options?: { bustImageCache?: boolean }): Promise<TileRegistry> {
    variantStripMismatches.length = 0;
    const bustCache = options?.bustImageCache ?? false;
    const registry = createEmptyRegistry();
    const ids = createNextIdAllocator(7);
    const tileImagesRaw = getTileImageGlob();
    const paths = Object.keys(tileImagesRaw)
        .filter((path) => !isExcludedFromTileRegistry(path))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const imageByPath = new Map<string, HTMLImageElement>();
    await Promise.all(
        paths.map(async (path) => {
            imageByPath.set(path, await loadImageElement(tileImagesRaw[path], bustCache));
        })
    );

    for (const path of paths) {
        const img = imageByPath.get(path);
        if (!img) continue;
        registerLoadedTile(registry, ids, path, img);
    }

    return registry;
}

/**
 * Síncrono (legado). Pode falhar a detectar strips se a imagem ainda não carregou.
 */
export function buildTileRegistry(): TileRegistry {
    const registry = createEmptyRegistry();
    const ids = createNextIdAllocator(7);
    const tileImagesRaw = getTileImageGlob();
    const paths = Object.keys(tileImagesRaw)
        .filter((path) => !isExcludedFromTileRegistry(path))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    for (const path of paths) {
        void registerTileFromPath(registry, ids, path, tileImagesRaw[path]);
    }

    return registry;
}

export function getTileFromRegistry(
    registry: TileRegistry,
    tileId: number
): RegistryTile | undefined {
    return registry[tileId];
}

/** Tile virtual: vão de escada (não existe no tileset). */
export function createStairHoleTile(): RegistryTile {
    return {
        id: -2,
        name: 'Vão de Escada',
        walkable: true,
        category: 'stairs',
        speedModifier: 1.0,
    };
}
