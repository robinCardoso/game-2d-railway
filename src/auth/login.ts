import './auth-pages.css';
import '../ui/player-flow-mobile.css';
import { resolveAuthNextRedirect } from '../shared/authNavigation';
import { redirectIfAuthenticated, signIn } from '../shared/authGuard';
import { isMockAuthEnabled } from '../shared/mockAuth';
import { initDesktopClientShell } from '../ui/initDesktopClient';
import { bindPasswordToggles, createAuthFormHelpers } from './authFormUi';

initDesktopClientShell();

await redirectIfAuthenticated();

const form = document.getElementById('loginForm') as HTMLFormElement | null;
const errEl = document.getElementById('loginError') as HTMLElement | null;

if (!form || !errEl) {
    throw new Error('Formulário de login não encontrado.');
}

const { showError, hideError, setLoading } = createAuthFormHelpers(form, errEl, {
    idle: 'Entrar',
    loading: 'Entrando...',
});

bindPasswordToggles();

const mockHintEl = document.getElementById('authMockHint');
if (mockHintEl) {
    mockHintEl.hidden = !isMockAuthEnabled();
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;

    if (!email || !password) {
        showError('Informe seu e-mail e senha para entrar.');
        return;
    }

    try {
        setLoading(true);
        await signIn(email, password);
        const next = new URLSearchParams(location.search).get('next');
        location.href = resolveAuthNextRedirect(next);
    } catch (err) {
        showError(err instanceof Error ? err.message : 'Não foi possível entrar na conta.');
    } finally {
        setLoading(false);
    }
});
