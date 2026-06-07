import { BrowserWindow, app, ipcMain } from 'electron';
import type { AppUpdater } from 'electron-updater';

// electron-updater é CommonJS — require evita erro de named export no app empacotado
const { autoUpdater } = require('electron-updater') as { autoUpdater: AppUpdater };

let updateDownloaded = false;

export function setupAutoUpdater(mainWindow: BrowserWindow) {
    // Apenas ativa se o app estiver empacotado (produção)
    if (!app.isPackaged) {
        return;
    }

    // Configura download manual e impede instalar ao fechar para evitar quebras silenciosas
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
        mainWindow.webContents.send('updater:status', {
            status: 'checking'
        });
    });

    autoUpdater.on('update-available', (info) => {
        mainWindow.webContents.send('updater:status', {
            status: 'available',
            version: info.version
        });
    });

    autoUpdater.on('update-not-available', () => {
        mainWindow.webContents.send('updater:status', {
            status: 'not-available'
        });
    });

    autoUpdater.on('download-progress', (progress) => {
        mainWindow.webContents.send('updater:status', {
            status: 'downloading',
            percent: Math.round(progress.percent),
            transferred: progress.transferred,
            total: progress.total
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        updateDownloaded = true;
        mainWindow.webContents.send('updater:status', {
            status: 'downloaded',
            version: info.version
        });
    });

    autoUpdater.on('error', (error) => {
        mainWindow.webContents.send('updater:status', {
            status: 'error',
            message: error.message
        });
    });

    // Registra os handlers IPC invocados pelo Preload / Renderer
    ipcMain.handle('updater:check', async () => {
        if (!app.isPackaged) {
            return { ok: false, reason: 'not-packaged' };
        }
        try {
            await autoUpdater.checkForUpdates();
            return { ok: true };
        } catch (err) {
            return { ok: false, reason: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('updater:download', async () => {
        if (!app.isPackaged) {
            return { ok: false, reason: 'not-packaged' };
        }
        try {
            void autoUpdater.downloadUpdate();
            return { ok: true };
        } catch (err) {
            return { ok: false, reason: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('updater:install', () => {
        if (!updateDownloaded) {
            return { ok: false, reason: 'no-update-downloaded' };
        }
        // Inicia a instalação NSIS imediatamente, reiniciando o app de forma segura
        autoUpdater.quitAndInstall(false, true);
        return { ok: true };
    });
}
