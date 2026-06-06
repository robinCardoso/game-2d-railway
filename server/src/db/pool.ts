import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

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
            ssl:
                env.databaseSsl || /railway\.(app|internal)/i.test(env.databaseUrl)
                    ? { rejectUnauthorized: false }
                    : undefined,
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
