import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
    sub: string;
    email: string;
    role: 'player' | 'gm' | 'admin';
    canAccessStudio: boolean;
}

const EXPIRES_IN = '7d';

export function signToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
    try {
        const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
        if (!decoded?.sub || !decoded?.email) return null;
        return decoded;
    } catch {
        return null;
    }
}
