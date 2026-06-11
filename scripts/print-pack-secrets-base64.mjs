/**
 * Imprime ASSET_PACK_* em base64 para colar no GitHub Secrets / Railway Variables.
 * Uso: node scripts/print-pack-secrets-base64.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['private_key.pem', 'public_key.pem']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) {
        console.error(`Arquivo ausente: ${file}. Rode npm run pack antes.`);
        process.exit(1);
    }
    const pem = fs.readFileSync(file, 'utf8');
    const secret = name === 'private_key.pem' ? 'ASSET_PACK_PRIVATE_KEY' : 'ASSET_PACK_PUBLIC_KEY';
    const b64 = Buffer.from(pem, 'utf8').toString('base64');
    console.log(`\n=== ${secret} (base64) ===\n${b64}\n`);
}
