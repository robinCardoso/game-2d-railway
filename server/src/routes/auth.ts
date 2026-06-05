import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/jwt.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { createAccount, findAccountByEmail, findAccountById } from '../db/repositories/accounts.repo.js';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6).max(128),
});

const loginSchema = registerSchema;

function accountToProfile(account: {
    id: string;
    email: string;
    display_name: string | null;
    role: 'player' | 'gm' | 'admin';
    can_access_studio: boolean;
}) {
    return {
        id: account.id,
        displayName: account.display_name ?? account.email.split('@')[0],
        email: account.email,
        role: account.role,
        canAccessStudio: account.can_access_studio || account.role === 'gm' || account.role === 'admin',
    };
}

function issueAuthResponse(account: {
    id: string;
    email: string;
    display_name: string | null;
    role: 'player' | 'gm' | 'admin';
    can_access_studio: boolean;
}) {
    const profile = accountToProfile(account);
    const token = signToken({
        sub: account.id,
        email: account.email,
        role: account.role,
        canAccessStudio: profile.canAccessStudio,
    });
    return { token, user: profile };
}

export function createAuthRouter(): Router {
    const router = Router();

    router.use((_req, res, next) => {
        if (!isDatabaseConfigured()) {
            res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL).' });
            return;
        }
        next();
    });

    router.post('/register', async (req, res, next) => {
        try {
            const parsed = registerSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: 'E-mail ou senha inválidos.' });
                return;
            }
            const { email, password } = parsed.data;
            const existing = await findAccountByEmail(email);
            if (existing) {
                res.status(409).json({ error: 'E-mail já cadastrado.' });
                return;
            }

            const normalized = email.trim().toLowerCase();
            const isGmDev = normalized === 'gm@gm.dev';
            const passwordHash = await hashPassword(password);
            const account = await createAccount(
                email,
                passwordHash,
                normalized.split('@')[0],
                isGmDev ? 'gm' : 'player',
                isGmDev
            );
            res.status(201).json(issueAuthResponse(account));
        } catch (err) {
            next(err);
        }
    });

    router.post('/login', async (req, res, next) => {
        try {
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: 'E-mail ou senha inválidos.' });
                return;
            }
            const { email, password } = parsed.data;
            const account = await findAccountByEmail(email);
            if (!account) {
                res.status(401).json({ error: 'E-mail ou senha incorretos.' });
                return;
            }
            const ok = await verifyPassword(password, account.password_hash);
            if (!ok) {
                res.status(401).json({ error: 'E-mail ou senha incorretos.' });
                return;
            }
            res.json(issueAuthResponse(account));
        } catch (err) {
            next(err);
        }
    });

    router.post('/logout', (_req, res) => {
        res.json({ success: true });
    });

    router.get('/me', requireAuth, async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const account = await findAccountById(authReq.auth!.sub);
            if (!account) {
                res.status(404).json({ error: 'Conta não encontrada.' });
                return;
            }
            res.json({ user: accountToProfile(account) });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
