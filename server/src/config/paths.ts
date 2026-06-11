import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncCatalogFilesFromRepo } from './catalogVolumeSync.js';
import { env } from './env.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repo — funciona em dev (tsx) e prod (server/dist/server/src). */
function findProjectRoot(): string {
    const starts = [moduleDir, process.cwd()];
    for (const start of starts) {
        let dir = start;
        for (let i = 0; i < 8; i++) {
            if (fs.existsSync(path.join(dir, 'vite.config.ts'))) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    }
    return path.resolve(moduleDir, '../../..');
}

const projectRoot = path.resolve(findProjectRoot());

export interface AppPaths {
    projectRoot: string;
    distDir: string;
    repoMapsDir: string;
    repoTilesDir: string;
    repoPublicDir: string;
    mapsDir: string;
    tilesDir: string;
    charactersDir: string;
    tilePropertiesPath: string;
    tileCatalogPath: string;
    autoBorderSetsPath: string;
    creaturePresetsPath: string;
    spellCatalogPath: string;
    outfitPresetsPath: string;
    itemCatalogPath: string;
    tileVariantGroupsPath: string;
    gameConfigPath: string;
    vocationsConfigPath: string;
    vocationsJsonPath: string;
}

function copyDirRecursive(src: string, dest: string): void {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function copyFileIfMissing(src: string, dest: string): void {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
    }
}

function seedDataRoot(dataRoot: string): void {
    const repoMaps = path.join(projectRoot, 'public', 'maps');
    const repoTiles = path.join(projectRoot, 'tiles');
    const repoPublic = path.join(projectRoot, 'public');

    const dataMaps = path.join(dataRoot, 'maps');
    const dataTiles = path.join(dataRoot, 'tiles');

    if (!fs.existsSync(dataMaps) || fs.readdirSync(dataMaps).length === 0) {
        copyDirRecursive(repoMaps, dataMaps);
    }
    if (!fs.existsSync(dataTiles) || fs.readdirSync(dataTiles).length === 0) {
        copyDirRecursive(repoTiles, dataTiles);
    }

    // FX/UI read-only: merge subpastas novas do repo sem sobrescrever o volume
    copyDirRecursive(path.join(repoTiles, 'effects'), path.join(dataTiles, 'effects'));
    copyDirRecursive(path.join(repoTiles, 'items'), path.join(dataTiles, 'items'));

    const publicFiles = [
        'tile_catalog.json',
        'auto_border_sets.json',
        'creature_presets.json',
        'spell_catalog.json',
        'outfit_presets.json',
        'item_catalog.json',
        'tile_variant_groups.json',
        'game_rates.json',
    ];
    for (const file of publicFiles) {
        copyFileIfMissing(path.join(repoPublic, file), path.join(dataRoot, file));
    }

    // Volume antigo pode ter item_catalog vazio — mescla novos itens/loot do repo
    syncCatalogFilesFromRepo(repoPublic, dataRoot);

    copyFileIfMissing(
        path.join(projectRoot, 'src/game-data/default/vocations.json'),
        path.join(dataRoot, 'vocations.json')
    );
}

function buildPaths(): AppPaths {
    const repoMapsDir = path.join(projectRoot, 'public', 'maps');
    const repoTilesDir = path.join(projectRoot, 'tiles');
    const repoPublicDir = path.join(projectRoot, 'public');

    if (env.dataRoot) {
        fs.mkdirSync(env.dataRoot, { recursive: true });
        seedDataRoot(env.dataRoot);
        const tilesDir = path.join(env.dataRoot, 'tiles');
        return {
            projectRoot,
            distDir: path.join(projectRoot, 'dist'),
            repoMapsDir,
            repoTilesDir,
            repoPublicDir,
            mapsDir: path.join(env.dataRoot, 'maps'),
            tilesDir,
            charactersDir: path.join(tilesDir, 'characters'),
            tilePropertiesPath: path.join(tilesDir, 'tile_properties.json'),
            tileCatalogPath: path.join(env.dataRoot, 'tile_catalog.json'),
            autoBorderSetsPath: path.join(env.dataRoot, 'auto_border_sets.json'),
            creaturePresetsPath: path.join(env.dataRoot, 'creature_presets.json'),
            spellCatalogPath: path.join(env.dataRoot, 'spell_catalog.json'),
            outfitPresetsPath: path.join(env.dataRoot, 'outfit_presets.json'),
            itemCatalogPath: path.join(env.dataRoot, 'item_catalog.json'),
            tileVariantGroupsPath: path.join(env.dataRoot, 'tile_variant_groups.json'),
            gameConfigPath: path.join(projectRoot, 'game_config.json'),
            vocationsConfigPath: path.join(projectRoot, 'src/game-data/default/vocations.ts'),
            vocationsJsonPath: path.join(env.dataRoot, 'vocations.json'),
        };
    }

    return {
        projectRoot,
        distDir: path.join(projectRoot, 'dist'),
        repoMapsDir,
        repoTilesDir,
        repoPublicDir,
        mapsDir: repoMapsDir,
        tilesDir: repoTilesDir,
        charactersDir: path.join(repoTilesDir, 'characters'),
        tilePropertiesPath: path.join(repoTilesDir, 'tile_properties.json'),
        tileCatalogPath: path.join(repoPublicDir, 'tile_catalog.json'),
        autoBorderSetsPath: path.join(repoPublicDir, 'auto_border_sets.json'),
        creaturePresetsPath: path.join(repoPublicDir, 'creature_presets.json'),
        spellCatalogPath: path.join(repoPublicDir, 'spell_catalog.json'),
        outfitPresetsPath: path.join(repoPublicDir, 'outfit_presets.json'),
        itemCatalogPath: path.join(repoPublicDir, 'item_catalog.json'),
        tileVariantGroupsPath: path.join(repoPublicDir, 'tile_variant_groups.json'),
        gameConfigPath: path.join(projectRoot, 'game_config.json'),
        vocationsConfigPath: path.join(projectRoot, 'src/game-data/default/vocations.ts'),
        vocationsJsonPath: path.join(projectRoot, 'src/game-data/default/vocations.json'),
    };
}

export const paths: AppPaths = buildPaths();

export function getMapsDirForCollision(): string {
    return paths.mapsDir;
}
