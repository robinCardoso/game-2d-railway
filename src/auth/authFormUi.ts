const EYE_ICON = '/assets/ui/icon-eye.svg';
const EYE_OFF_ICON = '/assets/ui/icon-eye-off.svg';

export function bindPasswordToggles(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-toggle-password]').forEach((button) => {
        button.addEventListener('click', () => {
            const inputId = button.dataset.togglePassword;
            if (!inputId) return;

            const input = document.getElementById(inputId) as HTMLInputElement | null;
            if (!input) return;

            const shouldShow = input.type === 'password';
            input.type = shouldShow ? 'text' : 'password';
            button.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
            button.setAttribute('aria-pressed', shouldShow ? 'true' : 'false');

            const icon = button.querySelector('img');
            if (icon) {
                icon.src = shouldShow ? EYE_OFF_ICON : EYE_ICON;
            }
        });
    });
}

export function createAuthFormHelpers(
    form: HTMLFormElement,
    errEl: HTMLElement,
    submitLabels: { idle: string; loading: string }
) {
    const showError = (message: string): void => {
        errEl.textContent = message;
        errEl.hidden = false;
    };

    const hideError = (): void => {
        errEl.textContent = '';
        errEl.hidden = true;
    };

    const setLoading = (isLoading: boolean): void => {
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (!submit) return;
        submit.disabled = isLoading;
        submit.textContent = isLoading ? submitLabels.loading : submitLabels.idle;
    };

    return { showError, hideError, setLoading };
}
