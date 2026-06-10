import { resolveApiUrl } from '../shared/apiUrl';

const PAK_URL = '/assets.pak';
const SIG_URL = '/assets.sig';
const PUB_KEY_URL = '/public_key.pem';
const MAGIC_STRING = 'ELARION_PAK\n';

export interface PakManifestEntry {
    offset: number;
    size: number;
    hash: string;
}

export interface PakManifest {
    files: Record<string, PakManifestEntry>;
}

/** Converte URL/glob (`/tiles/foo.png`, `../../tiles/foo.png`) para chave do manifest. */
function inferMimeType(relativePath: string): string {
    const ext = relativePath.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'svg':
            return 'image/svg+xml';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        case 'webp':
            return 'image/webp';
        case 'json':
            return 'application/json';
        default:
            return 'image/png';
    }
}

export function normalizePackPath(publicPath: string): string {
    let path = publicPath.replace(/\\/g, '/').replace(/^\//, '');
    const tilesIdx = path.indexOf('tiles/');
    if (tilesIdx > 0) {
        path = path.slice(tilesIdx);
    }
    return path;
}

class AssetLoader {
    private active = false;
    private initPromise: Promise<void> | null = null;
    private manifest: PakManifest | null = null;
    private memoryCache = new Map<string, ArrayBuffer>();
    private blobUrlCache = new Map<string, string>();
    private textDecoder = new TextDecoder('utf-8');

    public isPackaged(): boolean {
        return this.active;
    }

    public hasFile(publicPath: string): boolean {
        if (!this.active) return false;
        return this.memoryCache.has(normalizePackPath(publicPath));
    }

    public listFiles(prefix = '', extension?: string): string[] {
        if (!this.active || !this.manifest) return [];
        const normPrefix = prefix.replace(/^\//, '');
        return Object.keys(this.manifest.files).filter((key) => {
            if (normPrefix && !key.startsWith(normPrefix)) return false;
            if (extension && !key.toLowerCase().endsWith(extension.toLowerCase())) return false;
            return true;
        });
    }

    /** Helper to parse PEM into ArrayBuffer for Web Crypto API */
    private pemToArrayBuffer(pem: string): ArrayBuffer {
        const b64Lines = pem.replace(/(-----(BEGIN|END) PUBLIC KEY-----|\r|\n)/g, '');
        const binaryStr = atob(b64Lines);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes.buffer;
    }

    private async sha256(buffer: ArrayBuffer): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    public async initialize(): Promise<void> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.doInitialize();
        return this.initPromise;
    }

    private async doInitialize(): Promise<void> {
        if (import.meta.env.VITE_USE_LOOSE_ASSETS === 'true') {
            console.log('[AssetLoader] Usando modo loose assets (arquivos soltos).');
            return;
        }

        try {
            console.log('[AssetLoader] Tentando baixar assets.pak ...');

            const [pakRes, sigRes, pubKeyRes] = await Promise.all([
                fetch(resolveApiUrl(PAK_URL)),
                fetch(resolveApiUrl(SIG_URL)),
                fetch(resolveApiUrl(PUB_KEY_URL)),
            ]);

            if (!pakRes.ok) {
                console.log('[AssetLoader] Pacote assets.pak não encontrado. Fallback para loose files.');
                return;
            }

            const pakBuffer = await pakRes.arrayBuffer();
            const sigBuffer = await sigRes.arrayBuffer();
            const pubKeyPem = await pubKeyRes.text();

            const pubKeyBuf = this.pemToArrayBuffer(pubKeyPem);
            const importedKey = await crypto.subtle.importKey(
                'spki',
                pubKeyBuf,
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['verify']
            );

            const isValid = await crypto.subtle.verify(
                { name: 'ECDSA', hash: { name: 'SHA-256' } },
                importedKey,
                sigBuffer,
                pakBuffer
            );

            if (!isValid) {
                throw new Error(
                    'Assinatura do assets.pak falhou. Arquivo possivelmente corrompido ou adulterado!'
                );
            }
            console.log('[AssetLoader] Assinatura do pacote válida.');

            const pakDataView = new DataView(pakBuffer);
            const magicBuf = new Uint8Array(pakBuffer, 0, 12);
            const magicStr = this.textDecoder.decode(magicBuf);
            if (magicStr !== MAGIC_STRING) {
                throw new Error('Formato de pacote inválido: Magic String incorreta.');
            }

            const manifestSize = pakDataView.getUint32(12, true);
            const manifestBuf = new Uint8Array(pakBuffer, 16, manifestSize);
            const manifestStr = this.textDecoder.decode(manifestBuf);

            this.manifest = JSON.parse(manifestStr) as PakManifest;
            const dataStartOffset = 16 + manifestSize;

            for (const [filepath, entry] of Object.entries(this.manifest.files)) {
                const fileStart = dataStartOffset + entry.offset;
                const fileBuf = pakBuffer.slice(fileStart, fileStart + entry.size);

                const fileHash = await this.sha256(fileBuf);
                if (fileHash !== entry.hash) {
                    throw new Error(`Hash inválido para o arquivo: ${filepath}`);
                }

                this.memoryCache.set(filepath, fileBuf);
            }

            this.active = true;
            console.log(`[AssetLoader] Inicializado com sucesso! ${this.memoryCache.size} arquivos em cache.`);
        } catch (err) {
            console.error('[AssetLoader] Erro fatal ao inicializar:', err);
            throw err;
        }
    }

    /** Retorna um arquivo JSON parseado do pacote. */
    public async getJson<T>(relativePath: string): Promise<T | null> {
        if (!this.active) return null;

        const buf = this.memoryCache.get(normalizePackPath(relativePath));
        if (!buf) return null;

        const str = this.textDecoder.decode(buf);
        return JSON.parse(str) as T;
    }

    /** Texto bruto do pacote (ex.: `.calibration.json`). */
    public getText(relativePath: string): string | null {
        if (!this.active) return null;

        const buf = this.memoryCache.get(normalizePackPath(relativePath));
        if (!buf) return null;

        return this.textDecoder.decode(buf);
    }

    /** JSON do pacote ou fetch HTTP em modo loose. */
    public async fetchJson<T>(publicPath: string): Promise<T | null> {
        const packKey = normalizePackPath(publicPath);
        if (this.active) {
            return this.getJson<T>(packKey);
        }

        try {
            const url = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
            const res = await fetch(resolveApiUrl(url), { cache: 'no-store' });
            if (!res.ok) return null;
            return (await res.json()) as T;
        } catch {
            return null;
        }
    }

    /** Texto do pacote ou fetch HTTP em modo loose. */
    public async fetchText(publicPath: string): Promise<string | null> {
        if (this.active) {
            return this.getText(publicPath);
        }

        try {
            const url = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
            const res = await fetch(resolveApiUrl(url), { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.text();
        } catch {
            return null;
        }
    }

    /** Retorna uma URL de Blob para imagens. Faz cache da URL. */
    public getBlobUrl(relativePath: string, mimeType?: string): string | null {
        if (!this.active) return null;

        const key = normalizePackPath(relativePath);
        if (this.blobUrlCache.has(key)) {
            return this.blobUrlCache.get(key)!;
        }

        const buf = this.memoryCache.get(key);
        if (!buf) return null;

        const blob = new Blob([buf], { type: mimeType ?? inferMimeType(key) });
        const url = URL.createObjectURL(blob);
        this.blobUrlCache.set(key, url);
        return url;
    }

    /** Resolve caminho para blob URL (pacote) ou URL HTTP (loose). */
    public resolveAssetUrl(publicPath: string): string {
        const normalized = normalizePackPath(publicPath);
        if (this.active) {
            const blobUrl = this.getBlobUrl(normalized);
            if (blobUrl) return blobUrl;
        }
        const withSlash = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
        return resolveApiUrl(withSlash);
    }

    /** Carrega HTMLImageElement de tile/sprite (pacote ou loose). */
    public loadImageElement(publicPath: string, bustCache = false): Promise<HTMLImageElement> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img);
            let src = this.resolveAssetUrl(publicPath);
            if (bustCache && !src.startsWith('blob:') && !src.startsWith('data:')) {
                src = `${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}`;
            }
            img.src = src;
        });
    }
}

export const assetLoader = new AssetLoader();
