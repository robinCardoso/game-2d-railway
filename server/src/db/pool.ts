import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Railway: internal (*.railway.internal), HTTP proxy (*.railway.app) ou TCP público (*.rlwy.net). */
function shouldUsePostgresSsl(connectionString: string): boolean {
    return (
        env.databaseSsl ||
        /railway\.(app|internal)/i.test(connectionString) ||
        /\.rlwy\.net/i.test(connectionString)
    );
}

export function isDatabaseConfigured(): boolean {
    return !!env.databaseUrl;
}

export function getPool(): pg.Pool {
    if (!env.databaseUrl) {
        throw new Error('DATABASE_URL não configurada.');
    }
    if (!pool) {
        pool = new Pool({
            connectionString: env.databaseUrl,
            ssl: shouldUsePostgresSsl(env.databaseUrl) ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pool;
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
