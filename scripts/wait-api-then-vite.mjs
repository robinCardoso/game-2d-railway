/**
 * Aguarda a API Express responder em /health antes de subir o Vite (evita ECONNREFUSED no proxy).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import waitOn from 'wait-on';

const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 8787);
/** Usar 127.0.0.1 — alinhado ao host do Express/Vite em dev (evita só [::1] no Windows). */
const healthUrl = `http-get://127.0.0.1:${port}/health`;

await waitOn({
    resources: [healthUrl],
    timeout: 60_000,
    interval: 200,
    window: 500,
});

const viteBin = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin], { stdio: 'inherit' });

vite.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});
