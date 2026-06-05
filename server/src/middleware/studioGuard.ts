import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { verifyToken } from '../auth/jwt.js';
import { findAccountById } from '../db/repositories/accounts.repo.js';
import { isDatabaseConfigured } from '../db/pool.js';

export interface StudioAuthLocals {
    userId: string;
    email?: string;
}

export async function requireStudioGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    if (env.studioMockGm) {
        next();
        return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
        res.status(401).json({ error: 'Token de autenticação ausente.' });
        return;
    }

    // Dev: apiFetch mock envia Bearer mock-gm (auth localStorage)
    if (env.nodeEnv !== 'production' && token === 'mock-gm') {
        (req as Request & { studioAuth?: StudioAuthLocals }).studioAuth = {
            userId: 'mock-gm',
            email: 'gm@mock.dev',
        };
        next();
        return;
    }

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
        return;
    }

    let canAccess =
        payload.canAccessStudio ||
        payload.role === 'gm' ||
        payload.role === 'admin';

    if (isDatabaseConfigured()) {
        try {
            const account = await findAccountById(payload.sub);
            if (account) {
                canAccess =
                    account.can_access_studio ||
                    account.role === 'gm' ||
                    account.role === 'admin';
            }
        } catch (err) {
            console.error('[studioGuard] Erro ao buscar conta:', err);
        }
    }

    if (!canAccess) {
        res.status(403).json({ error: 'Acesso ao GM Studio negado.' });
        return;
    }

    (req as Request & { studioAuth?: StudioAuthLocals }).studioAuth = {
        userId: payload.sub,
        email: payload.email,
    };
    next();
}
