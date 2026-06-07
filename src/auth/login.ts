import '../shared/shell.css';
import { resolveAuthNextRedirect } from '../shared/authNavigation';
import { redirectIfAuthenticated, signIn } from '../shared/authGuard';

await redirectIfAuthenticated();

const form = document.getElementById('loginForm') as HTMLFormElement;
const errEl = document.getElementById('loginError') as HTMLElement;

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;
    try {
        await signIn(email, password);
        const next = new URLSearchParams(location.search).get('next');
        location.href = resolveAuthNextRedirect(next);
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Falha ao entrar.';
        errEl.hidden = false;
    }
});
