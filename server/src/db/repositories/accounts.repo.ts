import { getPool } from '../pool.js';

export interface AccountRow {
    id: string;
    email: string;
    password_hash: string;
    display_name: string | null;
    role: 'player' | 'gm' | 'admin';
    can_access_studio: boolean;
    created_at: string;
    updated_at: string;
}

export async function findAccountByEmail(email: string): Promise<AccountRow | null> {
    const pool = getPool();
    const { rows } = await pool.query<AccountRow>(
        `select * from accounts where lower(email) = lower($1) limit 1`,
        [email.trim()]
    );
    return rows[0] ?? null;
}

export async function findAccountById(id: string): Promise<AccountRow | null> {
    const pool = getPool();
    const { rows } = await pool.query<AccountRow>(`select * from accounts where id = $1 limit 1`, [id]);
    return rows[0] ?? null;
}

export async function createAccount(
    email: string,
    passwordHash: string,
    displayName: string | null,
    role: 'player' | 'gm' | 'admin' = 'player',
    canAccessStudio = false
): Promise<AccountRow> {
    const pool = getPool();
    const normalized = email.trim().toLowerCase();
    const { rows } = await pool.query<AccountRow>(
        `insert into accounts (email, password_hash, display_name, role, can_access_studio)
         values ($1, $2, $3, $4, $5)
         returning *`,
        [normalized, passwordHash, displayName, role, canAccessStudio]
    );
    return rows[0];
}
