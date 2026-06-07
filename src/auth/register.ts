import '../shared/shell.css';
import { redirectIfAuthenticated, signUp } from '../shared/authGuard';
import { track } from '../shared/analytics';
import { initDesktopClientShell } from '../ui/initDesktopClient';

initDesktopClientShell();

await redirectIfAuthenticated();

const form = document.getElementById('registerForm') as HTMLFormElement;
const errEl = document.getElementById('registerError') as HTMLElement;

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const password2 = (document.getElementById('password2') as HTMLInputElement).value;
    if (password !== password2) {
        errEl.textContent = 'As senhas não coincidem.';
        errEl.hidden = false;
        return;
    }
    try {
        await signUp(email, password);
        track('register_complete', { email: email.split('@')[1] });
        location.href = 'characters.html';
    } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Falha no registro.';
        errEl.hidden = false;
    }
});
