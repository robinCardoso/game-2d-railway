import { getAuthToken, isApiAuthEnabled } from './authClient';
import { isMockAuthEnabled } from './mockAuth';

async function resolveAuthToken(): Promise<string | null> {
    if (isApiAuthEnabled()) {
        return getAuthToken();
    }
    if (isMockAuthEnabled()) {
        return 'mock-gm';
    }
    return null;
}

/**
 * Fetch autenticado para APIs do servidor (/api/*).
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await resolveAuthToken();
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
    }
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(path, { ...options, headers });
}
