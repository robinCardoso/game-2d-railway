/**
 * CI: detecta se VITE_BUILD_VERSION mudou no commit (vs anterior).
 * Exit 0 = bump detectado ou workflow_dispatch; exit 1 = sem bump (skip release).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildVersionFromEnvProduction } from './sync-desktop-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = '.env.production';

function parseVersionFromText(text) {
    const match = text.match(/^VITE_BUILD_VERSION=(.+)$/m);
    if (!match) return null;
    return match[1].trim().replace(/^["']|["']$/g, '');
}

function readVersionAtRef(ref) {
    try {
        const text = execSync(`git show ${ref}:${ENV_FILE}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return parseVersionFromText(text);
    } catch {
        return null;
    }
}

if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const current = readBuildVersionFromEnvProduction();
    console.log(`[detect-version-bump] workflow_dispatch — versão alvo: ${current}`);
    process.exit(0);
}

const current = readBuildVersionFromEnvProduction();
let previous = null;

try {
    previous = readVersionAtRef('HEAD~1');
} catch {
    /* primeiro commit ou shallow */
}

if (previous === null) {
    console.log(`[detect-version-bump] Sem histórico anterior — release com v${current}`);
    process.exit(0);
}

if (current === previous) {
    console.log(
        `[detect-version-bump] VITE_BUILD_VERSION inalterado (${current}) — pulando release Electron`,
    );
    process.exit(1);
}

console.log(`[detect-version-bump] Bump detectado: ${previous} → ${current}`);
process.exit(0);
