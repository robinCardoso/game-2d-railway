import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'public_key.pem');

const raw = process.env.ASSET_PACK_PUBLIC_KEY?.trim();

if (!raw) {
    if (fs.existsSync(OUTPUT_FILE)) {
        console.log('[write-pack-public-key] Usando public_key.pem existente na raiz.');
        process.exit(0);
    }
    console.log('[write-pack-public-key] Sem ASSET_PACK_PUBLIC_KEY; pack-assets pode gerar chaves no dev local.');
    process.exit(0);
}

const pem = raw.includes('BEGIN PUBLIC KEY')
    ? raw.replace(/\r\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8');

if (!pem.includes('BEGIN PUBLIC KEY')) {
    console.error('[write-pack-public-key] ASSET_PACK_PUBLIC_KEY inválida (esperado PEM ou base64 de PEM).');
    process.exit(1);
}

fs.writeFileSync(OUTPUT_FILE, pem.endsWith('\n') ? pem : `${pem}\n`, 'utf8');
console.log('[write-pack-public-key] public_key.pem gravado a partir de ASSET_PACK_PUBLIC_KEY.');
