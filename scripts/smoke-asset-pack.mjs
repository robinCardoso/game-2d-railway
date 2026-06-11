/**
 * Smoke test: verifica assets.pak + assets.sig + assinatura ECDSA (sem browser).
 * Rode após `npm run pack` ou `npm run build`. Uso: node scripts/smoke-asset-pack.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAK = path.join(ROOT, 'public', 'assets.pak');
const SIG = path.join(ROOT, 'public', 'assets.sig');
const PUB = path.join(ROOT, 'public', 'public_key.pem');
const MAGIC = 'ELARION_PAK\n';

for (const file of [PAK, SIG, PUB]) {
    if (!fs.existsSync(file)) {
        console.error(`[smoke-asset-pack] Arquivo ausente: ${file}`);
        console.error('Execute npm run pack ou npm run build antes.');
        process.exit(1);
    }
}

const pakData = fs.readFileSync(PAK);
const signature = fs.readFileSync(SIG);
const publicKey = fs.readFileSync(PUB, 'utf8');

if (!pakData.subarray(0, 12).equals(Buffer.from(MAGIC, 'utf8'))) {
    console.error('[smoke-asset-pack] Magic string inválida em assets.pak');
    process.exit(1);
}

const verify = crypto.createVerify('SHA256');
verify.update(pakData);
verify.end();
const ok = verify.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);

if (!ok) {
    console.error('[smoke-asset-pack] Assinatura ECDSA inválida (pak/sig/public_key.pem desalinhados)');
    process.exit(1);
}

const manifestSize = pakData.readUInt32LE(12);
const manifest = JSON.parse(pakData.subarray(16, 16 + manifestSize).toString('utf8'));
const fileCount = Object.keys(manifest.files ?? {}).length;

console.log(`[smoke-asset-pack] OK — pacote assinado, ${fileCount} arquivo(s) no manifest.`);
