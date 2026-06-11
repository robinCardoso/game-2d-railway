import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Mapas versionados no repo — sobrescritos no volume quando o hash diverge. */
export const BUILTIN_MAP_IDS = ['rookgaard', 'mainland', 'orc_cave'] as const;

function sha256File(filePath: string): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const data = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(data).digest('hex');
    } catch {
        return null;
    }
}

/**
 * Sincroniza mapas builtin do repo (`public/maps/`) para o volume (`DATA_ROOT/maps`).
 * Sobrescreve cópia no volume somente quando o SHA-256 difere do repo.
 * Mapas custom no volume (fora da lista builtin) não são alterados.
 */
export function syncBuiltinMapsFromRepo(repoMapsDir: string, mapsDir: string): void {
    if (path.resolve(repoMapsDir) === path.resolve(mapsDir)) return;

    fs.mkdirSync(mapsDir, { recursive: true });

    for (const mapId of BUILTIN_MAP_IDS) {
        const fileName = `${mapId}.json`;
        const repoPath = path.join(repoMapsDir, fileName);
        const destPath = path.join(mapsDir, fileName);

        if (!fs.existsSync(repoPath)) continue;

        const repoHash = sha256File(repoPath);
        if (!repoHash) continue;

        const destHash = sha256File(destPath);
        if (destHash === repoHash) continue;

        fs.copyFileSync(repoPath, destPath);
        console.log(`[mapSync] Atualizado mapa builtin ${mapId} (${fileName})`);
    }
}
