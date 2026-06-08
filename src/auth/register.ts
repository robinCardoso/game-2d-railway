import './auth-pages.css';
import { redirectIfAuthenticated, signUp } from '../shared/authGuard';
import { track } from '../shared/analytics';
import { initDesktopClientShell } from '../ui/initDesktopClient';
import { bindPasswordToggles, createAuthFormHelpers } from './authFormUi';

initDesktopClientShell();

await redirectIfAuthenticated();

const form = document.getElementById('registerForm') as HTMLFormElement | null;
const errEl = document.getElementById('registerError') as HTMLElement | null;

if (!form || !errEl) {
    throw new Error('Formulário de registro não encontrado.');
}

const { showError, hideError, setLoading } = createAuthFormHelpers(form, errEl, {
    idle: 'Criar conta',
    loading: 'Criando conta...',
});

bindPasswordToggles();

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const email = (document.getElementById('email') as HTMLInputElement).value.trim().toLowerCase();
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const password2 = (document.getElementById('password2') as HTMLInputElement).value;
    const termsInput = document.getElementById('terms') as HTMLInputElement | null;

    if (!isValidEmail(email)) {
        showError('Informe um e-mail válido.');
        return;
    }

    if (password.length < 8) {
        showError('A senha precisa ter pelo menos 8 caracteres.');
        return;
    }

    if (password !== password2) {
        showError('As senhas não coincidem.');
        return;
    }

    if (!termsInput?.checked) {
        showError('Você precisa aceitar os termos para criar sua conta.');
        return;
    }

    try {
        setLoading(true);
        await signUp(email, password);
        track('register_complete', { email: email.includes('@') ? email.split('@')[1] : 'unknown' });
        location.href = 'characters.html';
    } catch (err) {
        showError(err instanceof Error ? err.message : 'Não foi possível criar sua conta.');
    } finally {
        setLoading(false);
    }
});
