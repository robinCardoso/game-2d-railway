import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const markerFile = '.electron-output-dir';
const releaseDir = 'release';
const maxAttempts = 3;

function readOutputDir() {
    let outputDir = releaseDir;
    if (existsSync(markerFile)) {
        outputDir = readFileSync(markerFile, 'utf8').trim() || outputDir;
        unlinkSync(markerFile);
    }
    return outputDir;
}

function shouldPublish() {
    if (process.env.ELECTRON_PUBLISH === 'true') return true;
    return process.argv.includes('--publish');
}

function runBuilder(outputDir) {
    const args = [`--config.directories.output=${outputDir}`];
    if (shouldPublish()) {
        args.push('--publish', 'always');
        console.log('[electron:build] Publicando Release no GitHub (electron-builder --publish always)');
    }
    execSync(`npx electron-builder ${args.join(' ')}`, {
        stdio: 'inherit',
        shell: true,
        env: process.env,
    });
}

function copyArtifactsToRelease(outputDir) {
    if (outputDir === releaseDir || !existsSync(outputDir)) return;
    mkdirSync(releaseDir, { recursive: true });
    for (const name of readdirSync(outputDir)) {
        if (!/\.(exe|blockmap)$/i.test(name)) continue;
        const from = path.join(outputDir, name);
        const to = path.join(releaseDir, name);
        copyFileSync(from, to);
        console.log(`[electron:build] Copiado para release/: ${name}`);
    }
}

let outputDir = readOutputDir();
let lastError;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
        if (attempt > 1) {
            console.warn(`[electron:build] Tentativa ${attempt}/${maxAttempts} em: ${outputDir}`);
            await sleep(1500);
        }
        runBuilder(outputDir);
        copyArtifactsToRelease(outputDir);
        console.log(`\n[electron:build] Artefatos em: ${outputDir}/`);
        process.exit(0);
    } catch (err) {
        lastError = err;
        if (attempt >= maxAttempts) break;
        console.warn('[electron:build] Falha (EPERM/EBUSY?) — aguardando e tentando de novo...');
        await sleep(2000);
    }
}

throw lastError;
