import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getPool, isDatabaseConfigured } from './pool.js';
import { paths } from '../config/paths.js';
import { env } from '../config/env.js';

const migrationsDir = path.join(paths.projectRoot, 'database', 'migrations');

export async function runMigrations(): Promise<void> {
    if (!isDatabaseConfigured()) {
        console.warn('[migrate] DATABASE_URL ausente — migrations ignoradas.');
        return;
    }

    const pool = getPool();
    await pool.query(`
        create table if not exists schema_migrations (
            filename text primary key,
            applied_at timestamptz not null default now()
        )
    `);

    if (!fs.existsSync(migrationsDir)) {
        const msg = `[migrate] Pasta não encontrada: ${migrationsDir}`;
        if (env.isProduction) {
            throw new Error(msg);
        }
        console.warn(msg);
        return;
    }

    const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        const { rows } = await pool.query('select filename from schema_migrations where filename = $1', [
            file,
        ]);
        if (rows.length > 0) continue;

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const client = await pool.connect();
        try {
            await client.query('begin');
            await client.query(sql);
            await client.query('insert into schema_migrations (filename) values ($1)', [file]);
            await client.query('commit');
            console.log(`[migrate] Aplicada: ${file}`);
        } catch (err) {
            await client.query('rollback');
            throw err;
        } finally {
            client.release();
        }
    }
}

const isDirectRun =
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
    runMigrations()
        .then(() => {
            console.log('[migrate] Concluído.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('[migrate] Falhou:', err);
            process.exit(1);
        });
}
