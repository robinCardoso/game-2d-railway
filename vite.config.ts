import { defineConfig } from 'vite';
import path from 'path';

/** Servidor unificado (Fase D): APIs em `server/`, Vite só faz proxy em dev. */
const API_PORT = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 8787);
const API_TARGET = `http://localhost:${API_PORT}`;

export default defineConfig({
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
        proxy: {
            '/api': { target: API_TARGET, changeOrigin: true },
            '/health': { target: API_TARGET, changeOrigin: true },
            '/tiles': { target: API_TARGET, changeOrigin: true },
        },
    },
});
