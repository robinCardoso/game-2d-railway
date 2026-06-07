import { writeFileSync } from 'node:fs';

writeFileSync(
    'desktop/electron/dist/package.json',
    JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
    'utf8'
);
