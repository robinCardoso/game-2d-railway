# Jornada do jogador — guia de implementação

Documento executável (seções 1–13). Plano mestre em `.cursor/plans/`.

## 1. Diagnóstico

| Antes | Agora |
|-------|--------|
| `index.html` = editor GM + jogo | `/` = landing, `/studio.html` = GM, `/play.html` = jogo |
| `roleSelector` no cliente | Papel GM via `can_access_studio` (PostgreSQL) ou `@gm.dev` (mock) |
| Personagem só localStorage | `characters` na API JWT ou mock localStorage |

## 2. Princípios

- Superfícies separadas (MPA Vite)
- Auth no servidor (API JWT ou mock)
- Personagem ≠ conta (até 4 chars)
- `/play` sem ferramentas de edição

## 3. Fluxo

```
/ → login → characters → [new] → play?characterId=
```

Wireframe roster:

```
+---------------------------+
|  Seus personagens         |
|  [Card A] [Card B] [ + ]  |
|  [Entrar] [Excluir] [Sair]|
+---------------------------+
```

## 4. Rotas

| Rota | Arquivo |
|------|---------|
| `/` | `index.html` |
| `/login.html` | `login.html` |
| `/register.html` | `register.html` |
| `/characters.html` | `characters.html` |
| `/characters-new.html` | `characters-new.html` |
| `/play.html` | `play.html` |
| `/studio.html` | `studio.html` |

## 5–6. Telas e dados

Ver `database/migrations/` e `src/shared/characterStore.ts` (API JWT ou mock em dev).

## 7. Segurança

- Personagens isolados por `account_id` no PostgreSQL (API autenticada)
- WS: `enterTicket` HMAC em `join` (`shared/enterTicket.ts`, `server/src/enterTicket.ts`)
- Studio guard em produção (`src/studio/bootstrap.ts`)

## 8. Design

`src/shared/shell.css` — auth e roster.

## 9. Fases e status

| Fase | Status |
|------|--------|
| A — MPA + shells | Implementado |
| B — Auth + personagens | Implementado (mock dev + API JWT/PostgreSQL em prod) |
| C — Polish | Parcial (termos/privacy placeholder) |
| D — WS ticket | Implementado |
| E–F — Hosting/analytics | Ver `docs/hosting.md`, `src/shared/analytics.ts` |

## 10. Pastas

```
src/landing/  src/auth/  src/characters/  src/game/  src/studio/  src/shared/
```

## 11. KPIs

Eventos em `src/shared/analytics.ts` — ativar com `VITE_ANALYTICS=true`.

## 12–13. PRs e hospedagem

Ordem: MPA → auth JWT → polish → WS ticket. Hospedagem: `docs/hosting.md`.

## Como testar (mock)

1. `npm run dev`
2. Abrir `/` → Criar conta (qualquer e-mail)
3. Criar personagem → Entrar no mundo
4. GM Studio: `/studio.html` (dev sem guard) ou login `gm@gm.dev`

## Como testar (API JWT + PostgreSQL)

1. PostgreSQL local ou Railway; copiar `.env.example` → `.env`
2. Definir `DATABASE_URL`, `JWT_SECRET`, `ENTER_TICKET_SECRET`
3. `npm run build && npm run start` — registrar conta em `/register.html`
4. GM: registrar `gm@gm.dev` para acesso ao Studio em produção
