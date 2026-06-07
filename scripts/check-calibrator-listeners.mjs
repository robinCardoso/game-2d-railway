import { readFileSync } from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'src/editor/characterCalibratorModal.ts');
const source = readFileSync(target, 'utf8');
const lines = source.split('\n');

const offenders = lines
    .map((line, index) => ({ line: line.trim(), index: index + 1 }))
    .filter(({ line }) => line.includes('addEventListener('))
    .filter(({ line }) => !line.includes('bind(') && !line.includes('target?.addEventListener'));

if (offenders.length > 0) {
    console.error('[check-calibrator-listeners] Listeners sem bind()/signal encontrados:');
    for (const { line, index } of offenders) {
        console.error(`  ${target}:${index}: ${line}`);
    }
    process.exit(1);
}

console.log('[check-calibrator-listeners] OK — todos os addEventListener passam por bind().');
