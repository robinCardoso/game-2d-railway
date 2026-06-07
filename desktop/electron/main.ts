/**
 * Electron main process — Game 2D Railway Desktop Client
 *
 * Configurações críticas para jogos que precisam continuar
 * processando enquanto minimizados:
 *
 * - backgroundThrottling: false — timers/animações não são reduzidos em background
 * - disable-renderer-backgrounding — impede Chromium de baixar prioridade de páginas ocultas
 * - powerSaveBlocker 'prevent-app-suspension' — mantém processo ativo
 */

import { app, BrowserWindow, ipcMain, powerSaveBlocker } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let powerSaveBlockerId: number | null = null;

// Impede Chromium de reduzir prioridade de renderers em background
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 960,
        minHeight: 540,
        title: 'Game 2D Railway',
        backgroundColor: '#0a0b0e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            // Timers e requestAnimationFrame não são pausados ao minimizar
            backgroundThrottling: false,
        },
    });

    if (process.env['NODE_ENV'] === 'development') {
        void mainWindow.loadURL('http://localhost:5173/play.html');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        void mainWindow.loadFile(
            path.join(__dirname, '..', '..', 'dist', 'play.html')
        );
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

app.whenReady().then(() => {
    // Mantém o processo ativo mesmo minimizado — evita suspend do SO
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
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

// Expõe versão do app via IPC (usada pelo preload)
ipcMain.handle('get-app-version', () => app.getVersion());
