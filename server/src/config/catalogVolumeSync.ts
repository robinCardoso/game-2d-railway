import fs from 'node:fs';
import path from 'node:path';
import {
    sanitizeItemCatalogDocument,
    type ItemCatalogDocument,
} from '../../../src/game-data/itemCatalogTypes.js';

type JsonRecord = Record<string, unknown>;

function readJsonFile(filePath: string): unknown | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    } catch {
        return null;
    }
}

function writeJsonIfChanged(destPath: string, data: unknown, label: string): boolean {
    const next = `${JSON.stringify(data, null, 2)}\n`;
    const prev = fs.existsSync(destPath) ? fs.readFileSync(destPath, 'utf-8') : '';
    if (next === prev) return false;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, next, 'utf-8');
    console.log(`[catalogSync] Atualizado ${label} (${path.basename(destPath)})`);
    return true;
}

/** Mescla itens do repo no volume — entradas do volume têm prioridade (edições Studio). */
export function mergeItemCatalogFromRepo(
    repoRaw: unknown,
    volumeRaw: unknown | null
): ItemCatalogDocument {
    const repo = sanitizeItemCatalogDocument(repoRaw);
    const volume = sanitizeItemCatalogDocument(volumeRaw ?? { items: [] });
    const byId = new Map(volume.items.map((item) => [item.id, item]));
    for (const item of repo.items) {
        if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return { items: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

function creaturePresetKey(preset: JsonRecord): string {
    const name = typeof preset.name === 'string' ? preset.name.trim().toLowerCase() : '';
    const configPath =
        typeof preset.configPath === 'string' ? preset.configPath.trim().toLowerCase() : '';
    return name || configPath;
}

function volumePresetNeedsRepoLoot(volume: JsonRecord, repo: JsonRecord): boolean {
    const volLoot = volume.loot;
    const repoLoot = repo.loot;
    const volEmpty = !Array.isArray(volLoot) || volLoot.length === 0;
    const repoHasLoot = Array.isArray(repoLoot) && repoLoot.length > 0;
    return volEmpty && repoHasLoot;
}

/** Mescla presets do repo — preserva edições do volume; preenche loot ausente. */
export function mergeCreaturePresetsFromRepo(
    repoRaw: unknown,
    volumeRaw: unknown | null
): JsonRecord[] {
    const repo = Array.isArray(repoRaw) ? (repoRaw as JsonRecord[]) : [];
    const volume = Array.isArray(volumeRaw) ? (volumeRaw as JsonRecord[]) : [];
    const byKey = new Map<string, JsonRecord>();

    for (const preset of volume) {
        if (!preset || typeof preset !== 'object') continue;
        const key = creaturePresetKey(preset);
        if (key) byKey.set(key, preset);
    }

    for (const repoPreset of repo) {
        if (!repoPreset || typeof repoPreset !== 'object') continue;
        const key = creaturePresetKey(repoPreset);
        if (!key) continue;

        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, repoPreset);
            continue;
        }
        if (volumePresetNeedsRepoLoot(existing, repoPreset)) {
            byKey.set(key, { ...existing, loot: repoPreset.loot });
        }
    }

    return [...byKey.values()];
}

export function countItemCatalogEntries(raw: unknown): number {
    return sanitizeItemCatalogDocument(raw).items.length;
}

/** Sincroniza catálogos versionados do repo para o volume persistente (Railway DATA_ROOT). */
export function syncCatalogFilesFromRepo(repoPublicDir: string, dataRoot: string): void {
    const pairs: { file: string; merge: (repo: unknown, vol: unknown | null) => unknown }[] = [
        {
            file: 'item_catalog.json',
            merge: mergeItemCatalogFromRepo,
        },
        {
            file: 'creature_presets.json',
            merge: mergeCreaturePresetsFromRepo,
        },
    ];

    for (const { file, merge } of pairs) {
        const repoPath = path.join(repoPublicDir, file);
        const destPath = path.join(dataRoot, file);
        if (!fs.existsSync(repoPath)) continue;
        const repoRaw = readJsonFile(repoPath);
        if (repoRaw === null) continue;
        const volumeRaw = readJsonFile(destPath);
        const merged = merge(repoRaw, volumeRaw);
        writeJsonIfChanged(destPath, merged, file);
    }
}
