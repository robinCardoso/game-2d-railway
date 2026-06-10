import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const TILES_DIR = path.join(ROOT_DIR, 'tiles');
const OUTPUT_PAK = path.join(PUBLIC_DIR, 'assets.pak');
const OUTPUT_SIG = path.join(PUBLIC_DIR, 'assets.sig');
const PUBLIC_KEY_FILE = path.join(ROOT_DIR, 'public_key.pem');
const PRIVATE_KEY_FILE = path.join(ROOT_DIR, 'private_key.pem');

// 1. Coletar arquivos
const filesToPack = [];

function scanDir(dir, prefix = '') {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = prefix ? `${prefix}/${item}` : item;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            scanDir(fullPath, relativePath);
        } else {
            // Ignorar o próprio pacote e chaves
            if (item === 'assets.pak' || item === 'assets.sig' || item.endsWith('.pem')) continue;
            
            filesToPack.push({
                absolutePath: fullPath,
                relativePath: relativePath,
                size: stat.size
            });
        }
    }
}

console.log('Escanenado public/ e tiles/ ...');
scanDir(PUBLIC_DIR, '');
scanDir(TILES_DIR, 'tiles');

// 2. Montar pacote
const MAGIC_STRING = 'ELARION_PAK\n';
const manifest = { files: {} };
const buffers = [];

let currentOffset = 0;

for (const file of filesToPack) {
    const data = fs.readFileSync(file.absolutePath);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    manifest.files[file.relativePath] = {
        offset: currentOffset,
        size: file.size,
        hash: hash
    };
    
    buffers.push(data);
    currentOffset += file.size;
}

const manifestJson = JSON.stringify(manifest);
const manifestBuffer = Buffer.from(manifestJson, 'utf8');

// Cabecalho: Magic (12 bytes) + manifestSize (4 bytes)
const headerBuffer = Buffer.alloc(16);
headerBuffer.write(MAGIC_STRING, 0, 'utf8');
headerBuffer.writeUInt32LE(manifestBuffer.length, 12);

const pakData = Buffer.concat([headerBuffer, manifestBuffer, ...buffers]);

fs.writeFileSync(OUTPUT_PAK, pakData);
console.log(`Pacote assets.pak gerado com sucesso! Tamanho: ${(pakData.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Arquivos empacotados: ${filesToPack.length}`);

// 3. Assinatura (Camada 4)
function getOrCreateKeys() {
    const envPrivateKey = process.env.ASSET_PACK_PRIVATE_KEY?.trim();
    if (envPrivateKey) {
        const privateKey = envPrivateKey.includes('BEGIN PRIVATE KEY')
            ? envPrivateKey
            : Buffer.from(envPrivateKey, 'base64').toString('utf8');
        const publicKey = crypto
            .createPublicKey({ key: privateKey, format: 'pem' })
            .export({ type: 'spki', format: 'pem' });
        fs.writeFileSync(PUBLIC_KEY_FILE, publicKey);
        return { privateKey, publicKey };
    }

    if (fs.existsSync(PRIVATE_KEY_FILE) && fs.existsSync(PUBLIC_KEY_FILE)) {
        return {
            privateKey: fs.readFileSync(PRIVATE_KEY_FILE, 'utf8'),
            publicKey: fs.readFileSync(PUBLIC_KEY_FILE, 'utf8'),
        };
    }

    console.log('Gerando novo par de chaves ECDSA (apenas desenvolvimento local)...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    fs.writeFileSync(PUBLIC_KEY_FILE, publicKey);
    fs.writeFileSync(PRIVATE_KEY_FILE, privateKey);
    console.log('Chaves geradas: public_key.pem e private_key.pem (private_key.pem está no .gitignore)');

    return { privateKey, publicKey };
}

const { privateKey } = getOrCreateKeys();

// Assinar o hash SHA-256 do arquivo .pak completo
const pakHash = crypto.createHash('sha256').update(pakData).digest();
const sign = crypto.createSign('SHA256');
sign.update(pakData);
sign.end();
const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

fs.writeFileSync(OUTPUT_SIG, signature);
console.log('Pacote assinado! assets.sig gerado com sucesso.');

// Salvar cópia da public_key no public para o cliente poder ler
fs.copyFileSync(PUBLIC_KEY_FILE, path.join(PUBLIC_DIR, 'public_key.pem'));
console.log('Chave pública copiada para public/public_key.pem para validação no cliente.');
