import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

const markerFile = '.electron-output-dir';
let outputDir = 'release';

if (existsSync(markerFile)) {
    outputDir = readFileSync(markerFile, 'utf8').trim() || outputDir;
    unlinkSync(markerFile);
}

const args = [`--config.directories.output=${outputDir}`];
execSync(`npx electron-builder ${args.join(' ')}`, { stdio: 'inherit', shell: true });

console.log(`\n[electron:build] Artefatos em: ${outputDir}/`);
