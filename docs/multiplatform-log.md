## 27. Suporte Multiplataforma (Electron + Capacitor) (2026-06-06)

### 27.1 Estado Autoritativo e Ciclo de Vida
- **Arquivos:** `src/net/serverStateStore.ts`, `src/net/resyncController.ts`, `src/game/runtime/*`, `src/game/playApp.ts`
- **Mudança:** O estado do servidor (jogadores, criaturas, pings) é gravado no `serverStateStore` antes de despachar eventos para o loop do jogo. Isso evita que minimizar a janela do Electron (ou aba em background) "congele" o estado se o `requestAnimationFrame` for throttlado. O `resyncController` coordena o snap visual ao voltar de background com rate-limit local.
- **Ciclos de Vida:** `appLifecycle.ts` unifica eventos de visibility e focus, com implementações específicas para Web (`webLifecycle.ts`), Electron (`electronLifecycle.ts`) e Android/Capacitor (`capacitorLifecycle.ts`).
- **Atualização 2026-06-10:** `blur` (perda de foco) **≠** minimizar — `handlePlayFocusLost` só limpa teclas; `handlePlayPageHidden` trata minimize/visibility. Snap de câmera ao restaurar; dev sem ticket usa `confirmServerTile` em vez de snap para spawn stale. Ver [electron-desktop.md](./electron-desktop.md) §4.

### 27.2 Electron (Windows)
- **Arquivos:** `desktop/electron/main.ts`, `desktop/electron/preload.ts`, `package.json` (`build` — fonte única do electron-builder)
- **Mudança:** Cliente desktop que não pausa quando minimizado. Configurado com `backgroundThrottling: false` e `disable-renderer-backgrounding` para contornar problemas de rede e tick da engine durante combate em background.
- **Atualização 2026-06-10:** Sprites no instalador via `assets.pak` (`check-electron-asset-bundle.mjs`); `resolvePublicAssetUrl` para `file://`; release CI (`electron-release.yml`). Ver [electron-desktop.md](./electron-desktop.md).

### 27.3 Capacitor (Android)
- **Arquivos:** `capacitor.config.ts`, script `mobile:build`
- **Mudança:** Inicialização e configuração do Capacitor para portabilidade mobile, delegando o gerenciamento do WebSocket e background para plugins nativos, exigindo sync explícito no `resume` (`capacitorLifecycle.ts`).

### 27.4 Diagnóstico (F3) e Protocolo
- **Arquivos:** `src/game/debug/clientDiagnostics.ts`, `shared/protocol.ts`, `server/src/GameRoom.ts`
- **Mudança:** Inclusão dos campos `platform` e `clientBuildVersion` no handshake WS (`join`). Painel de debug local no cliente (`F3`) mostra ping, visibilidade, RTT e última vez que ocorreu state/creature/progress sync.
- **Snapshots periódicos:** O `GameRoom.ts` envia snapshots periódicos completos quando há clientes, evitando a perda total de contexto em caso de lag no front.

### Checklist Multiplataforma
- [x] Web client com `webLifecycle.ts` em funcionamento.
- [x] Electron minimizado sincroniza criaturas e player_moved.
- [x] Capacitor build scripts adicionados.
- [x] Diagnóstico F3 exibe estado da conexão em tempo real.
