import './desktopUpdateToast.css';

type UpdaterStatus =
    | { status: 'checking' }
    | { status: 'available'; version: string }
    | { status: 'not-available' }
    | { status: 'downloading'; percent: number; transferred: number; total: number }
    | { status: 'downloaded'; version: string }
    | { status: 'error'; message: string };

declare global {
    interface Window {
        electronAPI?: {
            platform: 'electron';
            getVersion: () => Promise<string>;
            updater?: {
                check: () => Promise<{ ok: boolean; reason?: string }>;
                download: () => Promise<{ ok: boolean; reason?: string }>;
                install: () => Promise<{ ok: boolean; reason?: string }>;
                onStatus: (callback: (status: UpdaterStatus) => void) => () => void;
            };
        };
    }
}

let toastElement: HTMLDivElement | null = null;

function getOrCreateToast(): HTMLDivElement {
    if (toastElement) return toastElement;
    toastElement = document.createElement('div');
    toastElement.className = 'desktop-update-toast hidden';
    document.body.appendChild(toastElement);
    return toastElement;
}

function showToast(html: string) {
    const el = getOrCreateToast();
    el.innerHTML = html;
    el.classList.remove('hidden');
}

function hideToast() {
    if (toastElement) {
        toastElement.classList.add('hidden');
    }
}

export function initDesktopUpdaterToast() {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    updater.onStatus((status) => {
        if (status.status === 'available') {
            showToast(`
                <div class="update-toast-title">Atualização Disponível</div>
                <div class="update-toast-desc">Uma nova versão (v${status.version}) está pronta para ser baixada.</div>
                <div class="update-toast-actions">
                    <button class="update-btn-primary" id="update-download-btn">Baixar Agora</button>
                    <button class="update-btn-secondary" id="update-later-btn">Depois</button>
                </div>
            `);

            document.getElementById('update-download-btn')?.addEventListener('click', () => {
                void updater.download();
            });
            document.getElementById('update-later-btn')?.addEventListener('click', () => {
                hideToast();
            });
        }

        if (status.status === 'downloading') {
            showToast(`
                <div class="update-toast-title">Baixando Atualização</div>
                <div class="update-toast-desc">Progresso: ${status.percent}% concluído</div>
                <div class="update-progress-bar">
                    <div class="update-progress-fill" style="width: ${status.percent}%"></div>
                </div>
            `);
        }

        if (status.status === 'downloaded') {
            const isPlayPage = /play\.html/i.test(location.href);
            const descText = isPlayPage 
                ? `Nova versão v${status.version} pronta. A instalação ocorrerá quando você sair do jogo ou ao reiniciar.`
                : `Nova versão v${status.version} instalada com sucesso. Reinicie o aplicativo para aplicar.`;

            showToast(`
                <div class="update-toast-title">Atualização Pronta</div>
                <div class="update-toast-desc">${descText}</div>
                <div class="update-toast-actions">
                    <button class="update-btn-primary" id="update-install-btn">Reiniciar Agora</button>
                    <button class="update-btn-secondary" id="update-close-btn">Depois</button>
                </div>
            `);

            document.getElementById('update-install-btn')?.addEventListener('click', () => {
                void updater.install();
            });
            document.getElementById('update-close-btn')?.addEventListener('click', () => {
                hideToast();
            });
        }

        if (status.status === 'error') {
            // Sem release no GitHub ainda — situação normal antes da 1ª publicação
            const benign =
                /no published versions/i.test(status.message) ||
                /couldn't be found/i.test(status.message) ||
                /404/i.test(status.message);
            if (benign) {
                hideToast();
                return;
            }

            showToast(`
                <div class="update-toast-title" style="color: #ef4444;">Erro ao Atualizar</div>
                <div class="update-toast-desc">${status.message}</div>
                <div class="update-toast-actions">
                    <button class="update-btn-secondary" id="update-error-close">Fechar</button>
                </div>
            `);
            document.getElementById('update-error-close')?.addEventListener('click', () => {
                hideToast();
            });
        }
    });

    // Aguarda 8 segundos antes de fazer a primeira verificação automática de updates
    setTimeout(() => {
        void updater.check();
    }, 8000);
}
