/**
 * Libera portas do dev stack antes de `npm run dev` (evita EADDRINUSE por instâncias órfãs).
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const apiPort = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 8787);
const webPort = Number(process.env.VITE_DEV_PORT ?? 5173);
const ports = [...new Set([apiPort, webPort])];

function listListeningPids(port) {
    if (platform() === 'win32') {
        try {
            const output = execSync(`netstat -ano -p tcp | findstr ":${port} "`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const pids = new Set();
            for (const line of output.split('\n')) {
                if (!line.includes('LISTENING')) continue;
                const pid = Number(line.trim().split(/\s+/).at(-1));
                if (Number.isInteger(pid) && pid > 0) pids.add(pid);
            }
            return [...pids];
        } catch {
            return [];
        }
    }

    try {
        return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((pid) => Number(pid))
            .filter((pid) => Number.isInteger(pid) && pid > 0);
    } catch {
        return [];
    }
}

function killPid(pid) {
    if (platform() === 'win32') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        return;
    }
    process.kill(pid, 'SIGTERM');
}

for (const port of ports) {
    const pids = listListeningPids(port);
    for (const pid of pids) {
        try {
            killPid(pid);
            console.log(`[dev] Porta ${port} liberada (PID ${pid})`);
        } catch {
            /* processo já encerrou */
        }
    }
}
