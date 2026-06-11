/**
 * Electron main process — Elarion Online Desktop Client
 *
 * Configurações críticas para jogos que precisam continuar
 * processando enquanto minimizados:
 *
 * - backgroundThrottling: false — timers/animações não são reduzidos em background
 * - disable-renderer-backgrounding — impede Chromium de baixar prioridade de páginas ocultas
 * - powerSaveBlocker 'prevent-app-suspension' — mantém processo ativo
 */

import { app, BrowserWindow, ipcMain, powerSaveBlocker, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerUpdaterIpcHandlers, setupAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let powerSaveBlockerId: number | null = null;
let indexHtmlPath: string | null = null;

/**
 * Desativa aceleração GPU por padrão no Windows (drivers que derrubam o processo GPU do Chromium).
 * `--disable-gpu` na linha de comando não basta no Electron 36 — exige `disableHardwareAcceleration()` aqui.
 * Override: ELARION_DISABLE_GPU=false (forçar GPU) ou =true (forçar off em qualquer SO).
 */
function shouldDisableGpu(): boolean {
    const env = process.env['ELARION_DISABLE_GPU'];
    if (env === 'false') return false;
    if (env === 'true') return true;
    return process.platform === 'win32';
}

/** Deve rodar imediatamente após imports e antes de `app.whenReady` / `requestSingleInstanceLock`. */
function applyGpuStabilitySwitches(): void {
    if (!shouldDisableGpu()) return;

    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('disable-gpu-rasterization');
    app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
    app.commandLine.appendSwitch('disable-gpu-process-for-dx12-vulkan-video-decoder');
}

applyGpuStabilitySwitches();

// Impede Chromium de reduzir prioridade de renderers em background
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function logElectronMain(message: string, detail?: unknown): void {
    const suffix =
        detail === undefined
            ? ''
            : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    const line = `[${new Date().toISOString()}] ${message}${suffix}`;
    console.error(line);
    try {
        const logPath = path.join(app.getPath('userData'), 'electron-main.log');
        fs.appendFileSync(logPath, `${line}\n`, 'utf8');
    } catch {
        // userData pode não existir ainda em edge cases
    }
}

function loadCrashPage(win: BrowserWindow, title: string, detail: string): void {
    const safeTitle = title.replace(/</g, '&lt;');
    const safeDetail = detail.replace(/</g, '&lt;');
    const html = `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#0a0b0e;color:#e8e6e3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
.box{max-width:520px;text-align:center;}h1{color:#ef4444;font-size:1.25rem;margin:0 0 12px;}
p{color:#9ca3af;line-height:1.55;margin:0;}button{margin-top:20px;padding:10px 22px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;}
button:hover{background:#2563eb;}
.hint{margin-top:16px;font-size:0.85rem;color:#6b7280;}
</style></head><body><div class="box"><h1>${safeTitle}</h1><p>${safeDetail}</p>
<button type="button" id="retryBtn">Tentar novamente</button>
<p class="hint">Log: %APPDATA%\\tibia-web-engine\\electron-main.log. Se persistir, atualize o instalador ou defina <code>ELARION_DISABLE_GPU=true</code> antes de abrir.</p>
</div><script>document.getElementById('retryBtn').onclick=function(){location.reload()};</script></body></html>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function reloadMainContent(win: BrowserWindow): void {
    if (process.env['NODE_ENV'] === 'development') {
        void win.loadURL('http://localhost:5173/index.html');
        return;
    }
    if (indexHtmlPath) {
        void win.loadFile(indexHtmlPath);
    }
}

function attachWebContentsDiagnostics(win: BrowserWindow): void {
    const wc = win.webContents;

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        if (errorCode === -3) return; // ERR_ABORTED — navegação cancelada
        logElectronMain('did-fail-load', { errorCode, errorDescription, validatedURL });
        loadCrashPage(
            win,
            'Falha ao carregar o jogo',
            `${errorDescription} (código ${errorCode}).<br />URL: ${validatedURL}`
        );
    });

    wc.on('render-process-gone', (_event, details) => {
        logElectronMain('render-process-gone', details);
        if (details.reason === 'clean-exit' || win.isDestroyed()) return;
        loadCrashPage(
            win,
            'Elarion Online encerrou inesperadamente',
            `O processo de renderização parou (${details.reason}, exitCode ${details.exitCode}).`
        );
    });

    wc.on('unresponsive', () => {
        logElectronMain('renderer unresponsive');
    });

    wc.on('responsive', () => {
        logElectronMain('renderer responsive');
    });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    logElectronMain('second-instance blocked — exiting');
    app.quit();
} else {
    app.on('second-instance', () => {
        focusMainWindow();
    });
}

function focusMainWindow(): void {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
    mainWindow.focus();
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 960,
        minHeight: 540,
        title: 'Elarion Online',
        backgroundColor: '#0a0b0e',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            // Timers e requestAnimationFrame não são pausados ao minimizar
            backgroundThrottling: false,
        },
    });

    attachWebContentsDiagnostics(mainWindow);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    if (process.env['NODE_ENV'] === 'development') {
        void mainWindow.loadURL('http://localhost:5173/index.html');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        indexHtmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
        void mainWindow.loadFile(indexHtmlPath);
    }

    if (app.isPackaged) {
        try {
            setupAutoUpdater(mainWindow);
        } catch (err) {
            logElectronMain('updater init failed', err instanceof Error ? err.message : String(err));
        }
    }

    // Envia eventos de janela para o renderer (recebidos pelo preload via IPC)
    mainWindow.on('blur', () => {
        mainWindow?.webContents.send('window-blur');
    });

    mainWindow.on('focus', () => {
        mainWindow?.webContents.send('window-focus');
    });

    mainWindow.on('minimize', () => {
        mainWindow?.webContents.send('window-background');
    });

    mainWindow.on('restore', () => {
        mainWindow?.webContents.send('window-foreground');
    });

    mainWindow.on('show', () => {
        mainWindow?.webContents.send('window-foreground');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

if (gotTheLock) {
    app.whenReady().then(() => {
        logElectronMain('app ready', {
            version: app.getVersion(),
            gpuDisabled: shouldDisableGpu(),
            packaged: app.isPackaged,
        });

        registerUpdaterIpcHandlers();
        // Mantém o processo ativo mesmo minimizado — evita suspend do SO
        powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('child-process-gone', (_event, details) => {
        logElectronMain('child-process-gone', details);
        if (details.type === 'GPU' && details.reason === 'crashed' && mainWindow && !mainWindow.isDestroyed()) {
            void dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Problema de GPU',
                message: 'O processo de GPU do Elarion Online falhou.',
                detail:
                    'O cliente tentará continuar. Se a tela ficar em branco, reinicie o app. Versões 0.1.5 ou anteriores exigem reinstalar com build que inclui desativação de GPU no main process.',
                buttons: ['OK', 'Recarregar'],
            }).then(({ response }) => {
                if (response === 1 && mainWindow && !mainWindow.isDestroyed()) {
                    reloadMainContent(mainWindow);
                }
            });
        }
    });

    app.on('before-quit', () => {
        if (powerSaveBlockerId !== null) {
            powerSaveBlocker.stop(powerSaveBlockerId);
            powerSaveBlockerId = null;
        }
    });

    app.on('window-all-closed', () => {
        // No macOS é convenção manter o app aberto mesmo sem janelas
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}

// Expõe versão do app via IPC (usada pelo preload)
ipcMain.handle('get-app-version', () => app.getVersion());
