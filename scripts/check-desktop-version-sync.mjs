/**
 * Falha se package.json version ≠ VITE_BUILD_VERSION em .env.production.
 * Rodado no CI Ubuntu em todo push (barato).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildVersionFromEnvProduction } from './sync-desktop-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = path.join(__dirname, '..', 'package.json');

const envVersion = readBuildVersionFromEnvProduction();
const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));

if (pkg.version !== envVersion) {
    console.error(
        `[check-desktop-version-sync] Desalinhado: package.json=${pkg.version}, .env.production=${envVersion}`,
    );
    console.error('Execute: npm run sync:desktop-version');
    process.exit(1);
}

console.log(`[check-desktop-version-sync] OK — versão ${envVersion}`);
