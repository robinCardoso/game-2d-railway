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

class AssetLoader {
    private active = false;
    private manifest: PakManifest | null = null;
    private memoryCache = new Map<string, ArrayBuffer>();
    private blobUrlCache = new Map<string, string>();
    private textDecoder = new TextDecoder('utf-8');

    public isPackaged(): boolean {
        return this.active;
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
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    public async initialize(): Promise<void> {
        if (import.meta.env.VITE_USE_LOOSE_ASSETS === 'true') {
            console.log('[AssetLoader] Usando modo loose assets (arquivos soltos).');
            return;
        }

        try {
            console.log('[AssetLoader] Tentando baixar assets.pak ...');
            
            // 1. Baixar tudo em paralelo
            const [pakRes, sigRes, pubKeyRes] = await Promise.all([
                fetch(resolveApiUrl(PAK_URL)),
                fetch(resolveApiUrl(SIG_URL)),
                fetch(resolveApiUrl(PUB_KEY_URL))
            ]);

            if (!pakRes.ok) {
                console.log('[AssetLoader] Pacote assets.pak não encontrado. Fallback para loose files.');
                return;
            }

            const pakBuffer = await pakRes.arrayBuffer();
            const sigBuffer = await sigRes.arrayBuffer();
            const pubKeyPem = await pubKeyRes.text();

            // 2. Importar chave pública
            const pubKeyBuf = this.pemToArrayBuffer(pubKeyPem);
            const importedKey = await crypto.subtle.importKey(
                'spki',
                pubKeyBuf,
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['verify']
            );

            // 3. Validar assinatura (Camada 4)
            const isValid = await crypto.subtle.verify(
                { name: 'ECDSA', hash: { name: 'SHA-256' } },
                importedKey,
                sigBuffer,
                pakBuffer
            );

            if (!isValid) {
                throw new Error('Assinatura do assets.pak falhou. Arquivo possivelmente corrompido ou adulterado!');
            }
            console.log('[AssetLoader] Assinatura do pacote válida.');

            // 4. Ler cabeçalho do pacote
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

            // 5. Validar hashes e carregar arquivos na memória (Camada 2)
            for (const [filepath, entry] of Object.entries(this.manifest.files)) {
                const fileStart = dataStartOffset + entry.offset;
                const fileBuf = pakBuffer.slice(fileStart, fileStart + entry.size);
                
                // Validação de Hash para cada arquivo
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
            throw err; // Impedir que o jogo continue se o pacote estiver adulterado
        }
    }

    /** Retorna um arquivo JSON parseado */
    public async getJson<T>(relativePath: string): Promise<T | null> {
        if (!this.active) return null;
        
        const buf = this.memoryCache.get(relativePath);
        if (!buf) return null;

        const str = this.textDecoder.decode(buf);
        return JSON.parse(str) as T;
    }

    /** Retorna uma URL de Blob para imagens. Faz cache da URL. */
    public getBlobUrl(relativePath: string, mimeType = 'image/png'): string | null {
        if (!this.active) return null;

        if (this.blobUrlCache.has(relativePath)) {
            return this.blobUrlCache.get(relativePath)!;
        }

        const buf = this.memoryCache.get(relativePath);
        if (!buf) return null;

        const blob = new Blob([buf], { type: mimeType });
        const url = URL.createObjectURL(blob);
        this.blobUrlCache.set(relativePath, url);
        return url;
    }

    /** Resolve um caminho genérico (usa o pacote se ativo, ou url normal) */
    public resolveAssetUrl(publicPath: string): string {
        if (this.active) {
            // Remove a barra inicial se existir
            const relativePath = publicPath.replace(/^\//, '');
            const blobUrl = this.getBlobUrl(relativePath);
            if (blobUrl) return blobUrl;
        }
        // Fallback natural
        return publicPath;
    }
}

export const assetLoader = new AssetLoader();
