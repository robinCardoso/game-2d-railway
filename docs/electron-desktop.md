# Cliente desktop Electron — empacotamento, release e lifecycle

Guia das implementações **jun/2026** para o instalador Windows (`Elarion Online-X.Y.Z-Setup.exe`), carregamento de assets e correções de minimizar/restaurar.

Última revisão: **2026-06-10**

---

## Índice

1. [Carregamento de assets (`assets.pak`)](#1-carregamento-de-assets-assetspak)
2. [URLs em `file://` (Electron)](#2-urls-em-file-electron)
3. [Release automático no GitHub](#3-release-automático-no-github)
4. [Ciclo de vida: minimizar / restaurar / foco](#4-ciclo-de-vida-minimizar--restaurar--foco)
5. [Ambiente de desenvolvimento](#5-ambiente-de-desenvolvimento)
6. [Checklist de regressão](#6-checklist-de-regressão)
7. [Arquivos principais](#7-arquivos-principais)

---

## 1. Carregamento de assets (`assets.pak`)

### Problema (0.1.1)

Com `VITE_USE_LOOSE_ASSETS=true` no `.env` local, o `vite build` do Electron embutia só o ramo “loose” do `assetLoader`. O tree-shaking removia o código do `assets.pak`. No instalador, o console mostrava:

```text
[AssetLoader] Usando modo loose assets (arquivos soltos).
```

Sprites de personagem, itens, magias e UI não carregavam; o chão às vezes aparecia (tiles via glob do Vite).

### Solução

| Medida | Onde |
|--------|------|
| `VITE_USE_LOOSE_ASSETS=false` forçado no build Electron | `package.json` — `electron:build`, `electron:check` |
| Validação pós-build | `scripts/check-electron-asset-bundle.mjs` |
| `assets.pak` copiado para `dist/` | `vite build` + `pack-assets.mjs` |

O script de check falha se:

- O bundle JS contém o early-return do modo loose; ou
- `dist/assets.pak` está ausente ou &lt; 1 KB.

```bash
npm run electron:check   # build + compile + check-electron-asset-bundle
```

**Regra:** `VITE_USE_LOOSE_ASSETS=true` só no `.env` de **dev Studio** (`npm run dev`). **Nunca** no build de produção/Electron.

---

## 2. URLs em `file://` (Electron)

No Electron, a página carrega como `file://`. Caminhos absolutos `/assets/...` ou `/tiles/...` quebram.

### `resolvePublicAssetUrl()`

Arquivo: `src/shared/apiUrl.ts`

- Em `file://`: resolve em relação à URL da página (`new URL(normalized, window.location.href)`).
- Em HTTP(S): delega para `resolveApiUrl()` (same-origin ou `VITE_API_BASE_URL`).

Usado por: `assetLoader`, catálogos (`itemCatalog`, `spellCatalog`, `vocationRegistry`), `tileCatalog`, `worldEntryOverlay`, ícones HUD, auth UI, etc.

**Teste:** `src/shared/apiUrl.test.ts`

---

## 3. Release automático no GitHub

### Fonte única da versão

`VITE_BUILD_VERSION` em `.env.production` → `scripts/sync-desktop-version.mjs` → `package.json` (NSIS + `electron-updater`).

### Fluxo (push na `main`)

1. Editar `VITE_BUILD_VERSION` em `.env.production` (e URLs Railway se necessário).
2. `npm run sync:desktop-version` e commitar `.env.production` + `package.json`.
3. Push na `main` → workflow [`.github/workflows/electron-release.yml`](../.github/workflows/electron-release.yml).
4. Só publica se a **versão subiu** (`scripts/detect-env-production-version-bump.mjs`).

### Comandos

```bash
npm run sync:desktop-version   # .env.production → package.json
npm run electron:build         # instalador local em release/
npm run electron:publish       # build + --publish always (GH_TOKEN ou gh auth)
```

### Anti-drift

`scripts/check-desktop-version-sync.mjs` roda em `npm test` — falha se `package.json` ≠ `.env.production`.

### Auto-update no cliente

- `electron-updater` consulta a Release ~8 s após abrir.
- Download e restart **só com confirmação** do jogador (`desktopUpdateToast.ts`).
- Mesma versão instalada não atualiza — precisa bump + nova Release.

Detalhes de deploy: [hosting.md](./hosting.md) § Electron.

---

## 4. Ciclo de vida: minimizar / restaurar / foco

### Sintoma

Ao minimizar e restaurar (ou alt-tab), o personagem ou a câmera “saltavam” para outro lugar.

### Causas identificadas

1. **`blur` ≠ minimizar** — No Windows, ao restaurar a janela o Electron dispara `window-blur` logo após `window-foreground`. O handler de “ocultar” rodava de novo e desfazia o restore.
2. **Snap para `movementPrediction.serverTile` desatualizado** — Em dev sem `VITE_USE_SERVER_WS_TICKET`, o tile autoritativo ficava no spawn enquanto o cliente andava via WS.
3. **Câmera sem snap** — O personagem era estabilizado, mas a câmera continuava com lerp (`quality: high`), dando impressão de movimento na tela.
4. **`resync` + `position_correction`** — Correção redundante do servidor após restore gerava slide desnecessário.

### Implementação (`src/game/playApp.ts`)

| Evento | Handler | Comportamento |
|--------|---------|---------------|
| `onBackground` (minimizar) | `handlePlayPageHidden` | Sync WS, limpa input, estabiliza posição/câmera |
| `onForeground` (restaurar) | `handlePlayPageVisible` | Estabiliza + `resyncController.requestResync()` + reset `lastLoopMs` |
| `onFocusLost` (blur) | `handlePlayFocusLost` | **Só** `clearPlayMovementInput()` |
| `onFocusGained` (focus) | `handlePlayFocusGained` | Snap câmera + reset `lastLoopMs` |

**Modo ticket WS** (`isServerAuthoritativePosition()` = true em produção):

- Snap para `movementPrediction.serverTile*` no minimize/restore.
- `recordPredictedMove` a cada tile novo.

**Dev sem ticket** (localhost, mock):

- `confirmServerTile()` a cada tile com WS conectado — mantém `serverTile` alinhado.
- Estabilização local (sem teleporte para spawn antigo).
- `VITE_USE_SERVER_WS_TICKET=true` **exige** `DATABASE_URL` no servidor — ver §5.

Outras proteções:

- `snapPlayCameraToLocalPlayer()` em estabilização e após `position_correction` real.
- `position_correction` ignorado se tile + `worldX/Y` já alinhados.
- `MAX_PLAY_FRAME_DT_MS = 100` no loop Play — evita saltos após pausa longa do `requestAnimationFrame`.

### IPC Electron

`desktop/electron/main.ts` → `window-background` / `window-foreground` / `window-blur` / `window-focus`  
`desktop/electron/preload.ts` → `electronAPI.onWindow*`  
`src/game/runtime/electronLifecycle.ts` → wiring para `AppLifecycleHandlers`

### Checklist manual

1. Entrar no Play, ficar **parado**, minimizar e restaurar — sem salto.
2. Repetir **andando** (parar antes de minimizar).
3. Alt-tab para outra janela e voltar — sem salto de câmera.
4. Produção (`PROD` + ticket WS): mesmo teste após `electron:build`.

---

## 5. Ambiente de desenvolvimento

### `.env` recomendado (dev local)

```env
VITE_API_BASE_URL=http://localhost:5173
VITE_WS_BASE_URL=ws://localhost:8787
VITE_USE_LOOSE_ASSETS=true
# NÃO ativar sem Postgres local:
# VITE_USE_SERVER_WS_TICKET=true
```

| Variável | Dev | Produção / Electron build |
|----------|-----|---------------------------|
| `VITE_USE_LOOSE_ASSETS` | `true` (Studio hot-reload) | omitir ou `false` |
| `VITE_USE_SERVER_WS_TICKET` | omitir (ticket local `createEnterTicket`) | auto `true` em `PROD` |
| `DATABASE_URL` | opcional | obrigatório no Railway |

**Erro comum:** `VITE_USE_SERVER_WS_TICKET=true` sem `DATABASE_URL` → 503 em `/api/ws-ticket`, spell-slots, etc. O WS ainda conecta (servidor não exige ticket sem DB), mas o cliente fica em estado inconsistente.

**Simular produção em dev:** Postgres local + `DATABASE_URL` + `VITE_USE_SERVER_WS_TICKET=true`.

### Comandos

```bash
npm run electron:dev    # API :8787 + Vite :5173 + Electron
npm run electron:check  # validação pré-release (pak + bundle)
npm test                # inclui check-desktop-version-sync + check-electron-asset-bundle (via electron:check no CI)
```

Reinicie `electron:dev` após alterar `.env` (Vite não recarrega `VITE_*` em quente).

### Aviso CSP no console (dev)

`Electron Security Warning (Insecure Content-Security-Policy)` — normal em `electron:dev` com `unsafe-eval` do Vite. **Não aparece** no app empacotado.

---

## 6. Checklist de regressão

- [ ] `npm run electron:check` passa (pak presente, sem modo loose no bundle).
- [ ] `npm test` passa (`check-desktop-version-sync`).
- [ ] Instalador carrega sprites — console: `[AssetLoader] Inicializado com sucesso! N arquivos em cache`.
- [ ] Minimizar/restaurar sem salto (parado e andando).
- [ ] Alt-tab sem salto de câmera.
- [ ] Bump de `VITE_BUILD_VERSION` + push gera Release no GitHub Actions.
- [ ] `.env` de dev **sem** `VITE_USE_LOOSE_ASSETS` vazando no `electron:build`.

---

## 7. Arquivos principais

| Arquivo | Função |
|---------|--------|
| `src/game-data/assetLoader.ts` | Pak vs loose; log de inicialização |
| `src/shared/apiUrl.ts` | `resolveApiUrl`, `resolvePublicAssetUrl` |
| `scripts/check-electron-asset-bundle.mjs` | Gate pós-build Electron |
| `scripts/sync-desktop-version.mjs` | Versão desktop |
| `scripts/check-desktop-version-sync.mjs` | Anti-drift versão |
| `scripts/detect-env-production-version-bump.mjs` | Guard CI release |
| `scripts/run-electron-builder.mjs` | `ELECTRON_PUBLISH` |
| `.github/workflows/electron-release.yml` | Release Windows automática |
| `src/game/playApp.ts` | Lifecycle Play + predição movimento |
| `src/game/runtime/electronLifecycle.ts` | IPC janela Electron |
| `src/net/resyncController.ts` | Resync ao voltar do background |
| `desktop/electron/main.ts` | Eventos minimize/focus |
| `desktop/electron/updater.ts` | Auto-update |
| `src/ui/desktopUpdateToast.ts` | UI de update |

Documentação relacionada: [hosting.md](./hosting.md), [multiplatform-log.md](./multiplatform-log.md), [README.md](../README.md) § Clientes instalados.
