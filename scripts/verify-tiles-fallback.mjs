/**
 * Verifica fallback /tiles → repoTilesDir quando DATA_ROOT não tem effects/.
 * Uso: node scripts/verify-tiles-fallback.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpData = path.join(root, 'tmp-data-test');
const tilesPartial = path.join(tmpData, 'tiles');

fs.rmSync(tmpData, { recursive: true, force: true });
fs.mkdirSync(path.join(tilesPartial, 'maps'), { recursive: true });
fs.writeFileSync(path.join(tilesPartial, '.seeded'), '1');

const port = 9876;
const env = { ...process.env, DATA_ROOT: tmpData, PORT: String(port) };
const serverProc = spawn('node', ['dist/server/src/index.js'], {
    cwd: path.join(root, 'server'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server timeout')), 15000);
    serverProc.stdout.on('data', (d) => {
        if (String(d).includes(String(port))) {
            clearTimeout(t);
            resolve();
        }
    });
    serverProc.stderr.on('data', (d) => process.stderr.write(d));
    serverProc.on('error', reject);
});

const urls = [
    '/tiles/effects/combat/target_ring.png',
    '/tiles/effects/combat/target_ring.json',
];
for (const u of urls) {
    const res = await fetch(`http://127.0.0.1:${port}${u}`);
    console.log(`${u} → ${res.status}`);
    if (!res.ok) process.exitCode = 1;
}

serverProc.kill();
if (fs.existsSync(path.join(tilesPartial, 'effects', 'combat', 'target_ring.png'))) {
    console.log('seed: effects/ copiado para volume');
} else {
    console.log('seed: effects/ ainda ausente no volume (fallback Express cobre)');
}
