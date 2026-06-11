/**
 * Falha se o bundle Vite ainda embute modo loose (dev .env vazando no Electron).
 * Rodado após `vite build` em electron:build / electron:check.
 */
import fs from 'node:fs';
import path from 'node:path';

const distAssets = path.resolve('dist', 'assets');
const looseMarker = 'Usando modo loose assets';

if (!fs.existsSync(distAssets)) {
    console.error('[check-electron-asset-bundle] dist/assets/ não existe — rode vite build antes.');
    process.exit(1);
}

const offenders = [];
for (const name of fs.readdirSync(distAssets)) {
    if (!name.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(distAssets, name), 'utf8');
    if (!text.includes(looseMarker)) continue;
    // Tree-shake pode manter a string só no ramo morto; exige também early-return sem pak.
    if (/Usando modo loose assets[\s\S]{0,80}return\}\}/.test(text)) {
        offenders.push(name);
    }
}

if (offenders.length > 0) {
    console.error(
        '[check-electron-asset-bundle] Bundle com VITE_USE_LOOSE_ASSETS=true (sprites não carregam no Electron):',
        offenders.join(', '),
    );
    console.error('Rebuild com: cross-env VITE_USE_LOOSE_ASSETS=false npm run build');
    process.exit(1);
}

const pakPath = path.resolve('dist', 'assets.pak');
if (!fs.existsSync(pakPath) || fs.statSync(pakPath).size < 1024) {
    console.error('[check-electron-asset-bundle] dist/assets.pak ausente ou muito pequeno.');
    process.exit(1);
}

console.log('[check-electron-asset-bundle] OK — pak presente e bundle sem modo loose.');
