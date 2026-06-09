# Hospedagem — Railway (migração)

Documento oficial de deploy. Rascunho histórico: [`.cursor/plans/railway.md`](../.cursor/plans/railway.md).

Última revisão: **2026-06-05**

---

## Visão geral

O projeto migra para **Railway** como plataforma principal:

| Fase | Serviços Railway | Auth / DB |
|------|------------------|-----------|
| **A** | 1× `app` (Node.js) | Supabase (legado) |
| **B** | `app` + `postgres` | Auth JWT própria + PostgreSQL Railway |
| **C** | `app` + `postgres` | WS seguro, ticket backend, posição autoritativa |
| **D (atual)** | `app` + `postgres` | APIs unificadas; sem Supabase legado |

Na **Fase D**, um único processo Node em [`server/`](../server/) serve em produção; em dev o Vite faz proxy para o mesmo servidor:

- Frontend compilado (MPA: `index.html`, `play.html`, `studio.html`, …)
- Assets estáticos (`/tiles/**`)
- **Auth e personagens** (`/api/auth/*`, `/api/characters/*`)
- APIs do Studio GM (`/api/*`)
- WebSocket de jogo (mesmo domínio)
- Health check (`/health`)

```mermaid
flowchart LR
    Browser --> App[Railway app Node.js]
    App --> Dist[dist/ MPA]
    App --> Tiles[/tiles/]
    App --> Auth[/api/auth + characters]
    App --> API[/api/ Studio]
    App --> WS[WebSocket]
    App --> Vol[Volume /data]
    App --> PG[(PostgreSQL)]
```

---

## Fases da migração

### Fase A — Deploy unificado (concluída)

- Servidor Express + WebSocket + static MPA
- APIs do Studio portadas do `vite.config.ts` para Express
- Volume Railway para dados mutáveis (mapas, sprites, presets)
- Supabase para login/personagens (substituído na Fase B)

### Fase B — Backend próprio (concluída)

- PostgreSQL Railway + migrations em `database/migrations/`
- `POST /api/auth/register`, `/login`, `/logout`, `GET /me`
- CRUD de personagens em `/api/characters/*`
- Frontend usa JWT (`game2d_auth_token` em localStorage)
- Studio guard valida JWT + `can_access_studio` no banco

### Fase C — Produção segura (concluída)

- `POST /api/ws-ticket` — ticket HMAC assinado só no backend
- Join WS obrigatório com ticket em produção (`REQUIRE_WS_TICKET`)
- Posição salva pelo servidor WebSocket
- Reconexão WS proativa aos 13 min

### Fase D — Limpeza (esta fase)

- **APIs unificadas:** implementação única em `server/src/studio/`; `vite.config.ts` só faz proxy `/api` → `:8787`
- `npm run dev` sobe Vite + Express juntos (`concurrently`)
- Removido `supabase/schema.sql` — schema em `database/migrations/`
- Sem `@supabase/supabase-js` no projeto

---

## Fase B — Deploy passo a passo

### 1. Criar projeto Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Selecione o repositório `game-2d-railway`
3. Um serviço `app` será criado automaticamente

### 2. PostgreSQL

1. No projeto → **New** → **Database** → **PostgreSQL**
2. No serviço `app` → **Variables** → adicione referência:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
3. Migrations rodam automaticamente no boot (`database/migrations/*.sql`)

Tabelas criadas:

| Migration | Conteúdo |
|-----------|----------|
| `001_init.sql` | `accounts` (email, senha bcrypt, role, `can_access_studio`) |
| `002_characters.sql` | `characters` (outfit, posição, mapa, soft-delete) |

### 3. Volume (obrigatório para Studio)

O filesystem do container é **efêmero**. Sem volume, saves de mapa/sprite são perdidos no redeploy.

1. No serviço `app` → **Volumes** → **Add Volume**
2. Mount path: `/data`
3. Variável: `DATA_ROOT=/data`

O servidor grava em `/data`:

- `maps/` — JSON editáveis
- `tiles/` — sprites de mapa e personagens
- `tile_catalog.json`, `auto_border_sets.json`, `creature_presets.json`, `outfit_presets.json`

Na primeira execução, o boot copia seeds do repositório para `/data` se os diretórios estiverem vazios.

### 4. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Auto (Railway) | Porta HTTP/WS; não definir manualmente |
| `NODE_ENV` | Sim | `production` |
| `HOST` | Opcional | Padrão `0.0.0.0` em produção |
| `DATABASE_URL` | Sim | URL PostgreSQL (referência ao serviço Railway) |
| `JWT_SECRET` | Sim | Segredo para tokens de sessão (string longa e aleatória) |
| `BCRYPT_ROUNDS` | Opcional | Padrão `10` |
| `DATA_ROOT` | Sim (Studio) | `/data` |
| `ENTER_TICKET_SECRET` | Sim | Segredo HMAC do ticket WS (somente servidor) |
| `WS_TICKET_TTL_MS` | Opcional | Validade do ticket (padrão `300000` = 5 min) |
| `WS_POSITION_SAVE_INTERVAL_MS` | Opcional | Debounce save posição (padrão `20000`) |
| `REQUIRE_WS_TICKET` | Auto | `true` em produção com `DATABASE_URL`; `false` força dev sem ticket |
| `CLIENT_ORIGIN` | Recomendado | `https://seu-app.up.railway.app` |
| `STUDIO_MOCK_GM` | Dev only | `true` = APIs Studio sem JWT (não usar em prod) |

**Build do frontend** (variáveis `VITE_*` no Railway ou CI):

| Variável build | Descrição |
|----------------|-----------|
| `VITE_STUDIO_GUARD` | `true` em produção |
| `VITE_GAME_SERVER_WS` | Deixar vazio = same-origin `wss://` |
| `VITE_USE_SERVER_WS_TICKET` | Dev: força `POST /api/ws-ticket` |
| `VITE_USE_API_AUTH` | Só em dev: força API em vez de mock |
| `VITE_AUTH_MOCK` | `true`/`false` para override explícito |

Em produção, auth API está **ativa por padrão** (sem variáveis `VITE_*` extras).

### 5. Build e Start

Configurados em [`railway.json`](../railway.json):

```bash
# Build (Railway)
npm install && npm install --prefix server && npm run build

# Start (Node — server compilado em server/dist/)
npm run start --prefix server
```

### 6. Conta GM

Registre com e-mail `*@gm.dev` (ex.: `gm@gm.dev`) — o servidor define `role=gm` e `can_access_studio=true` automaticamente.

### 7. Verificação pós-deploy

| URL | Esperado |
|-----|----------|
| `/` | Landing |
| `/login.html` | Login (JWT API) |
| `/characters.html` | Lista de personagens |
| `/play.html` | Jogo + WS conectado |
| `/studio.html` | Editor GM (exige `can_access_studio`) |
| `/health` | JSON `{ status: "ok", phase: "railway-d", ... }` |
| `/tiles/...` | Sprites PNG |

**Checklist funcional:**

- [ ] Registro e login (`POST /api/auth/register`, `/login`)
- [ ] Criação e listagem de personagem
- [ ] Play com movimento e multiplayer (2 abas)
- [ ] Studio: listar/salvar mapa (com token GM)
- [ ] Studio: salvar sprite de mapa
- [ ] Após redeploy, mapas/sprites salvos persistem (volume)
- [ ] Dados de conta/personagem persistem (PostgreSQL)

---

## WebSocket seguro (Fase C)

Fluxo em `play.html`:

1. Login → JWT em `localStorage`
2. `POST /api/ws-ticket` com `{ characterId }` e header `Authorization: Bearer`
3. Servidor retorna `{ ticket, expiresAt }` com posição autoritativa do PostgreSQL
4. Cliente conecta WS e envia `join` com `enterTicket`
5. Servidor valida ticket, ignora nome/posição do cliente, persiste movimentos no DB

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/ws-ticket` | Bearer | Emite ticket WS para personagem da conta |

Em dev (`npm run dev`), ticket local via `createEnterTicket` continua disponível quando `VITE_USE_SERVER_WS_TICKET` não está ativo.

---

## Auth API (Fase B)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/register` | — | Cria conta, retorna JWT |
| POST | `/api/auth/login` | — | Login, retorna JWT |
| POST | `/api/auth/logout` | Bearer | Invalida sessão (cliente limpa token) |
| GET | `/api/auth/me` | Bearer | Perfil da conta |

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/characters` | Lista personagens da conta |
| POST | `/api/characters` | Cria personagem |
| GET | `/api/characters/:id` | Detalhe |
| DELETE | `/api/characters/:id` | Soft-delete |
| PATCH | `/api/characters/:id/location` | Atualiza mapa/posição |
| PATCH | `/api/characters/:id/last-played` | Marca último acesso |

O frontend envia `Authorization: Bearer <token>` em rotas autenticadas (`apiFetch.ts`).

---

## Volume e paths mutáveis

| Path no volume | Conteúdo | Leitura em runtime |
|----------------|----------|-------------------|
| `/data/maps/` | Mapas JSON editados | Servidor + cliente (`/maps/` via dist ou volume) |
| `/data/tiles/maps/` | Sprites de terreno/itens | `/tiles/maps/...` |
| `/data/tiles/characters/` | Sprites de personagens | `/tiles/characters/...` |
| `/data/tiles/tile_properties.json` | Metadados de tiles | APIs + engine |
| `/data/tile_catalog.json` | Catálogo | `public/` fallback |
| `/data/auto_border_sets.json` | Conjuntos auto-borda | idem |
| `/data/creature_presets.json` | Presets NPC/monster | idem |
| `/data/outfit_presets.json` | Presets de outfit | idem |

**Baked no build (`dist/`):** HTML, JS, CSS, cópia inicial de `public/maps/` e catálogos. Edições vão para o volume quando `DATA_ROOT` está definido.

---

## WebSocket

### Same-origin

Em produção, se `VITE_GAME_SERVER_WS` estiver vazio, o cliente usa:

```
wss://<host-atual>
```

Mesmo domínio que HTTP — sem CORS extra.

### Limite de 15 minutos (Railway)

Conexões WebSocket são encerradas após **15 minutos** ([docs Railway](https://docs.railway.com/guides/sse-vs-websockets)). O cliente reconecta proativamente aos **13 min** com ticket renovado via `/api/ws-ticket`; falhas usam retry em 3s.

### Desenvolvimento local

```bash
# Dev (Vite :5173 + API/WS :8787)
npm run dev

# Só frontend (sem APIs)
npm run dev:web

# Produção local (exige DATABASE_URL + JWT_SECRET)
npm run build
npm run start
```

| Modo | Auth | APIs |
|------|------|------|
| `npm run dev` | Mock localStorage (padrão) | Proxy → Express (`server/`) |
| `npm run dev` + `VITE_USE_API_AUTH=true` | API JWT + DB | Proxy → Express |
| `npm run start` | API JWT + DB | Express direto |

Migrations manuais:

```bash
npm run db:migrate --prefix server
```

---

## Studio GM em produção

### APIs (`/api/*`)

18 endpoints em `server/src/routes/studio/` (única implementação; dev usa proxy Vite).

| Grupo | Rotas |
|-------|-------|
| Mapas | `list-maps`, `save-map`, `save-tile-catalog` |
| Sprites | `list-map-sprites`, `sprite-usage`, `save-map-sprite`, `save-map-sprites-batch`, `delete-map-sprite`, `list-tile-properties` |
| Auto-borda | `list-auto-border-sets`, `border-set-usage`, `delete-border-set`, `save-border-set` |
| Personagens (sprites) | `list-characters`, `save-character`, `delete-character` |
| Presets | `upsert-creature-preset`, `upsert-outfit-preset` |

### Guard GM

Todas as rotas Studio `/api/*` (exceto health e auth/characters) exigem:

- Header `Authorization: Bearer <jwt>`
- Conta com `can_access_studio = true` no PostgreSQL

Conta GM: registre `gm@gm.dev`. Em dev local: `STUDIO_MOCK_GM=true` bypassa o guard.

---

## Electron e Capacitor (clientes instalados)

### Electron (Windows)

```bash
npm run electron:dev    # Vite + API + janela Electron (localhost:5173)
npm run electron:build  # dist/ + NSIS installer
```

**Variáveis no build** (Railway Variables ou `.env` local antes de `npm run build`):

| Variável | Uso |
|----------|-----|
| `VITE_BUILD_VERSION` | Versão no join WS e painel F3 |
| `VITE_API_BASE_URL` | HTTP da API quando não há same-origin |
| `VITE_WS_BASE_URL` | WebSocket fixo (ex.: `wss://api.seujogo.com`) |
| `VITE_GAME_SERVER_WS` | Alternativa legada; preferir `VITE_WS_BASE_URL` em app instalado |

> Use **domínio próprio** antes de distribuir. URL gerada pelo Railway que muda quebra instaladores antigos.

### Capacitor (Android)

**Node ≥ 22** (Capacitor CLI 8). Ver [docs/mobile-android-test.md](./mobile-android-test.md).

```bash
npm run mobile:init          # uma vez — cap add android
npm run mobile:build         # vite build + cap sync (usa .env.production)
npm run mobile:open:android  # Android Studio
npm run mobile:run:android   # CLI direto no device/emulador
```

Variáveis obrigatórias no build: `VITE_API_BASE_URL`, `VITE_WS_BASE_URL` (ver `.env.production`).

CORS: o servidor aceita origens do WebView Capacitor (`https://localhost`, etc.) além de `CLIENT_ORIGIN`. Opcional: `CLIENT_EXTRA_ORIGINS` (vírgula) para domínios extras.

Requer `@capacitor/app` para lifecycle (`appStateChange` → resync ao voltar do background).

### Snapshots periódicos WS (servidor)

Opcional — complementa eventos imediatos; padrão 1 s:

```env
PLAYER_STATE_SNAPSHOT_INTERVAL_MS=1000
CREATURE_SNAPSHOT_INTERVAL_MS=1000
RESYNC_MIN_INTERVAL_MS=2000
```

Defina `0` para desligar snapshots de jogadores ou criaturas.

---

## Custos e backup

Railway cobra por CPU, RAM, egress, volume storage e PostgreSQL. Plano Hobby inclui crédito mensal.

**Backup manual (recomendado semanal com Studio ativo):**

```bash
# Volume (mapas/sprites):
tar -czf backup-data-$(date +%Y%m%d).tar.gz /data

# PostgreSQL:
pg_dump "$DATABASE_URL" > backup-db-$(date +%Y%m%d).sql
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| App não sobe | PORT errada | Railway injeta `PORT`; servidor usa `process.env.PORT` |
| 502 / connection refused | Bind em localhost | `HOST=0.0.0.0` |
| Auth 503 | Sem `DATABASE_URL` | Adicionar PostgreSQL + variável |
| Login falha | JWT/DB | Verificar `JWT_SECRET` e migrations no log de boot |
| Tiles 404 | Path errado | Verificar `/tiles/` no Express; volume com seeds |
| Save mapa falha | Sem volume | Adicionar volume `/data` + `DATA_ROOT=/data` |
| Studio 401/403 | Sem token GM | Login + conta com `can_access_studio` |
| WS não conecta | URL errada | Deixar `VITE_GAME_SERVER_WS` vazio no build |
| Mapas somem após deploy | Sem volume | Configurar `DATA_ROOT` |
| Personagens somem | Sem PostgreSQL | Verificar serviço Postgres e `DATABASE_URL` |

---

## Referências

- [README.md](../README.md) — comandos locais
- [server/README.md](../server/README.md) — servidor unificado
- [database/migrations/](../database/migrations/) — schema PostgreSQL
- [docs/instanced-maps-and-multiplayer.md](./instanced-maps-and-multiplayer.md) — protocolo WS
- [docs/multiplayer-remote-players.md](./multiplayer-remote-players.md) — jogadores remotos + roadmap de escala
