import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Servidor unificado (Fase D): APIs em `server/`, Vite só faz proxy em dev. */
const API_PORT = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 8787);
const API_TARGET = `http://localhost:${API_PORT}`;

const TILES_ROOT = path.resolve(__dirname, 'tiles');

const TILE_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.json': 'application/json',
};

/**
 * Em dev, `/tiles` NÃO vai para o proxy da API:
 * - `?import` / `?url` → Vite resolve módulos (`import.meta.glob`, JSON)
 * - demais GET → arquivos estáticos em `tiles/` (sprites recém-salvos pelo Studio)
 */
function tilesDevPlugin(): Plugin {
    return {
        name: 'tiles-dev-static',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const rawUrl = req.url ?? '';
                if (!rawUrl.startsWith('/tiles/') && rawUrl !== '/tiles') {
                    next();
                    return;
                }
                if (/[?&](import|url)\b/.test(rawUrl)) {
                    next();
                    return;
                }

                const safePath = decodeURIComponent(rawUrl.split('?')[0]);
                const filePath = path.join(TILES_ROOT, safePath.replace(/^\/tiles\/?/, ''));
                const tilesRootNorm = path.normalize(TILES_ROOT + path.sep);
                const fileNorm = path.normalize(filePath);
                if (!fileNorm.startsWith(tilesRootNorm)) {
                    res.statusCode = 403;
                    res.end('Forbidden');
                    return;
                }
                if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                    next();
                    return;
                }

                const ext = path.extname(filePath).toLowerCase();
                res.setHeader('Content-Type', TILE_MIME[ext] ?? 'application/octet-stream');
                res.setHeader('Cache-Control', 'no-cache');
                fs.createReadStream(filePath).pipe(res);
            });
        },
    };
}

export default defineConfig({
    base: './',
    plugins: [tilesDevPlugin()],
    build: {
        target: 'es2022',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                studio: path.resolve(__dirname, 'studio.html'),
                play: path.resolve(__dirname, 'play.html'),
                login: path.resolve(__dirname, 'login.html'),
                register: path.resolve(__dirname, 'register.html'),
                characters: path.resolve(__dirname, 'characters.html'),
                charactersNew: path.resolve(__dirname, 'characters-new.html'),
                terms: path.resolve(__dirname, 'terms.html'),
                privacy: path.resolve(__dirname, 'privacy.html'),
            },
        },
    },
    server: {
        host: '127.0.0.1',
        proxy: {
            '/api': { target: API_TARGET, changeOrigin: true },
            '/health': { target: API_TARGET, changeOrigin: true },
            '/vocations.json': { target: API_TARGET, changeOrigin: true },
        },
    },
});
