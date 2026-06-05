# Game server — unificado (Fase D Railway)

Servidor Node.js que expõe:

- **HTTP** — frontend MPA (`dist/`), `/tiles/`, `/health`
- **Auth** — `/api/auth/*` (JWT + PostgreSQL)
- **Personagens** — `/api/characters/*`
- **WS ticket** — `POST /api/ws-ticket` (ticket HMAC, posição do DB)
- **WebSocket** — multiplayer (join, move, salas `mapId@instanceId`)
- **APIs Studio** — `/api/*` (mapas, sprites, auto-borda, sprites de personagem, presets)

## Estrutura

```
server/
  package.json
  src/
    index.ts              # HTTP + WebSocket + migrations no boot
    app.ts                # Express (rotas + static)
    config/
      env.ts              # PORT, HOST, DATA_ROOT, DATABASE_URL, JWT
      paths.ts            # dist, tiles, maps, volume
    db/
      pool.ts             # PostgreSQL
      migrate.ts          # database/migrations/*.sql
      repositories/       # accounts, characters
    auth/
      password.ts, jwt.ts, requireAuth.ts
    middleware/
      studioGuard.ts      # JWT + can_access_studio
    routes/
      auth.ts, characters.ts, health.ts
      studio/             # APIs GM (única implementação dev + prod)
    studio/
      studioService.ts
    GameRoom.ts
    MapCollisionStore.ts
database/
  migrations/             # 001_init.sql, 002_characters.sql
shared/
  protocol.ts             # tipos WS (cliente + servidor)
```

## Como rodar

### Desenvolvimento (Vite + proxy)

```bash
npm run dev               # Vite :5173 + Express :8787 (proxy /api, mock auth)
npm run dev:web           # só Vite (sem APIs)
```

Para testar auth API no dev, rode o servidor em paralelo com `DATABASE_URL` e use `VITE_USE_API_AUTH=true`.

### Produção local (servidor unificado)

```bash
npm run build             # raiz: compila frontend + server/dist/
# .env: DATABASE_URL, JWT_SECRET, ENTER_TICKET_SECRET
npm run start             # node dist/server/src/index.js — :8787
```

Saída esperada:

```
[migrate] Aplicada: 001_init.sql
[migrate] Aplicada: 002_characters.sql
[game-2d-server] HTTP  http://0.0.0.0:8787
[game-2d-server] WS    ws://0.0.0.0:8787
```

Abra **http://localhost:8787/** — registre conta, crie personagem, **play.html** ou **studio.html** (`gm@gm.dev`).

### Migrations manuais

```bash
npm run db:migrate        # dentro de server/
```

## Variáveis

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `8787` | Railway injeta automaticamente |
| `HOST` | `localhost` / `0.0.0.0` | Bind address |
| `DATABASE_URL` | — | PostgreSQL (obrigatório em prod) |
| `DATABASE_SSL` | — | `true` para Railway Postgres |
| `JWT_SECRET` | dev secret | Assinatura dos tokens de sessão |
| `BCRYPT_ROUNDS` | `10` | Custo do hash de senha |
| `DATA_ROOT` | — | Volume Railway (`/data`); dados mutáveis |
| `ENTER_TICKET_SECRET` | dev secret | HMAC ticket WS (somente servidor) |
| `WS_TICKET_TTL_MS` | `300000` | Validade do ticket |
| `WS_POSITION_SAVE_INTERVAL_MS` | `20000` | Debounce persistência de posição |
| `REQUIRE_WS_TICKET` | auto em prod | Join WS exige ticket |
| `STUDIO_MOCK_GM` | — | `true` = APIs Studio sem JWT (dev only) |
| `NODE_ENV` | — | `production` → HOST `0.0.0.0` |

Cliente (build Vite):

| Variável | Descrição |
|----------|-----------|
| `VITE_GAME_SERVER_WS` | Vazio em prod = same-origin `wss://` |
| `VITE_USE_SERVER_WS_TICKET` | Dev: força ticket via API |
| `VITE_USE_API_AUTH` | Dev: força API JWT em vez de mock |
| `VITE_AUTH_MOCK` | Override explícito do modo mock |

## Deploy Railway

Ver **[docs/hosting.md](../docs/hosting.md)** — PostgreSQL, volume `/data`, build/start, checklist.

## Protocolo WebSocket (v1)

Detalhes: [`shared/protocol.ts`](../shared/protocol.ts) e [`docs/instanced-maps-and-multiplayer.md`](../docs/instanced-maps-and-multiplayer.md).

### Cliente → servidor

| `type` | Campos principais |
|--------|-------------------|
| `join` | `name`, `mapId`, `enterTicket`, `tileX`, `tileY`, `z` |
| `move` | `mapId`, `tileX`, `tileY`, `z` |
| `map_change` | igual ao `move` (troca de mapa) |
| `ping` | `t` |
| `leave` | — |

### Servidor → cliente

| `type` | Descrição |
|--------|-----------|
| `welcome` | `playerId` + lista `players` |
| `player_joined` / `player_left` / `player_moved` | sync |
| `position_correction` | tile autoritativo |
| `error` | `code`, `message` |

## Limitações

- Colisão WS usa template JSON em disco, não tiles editados em instância local
- Mapas instanciados não persistem posição no PostgreSQL (overworld only)
