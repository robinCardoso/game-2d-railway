é totalmente possível instalar um sistema profissional de auto-update no Electron no seu projeto. E no seu caso faz bastante sentido, porque você já decidiu que o cliente desktop precisa continuar rodando em background/minimizado durante combate, e o Electron virou parte importante da stack.

Pelo estado atual do repositório, você já tem uma base boa:

Vite build web      → dist/
Electron main      → desktop/electron/main.ts
Electron preload   → desktop/electron/preload.ts
electron-builder   → já instalado
main do app        → desktop/electron/dist/main.js

Seu package.json já usa electron-builder e já tem electron:build, mas ainda não tem configuração de publicação/update nem dependência electron-updater.

O que você precisa para auto-update profissional

Para Windows, a forma mais prática e profissional é:

electron-builder + electron-updater + GitHub Releases ou servidor próprio

O electron-updater funciona com Windows NSIS, macOS e Linux, e o próprio electron-builder gera os arquivos de metadata do update, como latest.yml.

O fluxo profissional é assim:

1. Você altera a versão no package.json
2. Gera o instalador com electron-builder
3. Publica o instalador + latest.yml em um canal de update
4. O app instalado consulta esse canal
5. Se existir versão nova, baixa
6. Usuário escolhe instalar agora ou ao fechar

A documentação do electron-builder descreve exatamente esse fluxo: gerar metadata como latest.yml, publicar os artefatos e fazer o app consultar o servidor de updates.

Minha recomendação para seu jogo

Eu faria em 3 fases.

Fase 1 — Update manual com aviso visual

Essa é a mais segura para começar.

O app abre, verifica se tem update, e mostra no canto inferior direito:

Nova versão disponível
Versão 0.1.1 disponível.

[Baixar atualização]

Depois de baixar:

Atualização pronta
Reinicie o jogo para instalar.

[Reiniciar agora] [Depois]

Para jogo online, eu não recomendo instalar update automaticamente no meio da gameplay. Imagine o jogador em combate e o app reiniciar sozinho. Péssima experiência.

Então a regra ideal é:

Nunca reiniciar automaticamente durante play.html
Nunca instalar update durante combate
Permitir baixar em background
Instalar só quando o jogador clicar ou quando estiver fora do jogo
Fase 2 — Update obrigatório por versão mínima

Essa fase é importante para jogo online.

Exemplo: você muda protocolo WebSocket, combate, vocações ou formato do mapa. Aí clientes antigos podem quebrar ou trapacear sem querer.

Então o servidor Railway deveria expor algo assim:

GET /api/desktop/version

Resposta:

{
  "latestVersion": "0.1.4",
  "minimumVersion": "0.1.2",
  "forceUpdate": false,
  "message": "Melhorias no combate e correções do Electron."
}

Se o usuário estiver na versão 0.1.0 e o mínimo for 0.1.2, o app bloqueia o jogo:

Atualização obrigatória
Sua versão está antiga e não é mais compatível com o servidor.

[Atualizar agora]

Isso é muito importante para um jogo online autoritativo.

Fase 3 — Canais de update

Depois que o jogo crescer, eu separaria:

stable  → jogadores normais
beta    → testadores
dev     → você/teste interno

Assim você não quebra todos os jogadores com uma atualização nova.

Arquitetura que eu usaria no seu projeto

Hoje você tem:

desktop/electron/main.ts
desktop/electron/preload.ts
src/
dist/
server/

Eu criaria:

desktop/electron/
  main.ts
  preload.ts
  updater.ts
  updaterTypes.ts

src/desktop/
  updateClient.ts
  updateUi.ts
  updateStyles.css

  A divisão correta é:

main process
  verifica update
  baixa update
  instala update
  conversa com electron-updater

preload
  expõe API segura para o renderer

renderer/web
  mostra UI visual
  botão atualizar
  progresso
  mensagens

Você não deve expor o ipcRenderer inteiro para o jogo. Seu preload atual está correto nesse ponto: ele expõe uma API mínima via contextBridge, com contextIsolation: true e nodeIntegration: false.

Dependências necessárias

Você adicionaria:

npm install electron-updater

E provavelmente:

npm install --save-dev dotenv

O electron-builder já está instalado no seu projeto.

Configuração no package.json

Hoje seu package.json ainda está simples e sem bloco build de publicação.

Eu adicionaria algo assim:

{
  "name": "game-2d-railway",
  "version": "0.1.0",
  "main": "desktop/electron/dist/main.js",
  "build": {
    "appId": "com.robincardoso.game2drailway",
    "productName": "Game 2D Railway",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "desktop/electron/dist/**/*",
      "package.json"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "artifactName": "${productName}-${version}-Setup.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": false,
      "perMachine": false,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Game 2D Railway"
    },
    "publish": [
      {
        "provider": "github",
        "owner": "robinCardoso",
        "repo": "game-2d-railway",
        "releaseType": "release"
      }
    ]
  }
}

Para Windows, o target padrão mais comum com electron-builder é NSIS. A documentação do electron-builder tem uma seção própria para essa configuração.

Eu recomendo perMachine: false no começo. Isso instala no usuário atual, geralmente em AppData, e evita muitos problemas de permissão no auto-update. Instalar em Program Files pode exigir administrador e complicar atualização silenciosa.

Implementação no Electron main process

Seu main.ts atual já cria a janela, usa loadURL em dev e loadFile em produção, além de manter o app ativo em background com backgroundThrottling: false, disable-renderer-backgrounding e powerSaveBlocker.

Eu criaria um arquivo separado:

// desktop/electron/updater.ts
import { BrowserWindow, app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

let updateDownloaded = false;

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  if (!app.isPackaged) {
    return;
  }

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

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, reason: 'not-packaged' };
    }

    await autoUpdater.checkForUpdates();
    return { ok: true };
  });

  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) {
      return { ok: false, reason: 'not-packaged' };
    }

    await autoUpdater.downloadUpdate();
    return { ok: true };
  });

  ipcMain.handle('updater:install', () => {
    if (!updateDownloaded) {
      return { ok: false, reason: 'no-update-downloaded' };
    }

    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

E no seu main.ts:

import { setupAutoUpdater } from './updater.js';

Depois de criar a janela:

if (mainWindow) {
  setupAutoUpdater(mainWindow);
}

Mas eu colocaria uma regra importante:

setTimeout(() => {
  void autoUpdater.checkForUpdates();
}, 10_000);

Não precisa verificar update imediatamente no primeiro milissegundo do app. Melhor abrir a tela primeiro e depois checar.

Implementação no preload

Seu preload atual já expõe versão do app e eventos da janela.

Eu adicionaria:

type UpdaterStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number; transferred: number; total: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

contextBridge.exposeInMainWorld('electronAPI', {
  platform: 'electron' as const,

  getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  onWindowBackground: (callback: () => void) => on('window-background', callback),
  onWindowForeground: (callback: () => void) => on('window-foreground', callback),
  onWindowBlur: (callback: () => void) => on('window-blur', callback),
  onWindowFocus: (callback: () => void) => on('window-focus', callback),

  updater: {
    check: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('updater:check'),

    download: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('updater:download'),

    install: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('updater:install'),

    onStatus: (callback: (status: UpdaterStatus) => void): (() => void) => {
      const listener = (_event: unknown, status: UpdaterStatus) => callback(status);
      ipcRenderer.on('updater:status', listener);

      return () => {
        ipcRenderer.removeListener('updater:status', listener);
      };
    }
  }
});

Essa arquitetura mantém segurança: o renderer não acessa Node, não acessa filesystem, não acessa ipcRenderer diretamente.

UI profissional para o Electron

Eu não colocaria isso como modal gigante no começo. Para jogo, a melhor experiência é algo parecido com launcher moderno:

Quando existe update opcional

No canto inferior direito:

┌──────────────────────────────┐
│ Atualização disponível        │
│ Versão 0.1.1 pronta para baixar │
│                              │
│ [Atualizar] [Depois]          │
└──────────────────────────────┘
Durante download
┌──────────────────────────────┐
│ Baixando atualização          │
│ ███████████░░░░░ 68%          │
│ Você pode continuar jogando.  │
└──────────────────────────────┘
Depois de baixar
┌──────────────────────────────┐
│ Atualização pronta            │
│ Reinicie para instalar.       │
│                              │
│ [Reiniciar agora] [Depois]    │
└──────────────────────────────┘
Se estiver em combate

Aqui precisa ser inteligente:

┌──────────────────────────────┐
│ Atualização pronta            │
│ Instalação será feita quando  │
│ você sair do combate.         │
└──────────────────────────────┘

Essa é a regra que eu colocaria no seu jogo:

Pode verificar update: sim
Pode baixar update: sim
Pode instalar update: somente fora de combate/tela segura

Telas seguras:

index.html
login.html
characters.html
characters-new.html

Telas sensíveis:

play.html
studio.html, se estiver salvando algo
Onde colocar visualmente

No seu jogo, eu criaria um componente global simples carregado em todas as páginas:

src/ui/desktopUpdateToast.ts
src/ui/desktopUpdateToast.css

E importaria nas entradas principais:

import './ui/desktopUpdateToast';

O componente detecta:

window.electronAPI?.updater

Se não existir, não faz nada. Assim ele não afeta web nem mobile.

Exemplo de UI em TypeScript puro
// src/ui/desktopUpdateToast.ts
type UpdaterStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

declare global {
  interface Window {
    electronAPI?: {
      updater?: {
        check: () => Promise<{ ok: boolean; reason?: string }>;
        download: () => Promise<{ ok: boolean; reason?: string }>;
        install: () => Promise<{ ok: boolean; reason?: string }>;
        onStatus: (callback: (status: UpdaterStatus) => void) => () => void;
      };
    };
  }
}

function createToast() {
  const el = document.createElement('div');
  el.className = 'desktop-update-toast hidden';
  document.body.appendChild(el);
  return el;
}

function renderToast(el: HTMLElement, html: string) {
  el.classList.remove('hidden');
  el.innerHTML = html;
}

function hideToast(el: HTMLElement) {
  el.classList.add('hidden');
}

export function initDesktopUpdaterToast() {
  const updater = window.electronAPI?.updater;
  if (!updater) return;

  const toast = createToast();

  updater.onStatus((status) => {
    if (status.status === 'available') {
      renderToast(toast, `
        <strong>Atualização disponível</strong>
        <span>Versão ${status.version} disponível.</span>
        <div class="desktop-update-actions">
          <button id="desktop-update-download">Atualizar</button>
          <button id="desktop-update-later">Depois</button>
        </div>
      `);

      document.getElementById('desktop-update-download')?.addEventListener('click', () => {
        void updater.download();
      });

      document.getElementById('desktop-update-later')?.addEventListener('click', () => {
        hideToast(toast);
      });
    }

    if (status.status === 'downloading') {
      renderToast(toast, `
        <strong>Baixando atualização</strong>
        <span>${status.percent}% concluído</span>
        <div class="desktop-update-bar">
          <div style="width: ${status.percent}%"></div>
        </div>
      `);
    }

    if (status.status === 'downloaded') {
      renderToast(toast, `
        <strong>Atualização pronta</strong>
        <span>Reinicie o jogo para instalar a versão ${status.version}.</span>
        <div class="desktop-update-actions">
          <button id="desktop-update-install">Reiniciar agora</button>
          <button id="desktop-update-later">Depois</button>
        </div>
      `);

      document.getElementById('desktop-update-install')?.addEventListener('click', () => {
        void updater.install();
      });

      document.getElementById('desktop-update-later')?.addEventListener('click', () => {
        hideToast(toast);
      });
    }

    if (status.status === 'error') {
      renderToast(toast, `
        <strong>Erro ao atualizar</strong>
        <span>${status.message}</span>
      `);
    }
  });

  setTimeout(() => {
    void updater.check();
  }, 10_000);
}

CSS:

.desktop-update-toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: 320px;
  padding: 16px;
  z-index: 99999;
  border: 1px solid rgba(255, 215, 90, 0.35);
  border-radius: 14px;
  background: rgba(10, 11, 14, 0.96);
  color: #f7f2df;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
  font-family: system-ui, sans-serif;
}

.desktop-update-toast.hidden {
  display: none;
}

.desktop-update-toast strong {
  display: block;
  margin-bottom: 6px;
  color: #ffd75a;
  font-size: 15px;
}

.desktop-update-toast span {
  display: block;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.9;
}

.desktop-update-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.desktop-update-actions button {
  border: 0;
  border-radius: 9px;
  padding: 8px 12px;
  cursor: pointer;
  background: #ffd75a;
  color: #16130a;
  font-weight: 700;
}

.desktop-update-actions button + button {
  background: rgba(255, 255, 255, 0.12);
  color: #f7f2df;
}

.desktop-update-bar {
  margin-top: 12px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.desktop-update-bar div {
  height: 100%;
  background: #ffd75a;
}

Cuidado importante com GitHub Releases

Você pode usar GitHub Releases, mas tem alguns pontos:

O repositório precisa publicar os artefatos corretamente.
O arquivo latest.yml precisa ir junto.
A versão do package.json precisa subir a cada release.
O app instalado precisa ter sido gerado com publish configurado.

O electron-builder usa a configuração publish para saber onde publicar artefatos e metadados de update.

Como publicar

Depois de configurar:

npm version patch
npm run electron:build

Para publicar via GitHub:

set GH_TOKEN=seu_token
npx electron-builder --win --publish always

Ou no PowerShell:

$env:GH_TOKEN="seu_token"
npx electron-builder --win --publish always

Isso deve gerar/publishar arquivos parecidos com:

Game 2D Railway-0.1.1-Setup.exe
latest.yml

O latest.yml é essencial para o update. Sem ele, o app não sabe qual versão existe.

Assinatura digital: precisa?

Para Windows, funciona sem assinatura, mas o usuário pode ver alerta do SmartScreen:

Windows protegeu o computador

Profissionalmente, para distribuição pública, o ideal é comprar certificado de assinatura de código.

Ordem de prioridade:

Fase teste interno     → sem assinatura
Primeiros jogadores    → ainda pode ser sem assinatura
Lançamento público     → assinatura digital

Para macOS, assinatura/notarização é praticamente obrigatória para uma experiência profissional, e a documentação do auto-update do electron-builder destaca que code signing é exigido no macOS.

O que eu não faria no seu jogo

Eu não faria update silencioso total agora.

Evitaria:

baixou → fechou o jogo sozinho → instalou

Para aplicativo comum isso até funciona. Para jogo online, é perigoso.

Também não faria:

verificar update a cada 1 minuto

Melhor:

ao abrir o app
a cada 6 horas
quando voltar para tela de personagens
quando o servidor avisar incompatibilidade
Integração com seu servidor Railway

Eu faria dois mecanismos separados:

1. Electron auto-update

Responsável por baixar instalador/update:

GitHub Releases ou servidor estático
2. API de compatibilidade

Responsável por dizer se a versão pode jogar:

Railway API

Exemplo:

GET /api/client-version?platform=electron&version=0.1.0

Resposta:

{
  "ok": false,
  "forceUpdate": true,
  "latestVersion": "0.1.2",
  "minimumVersion": "0.1.2",
  "message": "Atualização obrigatória para compatibilidade com o servidor."
}

Essa parte é muito importante porque o update do Electron sozinho não garante que o jogador esteja numa versão permitida.

Checklist profissional

Eu faria exatamente nessa ordem:

1. Instalar electron-updater
2. Criar desktop/electron/updater.ts
3. Adicionar IPC seguro no preload
4. Criar UI toast no renderer
5. Adicionar build.publish no package.json
6. Configurar GitHub Releases
7. Gerar versão 0.1.1
8. Instalar versão 0.1.0 localmente
9. Publicar 0.1.1
10. Abrir 0.1.0 e validar update
11. Adicionar API /api/client-version no servidor
12. Bloquear play.html se versão estiver abaixo do mínimo
Minha opinião final

Sim, vale a pena implementar.

Para seu projeto, eu usaria:

electron-updater
electron-builder
GitHub Releases no começo
UI toast dentro do app
bloqueio de versão mínima via Railway
nunca reiniciar no meio do combate

A arquitetura atual já está preparada para isso porque você tem main.ts, preload.ts, contextBridge e electron-builder. O que falta é criar uma camada formal de update e uma UI específica para o usuário controlar o momento da instalação.