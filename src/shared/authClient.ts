import type { AuthSession, UserProfile } from './types';

const TOKEN_KEY = 'game2d_auth_token';

export function isApiAuthEnabled(): boolean {
    if (import.meta.env.VITE_AUTH_MOCK === 'true') return false;
    if (import.meta.env.VITE_AUTH_MOCK === 'false') return true;
    if (import.meta.env.PROD) return true;
    return import.meta.env.VITE_USE_API_AUTH === 'true';
}

export function getAuthToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setAuthToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export interface AuthUserResponse {
    id: string;
    email: string;
    displayName: string | null;
    role: UserProfile['role'];
    canAccessStudio: boolean;
}

export interface LoginResponse {
    token: string;
    user: AuthUserResponse;
}

async function parseError(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: string };
        return body.error ?? `HTTP ${res.status}`;
    } catch {
        return `HTTP ${res.status}`;
    }
}

export async function apiRegister(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as LoginResponse;
    setAuthToken(data.token);
    return data;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as LoginResponse;
    setAuthToken(data.token);
    return data;
}

export async function apiLogout(): Promise<void> {
    const token = getAuthToken();
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
            // ignore
        }
    }
    clearAuthToken();
}

export async function apiFetchMe(): Promise<AuthUserResponse | null> {
    const token = getAuthToken();
    if (!token) return null;
    const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        if (res.status === 401) clearAuthToken();
        return null;
    }
    const data = (await res.json()) as { user: AuthUserResponse };
    return data.user;
}

export function userToSession(user: AuthUserResponse): AuthSession {
    return { userId: user.id, email: user.email };
}

export function userToProfile(user: AuthUserResponse): UserProfile {
    return {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        canAccessStudio: user.canAccessStudio,
    };
}
