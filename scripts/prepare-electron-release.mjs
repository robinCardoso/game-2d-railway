import { existsSync, mkdirSync, rmSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const markerFile = '.electron-output-dir';
const defaultOutput = 'release';
const releaseDir = defaultOutput;
const winUnpacked = path.join(releaseDir, 'win-unpacked');
const winUnpackedTmp = path.join(releaseDir, 'win-unpacked.tmp');

function killDesktopProcesses() {
    const commands = [
        'taskkill /F /T /IM "Elarion Online.exe"',
        'taskkill /F /T /IM "Game 2D Railway.exe"',
    ];
    if (process.env.FORCE_KILL_ELECTRON_DEV === 'true') {
        commands.push('taskkill /F /T /IM electron.exe');
    }
    for (const cmd of commands) {
        try {
            execSync(cmd, { stdio: 'ignore' });
        } catch {
            /* processo não estava em execução */
        }
    }
}

async function removeDir(target) {
    if (!existsSync(target)) return true;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            rmSync(target, { recursive: true, force: true });
            return true;
        } catch {
            await sleep(800);
        }
    }
    return false;
}

async function quarantineDir(target) {
    if (!existsSync(target)) return true;
    const stale = `${target}-stale-${Date.now()}`;
    try {
        renameSync(target, stale);
        console.warn(`[electron:prepare] Pasta bloqueada renomeada: ${stale}`);
        return true;
    } catch {
        return false;
    }
}

function fallbackOutputDir() {
    const dir = path.join(os.tmpdir(), 'elarion-electron-build', String(Date.now()));
    mkdirSync(dir, { recursive: true });
    return dir;
}

async function cleanPackagingDirs(outputDir) {
    for (const name of ['win-unpacked.tmp', 'win-unpacked']) {
        const target = path.join(outputDir, name);
        const removed = await removeDir(target);
        if (!removed && existsSync(target)) {
            await quarantineDir(target);
        }
    }
}

if (existsSync(markerFile)) {
    unlinkSync(markerFile);
}

killDesktopProcesses();
await sleep(500);

let outputDir = defaultOutput;

for (const dir of [winUnpackedTmp, winUnpacked]) {
    const removed = await removeDir(dir);
    if (!removed && existsSync(dir)) {
        const moved = await quarantineDir(dir);
        if (!moved) {
            outputDir = fallbackOutputDir();
            console.warn(
                `[electron:prepare] release/win-unpacked bloqueado — usando pasta temporária: ${outputDir}`,
            );
            break;
        }
    }
}

await cleanPackagingDirs(outputDir);

writeFileSync(markerFile, outputDir, 'utf8');
