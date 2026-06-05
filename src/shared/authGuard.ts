import {
    apiFetchMe,
    apiLogin,
    apiLogout,
    apiRegister,
    isApiAuthEnabled,
    userToProfile,
    userToSession,
} from './authClient';
import {
    isMockAuthEnabled,
    mockGetProfile,
    mockGetSession,
    mockSignIn,
    mockSignOut,
    mockSignUp,
} from './mockAuth';
import type { AuthSession, UserProfile } from './types';

export async function getSession(): Promise<AuthSession | null> {
    if (isMockAuthEnabled()) {
        return mockGetSession();
    }
    if (isApiAuthEnabled()) {
        const user = await apiFetchMe();
        return user ? userToSession(user) : null;
    }
    return null;
}

export async function getProfile(): Promise<UserProfile | null> {
    if (isMockAuthEnabled()) {
        return mockGetProfile();
    }
    if (isApiAuthEnabled()) {
        const user = await apiFetchMe();
        return user ? userToProfile(user) : null;
    }
    return null;
}

export async function signUp(email: string, password: string): Promise<void> {
    if (isMockAuthEnabled()) {
        await mockSignUp(email, password);
        return;
    }
    if (isApiAuthEnabled()) {
        await apiRegister(email, password);
        return;
    }
    throw new Error('Autenticação não configurada.');
}

export async function signIn(email: string, password: string): Promise<void> {
    if (isMockAuthEnabled()) {
        await mockSignIn(email, password);
        return;
    }
    if (isApiAuthEnabled()) {
        await apiLogin(email, password);
        return;
    }
    throw new Error('Autenticação não configurada.');
}

export async function signOut(): Promise<void> {
    if (isMockAuthEnabled()) {
        mockSignOut();
        return;
    }
    if (isApiAuthEnabled()) {
        await apiLogout();
        return;
    }
}

export async function requireAuth(redirectTo = '/login.html'): Promise<AuthSession> {
    const session = await getSession();
    if (!session) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `${redirectTo}?next=${next}`;
        throw new Error('Não autenticado');
    }
    return session;
}

export async function requireStudioAccess(): Promise<UserProfile> {
    await requireAuth();
    const profile = await getProfile();
    if (!profile?.canAccessStudio) {
        alert('Acesso ao GM Studio negado. Use conta gm@gm.dev ou habilite can_access_studio.');
        location.href = '/characters.html';
        throw new Error('Sem acesso ao studio');
    }
    return profile;
}

export async function redirectIfAuthenticated(target = '/characters.html'): Promise<void> {
    const session = await getSession();
    if (session) {
        location.href = target;
    }
}
