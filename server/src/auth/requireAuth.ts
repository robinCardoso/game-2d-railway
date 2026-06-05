import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from './jwt.js';

export type AuthenticatedRequest = Request & { auth?: JwtPayload };

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
        res.status(401).json({ error: 'Token de autenticação ausente.' });
        return;
    }
    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
        return;
    }
    req.auth = payload;
    next();
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (token) {
        const payload = verifyToken(token);
        if (payload) req.auth = payload;
    }
    next();
}
