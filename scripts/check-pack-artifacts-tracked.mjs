/**
 * Falha se chaves ECDSA ou artefatos do pack estiverem rastreados pelo Git.
 * Integrado em `npm test` — anti-regressão pós-merge.
 */
import { execSync } from 'node:child_process';

const FORBIDDEN_PATTERNS = [
    /^private_key\.pem$/,
    /^public_key\.pem$/,
    /\.pem\.bak$/,
    /^public\/assets\.pak$/,
    /^public\/assets\.sig$/,
    /^public\/public_key\.pem$/,
];

let tracked;
try {
    tracked = execSync('git ls-files', { encoding: 'utf8' })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
} catch (err) {
    console.error('[check-pack-artifacts] git ls-files falhou:', err instanceof Error ? err.message : err);
    process.exit(1);
}

const offenders = tracked.filter((path) => FORBIDDEN_PATTERNS.some((re) => re.test(path)));

if (offenders.length > 0) {
    console.error('[check-pack-artifacts] Arquivos sensíveis/gerados não devem estar no Git:');
    for (const path of offenders) {
        console.error(`  - ${path}`);
    }
    console.error('Use: git rm --cached <arquivo> e confirme .gitignore.');
    process.exit(1);
}

console.log('[check-pack-artifacts] OK — nenhum .pem/.pak/.sig rastreado.');
