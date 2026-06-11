/**
 * Fonte única: VITE_BUILD_VERSION em .env.production → package.json version.
 * Usado antes de electron:build (local e CI).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PRODUCTION = path.join(ROOT, '.env.production');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function readBuildVersionFromEnvProduction(envPath = ENV_PRODUCTION) {
    let text;
    try {
        text = readFileSync(envPath, 'utf8');
    } catch {
        throw new Error(`[sync-desktop-version] Arquivo não encontrado: ${envPath}`);
    }

    const match = text.match(/^VITE_BUILD_VERSION=(.+)$/m);
    if (!match) {
        throw new Error('[sync-desktop-version] VITE_BUILD_VERSION ausente em .env.production');
    }

    const version = match[1].trim().replace(/^["']|["']$/g, '');
    if (!SEMVER_RE.test(version)) {
        throw new Error(
            `[sync-desktop-version] VITE_BUILD_VERSION inválido: "${version}" (esperado X.Y.Z)`,
        );
    }
    return version;
}

export function syncPackageJsonVersion(version, packagePath = PACKAGE_JSON) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const previous = pkg.version;
    if (previous === version) {
        console.log(`[sync-desktop-version] package.json já em ${version}`);
        return { changed: false, version };
    }
    pkg.version = version;
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`[sync-desktop-version] Sincronizado package.json ${previous} → ${version}`);
    return { changed: true, version, previous };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const version = readBuildVersionFromEnvProduction();
    syncPackageJsonVersion(version);
}
