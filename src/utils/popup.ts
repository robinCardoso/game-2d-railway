/**
 * PREMIUM POPUP & TOAST NOTIFICATION SYSTEM
 * 
 * Um substituto moderno, fluido e esteticamente agradável para alert() e confirm() do navegador.
 * Projetado para suportar glassmorphism, micro-animações e compatibilidade futura.
 */

let toastContainer: HTMLDivElement | null = null;
let modalOverlay: HTMLDivElement | null = null;

function getOrCreateToastContainer(): HTMLDivElement {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

export const toast = {
    show(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 4000) {
        const container = getOrCreateToastContainer();
        const item = document.createElement('div');
        item.className = `toast-item ${type}`;

        let icon = '🔔';
        if (type === 'success') icon = '✨';
        else if (type === 'error') icon = '⚠️';

        item.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(item);

        // Animação de entrada
        requestAnimationFrame(() => {
            item.classList.add('show');
        });

        // Auto-destruição após a duração
        setTimeout(() => {
            item.classList.remove('show');
            item.addEventListener('transitionend', () => {
                item.remove();
            });
        }, duration);
    },

    success(message: string, duration?: number) {
        this.show(message, 'success', duration);
    },

    error(message: string, duration?: number) {
        this.show(message, 'error', duration);
    },

    info(message: string, duration?: number) {
        this.show(message, 'info', duration);
    }
};

export const popup = {
    /**
     * Exibe um modal popup interativo com promessa (awaitável)
     */
    alert(message: string, title: string = 'Mensagem do Sistema'): Promise<void> {
        return new Promise((resolve) => {
            // Remove modal anterior se houver
            if (modalOverlay) {
                modalOverlay.remove();
            }

            modalOverlay = document.createElement('div');
            modalOverlay.className = 'custom-modal-overlay';

            modalOverlay.innerHTML = `
                <div class="custom-modal-box">
                    <div class="custom-modal-header">
                        <span class="custom-modal-title">⚙️ ${title}</span>
                    </div>
                    <div class="custom-modal-body">${message}</div>
                    <div class="custom-modal-footer">
                        <button class="custom-modal-btn primary" id="modalOkBtn">Confirmar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modalOverlay);

            // Animação de entrada
            requestAnimationFrame(() => {
                modalOverlay!.classList.add('show');
            });

            const okBtn = modalOverlay.querySelector('#modalOkBtn') as HTMLButtonElement;
            const close = () => {
                modalOverlay!.classList.remove('show');
                modalOverlay!.addEventListener('transitionend', () => {
                    modalOverlay!.remove();
                    modalOverlay = null;
                    resolve();
                }, { once: true });
            };

            okBtn.onclick = close;
        });
    },

    /**
     * Exibe um modal popup de confirmação Sim/Não com promessa (awaitável)
     */
    confirm(message: string, title: string = 'Confirmação Requerida'): Promise<boolean> {
        return new Promise((resolve) => {
            if (modalOverlay) {
                modalOverlay.remove();
            }

            modalOverlay = document.createElement('div');
            modalOverlay.className = 'custom-modal-overlay';

            modalOverlay.innerHTML = `
                <div class="custom-modal-box">
                    <div class="custom-modal-header">
                        <span class="custom-modal-title">❓ ${title}</span>
                    </div>
                    <div class="custom-modal-body">${message}</div>
                    <div class="custom-modal-footer">
                        <button class="custom-modal-btn secondary" id="modalCancelBtn">Não</button>
                        <button class="custom-modal-btn primary" id="modalOkBtn">Sim</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modalOverlay);

            requestAnimationFrame(() => {
                modalOverlay!.classList.add('show');
            });

            const okBtn = modalOverlay.querySelector('#modalOkBtn') as HTMLButtonElement;
            const cancelBtn = modalOverlay.querySelector('#modalCancelBtn') as HTMLButtonElement;

            const close = (result: boolean) => {
                modalOverlay!.classList.remove('show');
                modalOverlay!.addEventListener('transitionend', () => {
                    modalOverlay!.remove();
                    modalOverlay = null;
                    resolve(result);
                }, { once: true });
            };

            okBtn.onclick = () => close(true);
            cancelBtn.onclick = () => close(false);
        });
    },

    /**
     * Campo de texto com Confirmar/Cancelar. Retorna `null` se cancelado.
     */
    prompt(
        message: string,
        defaultValue: string = '',
        title: string = 'Entrada'
    ): Promise<string | null> {
        return new Promise((resolve) => {
            if (modalOverlay) {
                modalOverlay.remove();
            }

            modalOverlay = document.createElement('div');
            modalOverlay.className = 'custom-modal-overlay';

            const safeDefault = defaultValue.replace(/"/g, '&quot;');

            modalOverlay.innerHTML = `
                <div class="custom-modal-box">
                    <div class="custom-modal-header">
                        <span class="custom-modal-title">✏️ ${title}</span>
                    </div>
                    <div class="custom-modal-body">
                        <p style="margin:0 0 10px 0;">${message}</p>
                        <input type="text" id="modalPromptInput" class="select-full" value="${safeDefault}"
                            style="width:100%;background:#111318;border:1px solid #3f4452;border-radius:6px;padding:8px 10px;color:#fff;font-size:13px;outline:none;" />
                    </div>
                    <div class="custom-modal-footer">
                        <button class="custom-modal-btn secondary" id="modalCancelBtn">Cancelar</button>
                        <button class="custom-modal-btn primary" id="modalOkBtn">Confirmar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modalOverlay);

            requestAnimationFrame(() => {
                modalOverlay!.classList.add('show');
            });

            const input = modalOverlay.querySelector('#modalPromptInput') as HTMLInputElement;
            const okBtn = modalOverlay.querySelector('#modalOkBtn') as HTMLButtonElement;
            const cancelBtn = modalOverlay.querySelector('#modalCancelBtn') as HTMLButtonElement;

            input?.focus();
            input?.select();

            const close = (result: string | null) => {
                modalOverlay!.classList.remove('show');
                modalOverlay!.addEventListener('transitionend', () => {
                    modalOverlay!.remove();
                    modalOverlay = null;
                    resolve(result);
                }, { once: true });
            };

            okBtn.onclick = () => close(input?.value ?? '');
            cancelBtn.onclick = () => close(null);
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            });
        });
    },
};
