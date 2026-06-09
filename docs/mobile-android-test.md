# Teste Android (Capacitor) — dispositivo real

Guia rápido para rodar o fluxo **login → roster → criar → play** no celular. O Studio continua bloqueado em mobile.

## Pré-requisitos

| Item | Notas |
|------|--------|
| **Node.js ≥ 22** | Capacitor CLI 8 não roda no Node 20. Use `.nvmrc` (`22`) com nvm/fnm. |
| **Android Studio** | SDK + platform-tools; emulador ou USB com depuração ativa. |
| **JDK 17+** | Incluído com Android Studio (Settings → Build → Gradle JDK). |

Verifique:

```bash
node -v          # v22.x
java -version    # 17+
adb devices      # dispositivo listado
```

## Backend (recomendado: Railway)

O app instalado **não** usa same-origin. O build lê `.env.production`:

```env
VITE_API_BASE_URL=https://game-2d-railway-production.up.railway.app
VITE_WS_BASE_URL=wss://game-2d-railway-production.up.railway.app
VITE_BUILD_VERSION=0.1.1
```

O servidor já aceita origens do WebView Capacitor (`https://localhost`, etc.) para CORS de `/api/*`.

### Dev contra PC local (opcional)

1. Descubra o IP da LAN (`ipconfig` → IPv4).
2. Crie `.env.mobile.local` (não commitar) ou exporte antes do build:

```env
VITE_API_BASE_URL=http://192.168.x.x:8787
VITE_WS_BASE_URL=ws://192.168.x.x:8787
```

3. Rode `npm run dev` no PC (API + Vite).
4. No Android, pode ser necessário **cleartext HTTP** — use produção Railway na primeira vez para validar o fluxo.

## Build e instalação

```bash
# 1) Uma vez — gera pasta android/
npm run mobile:init

# 2) Build web + sync assets nativos (não compila o servidor — app usa API remota)
npm run mobile:build

# 3) Abrir no Android Studio
npm run mobile:open:android
```

No Android Studio: **Run** (▶) no emulador ou dispositivo USB.

Alternativa CLI (com device conectado):

```bash
npx cap run android
```

## Checklist manual no dispositivo

- [ ] **Login / registro** — inputs grandes, teclado não cobre botões (safe-area).
- [ ] **Roster** — preview no topo, lista horizontal, botão **Entrar** fixo.
- [ ] **Criar personagem** — 3 passos, **Próximo** fixo, preview com chroma key.
- [ ] **Studio** — link/botão oculto ou mensagem de bloqueio em mobile.
- [ ] **Play** — HUD compacta, sheet Atributos, zoom 44px, loading escuro.
- [ ] **Entrada no mundo** — overlay de entrada; toast se failsafe liberar spawn.
- [ ] **Background** — minimizar app e voltar; WS reconecta (`capacitorLifecycle`).
- [ ] **Sprites** — personagem e tiles carregam via URL absoluta do Railway.

## Live reload (dev)

Em `capacitor.config.ts`, descomente temporariamente (não commitar IP fixo):

```ts
server: {
  url: 'http://192.168.x.x:5173',
  cleartext: true,
  androidScheme: 'https',
},
```

Depois: `npx cap sync android` e Run. O WebView aponta para o Vite do PC.

## Problemas comuns

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `Capacitor CLI requires NodeJS >= 22` | Node 20 no PATH | Atualizar para Node 22 |
| Login falha / CORS | Origem não permitida | Deploy recente do servidor (origens Capacitor) |
| Tela branca | `dist/` vazio | `npm run mobile:build` antes do sync |
| WS não conecta | `VITE_WS_BASE_URL` errado | Conferir `.env.production` e rebuild |
| Imagens 404 | API base incorreta | Mesmo host em `VITE_API_BASE_URL` |

## Referências

- [docs/hosting.md](./hosting.md) — variáveis Railway e Capacitor
- [docs/playstore-steam-roadmap.md](./playstore-steam-roadmap.md) — roadmap Play Store
