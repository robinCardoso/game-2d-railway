# 2D World

MMORPG 2D no browser com editor estilo Tibia, multi-mapas, dungeons instanciadas e multiplayer via WebSocket.

---

## Início rápido

```bash
npm install
npm run dev
```

Abra **http://localhost:5173/** — landing, login, criação de personagem e jogo.

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Vite `:5173` + API/WS `:8787` (recomendado) |
| `npm run dev:web` | Só frontend (sem APIs) |
| `npm run build` | Compila `dist/` |
| `npm run start` | Produção local (`:8787`) |

---

## Rotas

| URL | Descrição |
|-----|-----------|
| `/` | Landing |
| `/login.html` | Login / registro |
| `/characters.html` | Seleção de personagem |
| `/play.html` | Jogo |
| `/studio.html` | Editor GM (mapas e sprites) |

**Dev sem PostgreSQL:** use qualquer e-mail/senha no mock. Para GM no Studio: `gm@gm.dev`.

---

## Desenvolvimento

### Jogador

1. `npm run dev`
2. Criar conta → personagem → **Entrar no mundo**

Guia: [docs/player-journey.md](docs/player-journey.md)

### GM (mapas e sprites)

1. `npm run dev`
2. Abrir **http://localhost:5173/studio.html**

Em produção exige conta com `can_access_studio` no PostgreSQL.

### Multiplayer local

O `npm run dev` já sobe o WebSocket em `:8787`. Abra duas abas em `/play.html` para testar sync.

---

## Deploy (Railway)

Servidor unificado: frontend + PostgreSQL + auth JWT + WebSocket + APIs do Studio.

```bash
npm run build
npm run start
```

Variáveis obrigatórias: `DATABASE_URL`, `JWT_SECRET`, `ENTER_TICKET_SECRET`, `DATA_ROOT=/data` (volume).

Guia completo: **[docs/hosting.md](docs/hosting.md)**

---

## Configuração

```bash
cp .env.example .env   # ou copie manualmente no Windows
```

| Ambiente | Auth |
|----------|------|
| Dev (`npm run dev`) | Mock localStorage (padrão) |
| Produção | API JWT + PostgreSQL |

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/hosting.md](docs/hosting.md) | Deploy Railway, volume, WS, checklist |
| [docs/map-format.md](docs/map-format.md) | Formato `MapDocument`, `ref`, camadas |
| [docs/sprite-exporter-walkthrough.md](docs/sprite-exporter-walkthrough.md) | Calibrador e APIs de sprites |
| [docs/instanced-maps-and-multiplayer.md](docs/instanced-maps-and-multiplayer.md) | Protocolo WebSocket |
| [docs/studio-improvements-log.md](docs/studio-improvements-log.md) | Log de melhorias do Studio |
| [docs/playstore-steam-roadmap.md](docs/playstore-steam-roadmap.md) | Planejamento para Steam e Google Play Store |
| [server/README.md](server/README.md) | Servidor Node unificado |

| [AGENTS.md](AGENTS.md) | Guia para agentes IA |

---

## Stack

- **Frontend:** Vite, TypeScript, Canvas 2D
- **Backend:** Express, WebSocket (`ws`), PostgreSQL
- **Deploy:** [Railway](https://railway.app) (`railway.json`)
