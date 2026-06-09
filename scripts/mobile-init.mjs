#!/usr/bin/env node
/**
 * Inicializa o projeto Android (Capacitor) — exige Node >= 22.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
    console.error(
        `[mobile:init] Capacitor CLI 8 exige Node >= 22 (atual: ${process.versions.node}).\n` +
            '  Instale a LTS em https://nodejs.org/ ou use fnm/nvm: nvm install 22 && nvm use 22',
    );
    process.exit(1);
}

const androidDir = path.join(process.cwd(), 'android');
if (fs.existsSync(androidDir)) {
    console.log('[mobile:init] Pasta android/ já existe — pulando cap add android.');
} else {
    console.log('[mobile:init] Adicionando plataforma Android…');
    execSync('npx cap add android', { stdio: 'inherit' });
}

console.log('[mobile:init] Próximo passo: npm run mobile:build');
