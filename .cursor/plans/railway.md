> **Documento oficial de deploy:** [docs/hosting.md](../../docs/hosting.md)  
> Este arquivo é rascunho/histórico da conversa com ChatGPT.

## Status das fases

| Fase | Status | Escopo |
|------|--------|--------|
| **A** | Concluída | Servidor unificado Railway: static MPA + WS + APIs Studio + volume |
| **B** | Concluída | PostgreSQL + auth JWT + API personagens (sem Supabase no frontend) |
| **C** | Concluída | POST /api/ws-ticket, join obrigatório, posição autoritativa, reconexão proativa |
| **D** | Concluída | APIs unificadas (proxy dev → Express), supabase/ removido |

### Correções à análise original

- **Sem catch-all SPA** — o projeto é MPA (`play.html`, `studio.html`, etc.); servir `dist/` com `express.static`, não `index.html` para todas as rotas.
- **Volume obrigatório** — saves do Studio gravam em filesystem; Railway exige volume em `/data` + `DATA_ROOT`.
- **18 APIs Studio** — escopo maior que o plano original sugeria; portadas de `vite.config.ts` para Express na Fase A.
- **Monorepo `apps/`** — adiado; estrutura atual mantida na Fase A.

---

Migrar depois pode virar uma dor grande, principalmente porque seu jogo já tem:

login
personagens
Supabase Auth
Supabase tables
mock/localStorage
WebSocket separado
Studio GM
mapas
posição salva

Então sua ideia faz sentido: decidir agora a arquitetura final e já construir tudo pensando no Railway.

Eu analisei seu repositório com esse foco. Hoje ele tem:

/
├─ src/                 frontend/jogo/studio/personagens
├─ server/              WebSocket server separado
├─ shared/              protocolo compartilhado
├─ supabase/schema.sql  schema atual do Supabase
├─ public/
├─ docs/
├─ package.json
└─ vite.config.ts

O README confirma que hoje o jogo roda como Vite no frontend, tem rotas login.html, characters.html, play.html, studio.html, e o multiplayer local roda com npm run dev:server na porta 8787.

A hospedagem documentada no próprio projeto ainda está pensada como Vercel/Cloudflare para frontend + Supabase para Auth/Postgres + servidor WebSocket separado.

Para migrar completamente para Railway, eu mudaria essa visão.

O que precisa ser analisado antes da migração

Você perguntou “o que precisa analisar?”. Para essa migração completa, eu analisaria estes blocos:

1. Arquitetura atual
2. Banco de dados atual
3. Auth atual
4. WebSocket atual
5. Frontend atual
6. Variáveis de ambiente
7. Estrutura de deploy
8. Segurança
9. Migração de dados
10. Custo e escala

No seu caso, o ponto mais importante é este:

Hoje seu frontend fala direto com o Supabase.
No Railway, o ideal é o frontend falar com seu próprio backend.

Porque se você quer sair do Supabase completamente, você precisa substituir:

Supabase Auth
Supabase Client no frontend
RLS
schema Supabase

por:

Backend Node.js
PostgreSQL Railway
JWT/session própria
rotas HTTP próprias
permissão validada no backend
Decisão de arquitetura que eu recomendo

Para seu jogo, eu recomendo um único projeto Railway, com 2 serviços no começo:

Railway Project: game-2d

Service 1: app
  - frontend compilado
  - API HTTP
  - WebSocket
  - lógica do jogo

Service 2: postgres
  - banco PostgreSQL

Eu não criaria Redis agora.

Railway suporta monorepo e permite definir comandos diferentes por serviço; a documentação diz que, em monorepos compartilhados, você pode configurar start commands separados para cada projeto.

Railway também tem PostgreSQL pronto e fornece variáveis como PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE e DATABASE_URL para conectar sua aplicação ao banco.

Ponto crítico sobre WebSocket no Railway

Aqui tem uma coisa importante: a documentação atual do Railway diz que conexões WebSocket abertas por mais de 15 minutos podem ser encerradas por limite de duração da requisição. Ela recomenda tratar reconexão e preservar estado ao reconectar.

Então, para seu jogo, você precisa programar pensando nisso:

1. jogador conecta
2. servidor valida token
3. jogador entra na sala
4. se cair depois de 15 minutos, cliente reconecta
5. cliente reenvia token + characterId
6. servidor recoloca o jogador no mapa
7. jogo continua

Isso não impede usar Railway, mas precisa estar no plano desde agora.

Minha arquitetura final recomendada

Eu faria assim:

game-2d/
├─ apps/
│  └─ web/
│     ├─ index.html
│     ├─ login.html
│     ├─ register.html
│     ├─ characters.html
│     ├─ play.html
│     ├─ studio.html
│     ├─ src/
│     └─ vite.config.ts
│
├─ apps/
│  └─ server/
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ http/
│     │  │  ├─ auth.routes.ts
│     │  │  ├─ character.routes.ts
│     │  │  ├─ studio.routes.ts
│     │  │  └─ health.routes.ts
│     │  ├─ ws/
│     │  │  ├─ GameRoom.ts
│     │  │  ├─ wsServer.ts
│     │  │  └─ enterTicket.ts
│     │  ├─ db/
│     │  │  ├─ pool.ts
│     │  │  ├─ migrations.ts
│     │  │  └─ repositories/
│     │  │     ├─ users.repo.ts
│     │  │     ├─ characters.repo.ts
│     │  │     └─ maps.repo.ts
│     │  ├─ auth/
│     │  │  ├─ password.ts
│     │  │  ├─ jwt.ts
│     │  │  └─ requireAuth.ts
│     │  └─ config/
│     │     └─ env.ts
│     └─ package.json
│
├─ packages/
│  └─ shared/
│     ├─ protocol.ts
│     ├─ types/
│     │  ├─ character.ts
│     │  ├─ account.ts
│     │  └─ map.ts
│     └─ game-data/
│        ├─ vocations.ts
│        ├─ outfits.ts
│        └─ game.config.ts
│
├─ database/
│  ├─ migrations/
│  │  ├─ 001_init.sql
│  │  ├─ 002_characters.sql
│  │  ├─ 003_maps.sql
│  │  └─ 004_sessions.sql
│  └─ seeds/
│     └─ dev.sql
│
├─ package.json
├─ railway.json
└─ .env.example

Mas eu não faria essa mudança inteira em um commit só. Eu faria por fases.

Plano detalhado para migrar completamente para Railway
Fase 0 — congelar a regra do projeto

Antes de mexer, defina esta decisão:

Supabase será removido.
Railway será o ambiente principal.
PostgreSQL Railway será o banco.
Backend Node será dono da autenticação, API e WebSocket.
Frontend não acessará banco diretamente.

Isso muda a filosofia do sistema.

Hoje seu projeto usa @supabase/supabase-js no frontend. O package.json raiz mostra essa dependência.

No novo modelo, isso sai do frontend.

Fase 1 — reorganizar sem mudar funcionamento

Objetivo: mexer nas pastas sem ainda quebrar o jogo.

Hoje você tem:

src/
server/
shared/
supabase/

Eu mudaria para:

apps/web/src
apps/server/src
packages/shared
database/migrations
Passos
Criar pasta:
apps/
packages/
database/
Mover:
src/        → apps/web/src/
public/     → apps/web/public/
*.html      → apps/web/
vite.config.ts → apps/web/vite.config.ts
server/     → apps/server/
shared/     → packages/shared/
supabase/schema.sql → database/migrations/001_legacy_supabase.sql
Ajustar imports.

Hoje o servidor importa o protocolo de:

../../shared/protocol.js

Você vai mudar para algo como:

@game/shared/protocol
Criar workspaces no package.json raiz:
{
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/web",
    "apps/server",
    "packages/shared"
  ],
  "scripts": {
    "dev:web": "npm run dev -w apps/web",
    "dev:server": "npm run dev -w apps/server",
    "build:web": "npm run build -w apps/web",
    "start:server": "npm run start -w apps/server",
    "build": "npm run build:web && npm run build -w apps/server"
  }
}

Essa fase é só estrutura. Ainda pode usar Supabase.

Fase 2 — criar backend HTTP no servidor atual

Hoje seu servidor server/src/index.ts é basicamente HTTP health + WebSocket. Ele cria um httpServer, responde JSON e sobe o WebSocketServer.

Eu manteria essa ideia, mas transformaria em backend real.

Instalar no server
npm install express cors helmet cookie-parser jsonwebtoken bcrypt pg zod
npm install -D @types/express @types/cors @types/cookie-parser @types/jsonwebtoken @types/bcrypt
Criar rotas
apps/server/src/http/auth.routes.ts
apps/server/src/http/character.routes.ts
apps/server/src/http/studio.routes.ts
apps/server/src/http/health.routes.ts
Rotas mínimas
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET  /api/characters
POST /api/characters
GET  /api/characters/:id
PATCH /api/characters/:id/location
DELETE /api/characters/:id

POST /api/ws-ticket
GET  /health

O /api/ws-ticket é muito importante. Hoje você tem ticket HMAC, mas no frontend aparece VITE_ENTER_TICKET_SECRET no .env.example.

Em produção isso não é ideal, porque segredo VITE_ vai para o navegador. No modelo novo, somente o backend assina ticket.

Fase 3 — criar schema PostgreSQL próprio para Railway

Hoje seu schema depende do Supabase Auth:

profiles.id references auth.users(id)

Isso não existe no PostgreSQL puro do Railway. O schema atual cria profiles com referência a auth.users, cria characters e usa RLS com auth.uid().

No Railway, você precisa de schema próprio.

Novo schema inicial
create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  role text not null default 'player'
    check (role in ('player', 'gm', 'admin')),
  can_access_studio boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  vocation_id text not null,
  gender text not null check (gender in ('male', 'female')),
  outfit_id text not null,
  sprite_sheet_url text not null,

  level integer not null default 1,
  experience bigint not null default 0,

  map_id text not null default 'rookgaard',
  position_x integer not null default 0,
  position_y integer not null default 0,
  position_z integer not null default 0,
  direction text not null default 'south'
    check (direction in ('north', 'south', 'east', 'west')),

  outfit_config jsonb not null default '{}'::jsonb,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_played_at timestamptz
);

create unique index if not exists characters_name_unique
on characters (lower(name))
where deleted_at is null;

create index if not exists characters_account_id_idx
on characters(account_id)
where deleted_at is null;
Por que esse schema é melhor?

Hoje você salva muita coisa dentro de outfit_config. No characterStore, o update de posição busca outfit_config, altera mapId, position, direction dentro do JSON e atualiza o JSON inteiro.

Funciona, mas para produção eu prefiro:

map_id
position_x
position_y
position_z
direction

como colunas reais.

outfit_config pode continuar existindo, mas como apoio visual, não como fonte principal da posição.

Fase 4 — substituir Supabase Auth por auth própria
Criar tabela accounts

Ela substitui:

auth.users
profiles
Fluxo novo
register.html
  → POST /api/auth/register
  → backend cria account
  → backend gera JWT
  → frontend salva sessão

login.html
  → POST /api/auth/login
  → backend valida senha
  → backend gera JWT
Onde salvar o token?

Para começar simples:

localStorage: game2d_auth_token

Mais seguro depois:

cookie httpOnly

Para MVP, token no localStorage é aceitável, mas com cuidado.

Criar arquivos
apps/server/src/auth/password.ts
apps/server/src/auth/jwt.ts
apps/server/src/auth/requireAuth.ts
apps/server/src/http/auth.routes.ts
Variáveis
JWT_SECRET=uma-chave-grande
BCRYPT_ROUNDS=10
Fase 5 — substituir supabaseClient.ts

Hoje src/shared/supabaseClient.ts cria createClient com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.

No novo modelo, crie:

apps/web/src/shared/apiClient.ts

Exemplo conceitual:

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('game2d_auth_token');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Erro na API');
  }

  return res.json();
}

Depois você substitui:

getSupabase().from('characters')...

por:

apiFetch('/api/characters')
apiFetch('/api/characters/:id')
apiFetch('/api/characters/:id/location')
Fase 6 — migrar characterStore.ts

Hoje characterStore.ts tem dois mundos:

mockAuth/localStorage
Supabase

Ele lista, cria, deleta e atualiza personagens direto pelo Supabase.

No Railway, ele deve virar apenas cliente de API:

apps/web/src/shared/characterStore.ts
Antes
getSupabase()
  .from('characters')
  .select('*')
Depois
apiFetch('/api/characters')
Funções finais
listCharacters()
getCharacter(id)
createCharacter(payload)
softDeleteCharacter(id)
markCharacterPlayed(id)
updateCharacterLocation(id, location)

Repare que o frontend não deve mandar accountId. O backend descobre pelo token.

Fase 7 — mudar WebSocket para validar pelo backend

Hoje o protocolo JoinMessage aceita name, playerId, mapId, enterTicket, tileX, tileY, z.

Hoje o GameRoom valida o ticket se ele vier, mas se não vier, ainda aceita nome do cliente.

Em produção, eu mudaria para:

join sempre exige enterTicket
sem ticket = erro
ticket contém:
  accountId
  characterId
  characterName
  mapId
  position
  expiração
Novo fluxo
play.html abre
  → GET /api/characters/:id
  → POST /api/ws-ticket { characterId }
  → conecta wss://app.up.railway.app
  → envia join com enterTicket
  → servidor valida ticket
  → servidor ignora nome enviado pelo cliente

Isso fecha uma brecha importante.

Fase 8 — salvar posição pelo servidor, não pelo frontend

Hoje o frontend salva posição no Supabase por updateCharacterLocation.

No modelo melhor, o servidor WebSocket já sabe onde o jogador está. Então o próprio servidor pode salvar:

ao desconectar
a cada 15–30 segundos
ao trocar mapa
Criar no server:
apps/server/src/db/repositories/characters.repo.ts

Funções:

updateCharacterLocation(characterId, accountId, location)
getCharacterForAccount(characterId, accountId)
Regra
frontend não salva posição diretamente durante o jogo
frontend só recebe correções do servidor
servidor é autoridade

Isso é muito importante para evitar trapaça.

Fase 9 — servir frontend e backend juntos

Para economizar no Railway, eu faria um único serviço Node.

O Vite gera:

apps/web/dist/

O server serve essa pasta:

app.use(express.static(path.resolve('../web/dist')));

E para as páginas:

app.get('*', (_, res) => {
  res.sendFile(path.resolve('../web/dist/index.html'));
});

Como você tem MPA com vários HTMLs (login.html, characters.html, play.html), precisa garantir que o build preserve esses arquivos.

Resultado
https://seu-game.up.railway.app/
https://seu-game.up.railway.app/login.html
https://seu-game.up.railway.app/characters.html
https://seu-game.up.railway.app/play.html
https://seu-game.up.railway.app/studio.html
wss://seu-game.up.railway.app
/api/...

Tudo no mesmo domínio.

Isso ajuda muito com CORS e custo.

Fase 10 — configurar Railway

No Railway:

Project: game-2d
Service: app
Service: postgres
App service

Configurar:

Build Command:
npm install && npm run build

Start Command:
npm run start

Mas para isso o package.json raiz precisa ter:

{
  "scripts": {
    "build": "npm run build -w apps/web && npm run build -w apps/server",
    "start": "npm run start -w apps/server"
  }
}
Variáveis do app
NODE_ENV=production
PORT=${{RAILWAY_PORT}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=...
ENTER_TICKET_SECRET=...
CLIENT_ORIGIN=https://seu-game.up.railway.app
VITE_API_BASE_URL=
VITE_GAME_SERVER_WS=wss://seu-game.up.railway.app

Railway recomenda que o servidor leia a porta pela variável PORT e faça bind em 0.0.0.0.

Hoje seu servidor usa:

process.env.GAME_SERVER_PORT ?? DEFAULT_WS_PORT

Eu mudaria para:

const PORT = Number(process.env.PORT || process.env.GAME_SERVER_PORT || 8787);
Fase 11 — migrations no Railway

Você precisa parar de usar supabase/schema.sql e criar migrations próprias:

database/migrations/001_init.sql
database/migrations/002_indexes.sql
database/migrations/003_maps.sql
Opção simples

Criar script:

apps/server/src/db/migrate.ts

Ele:

1. conecta no DATABASE_URL
2. cria tabela schema_migrations
3. lê arquivos database/migrations
4. executa os que ainda não rodaram
Script
{
  "scripts": {
    "db:migrate": "tsx src/db/migrate.ts"
  }
}
Railway

No start do servidor, você pode:

npm run db:migrate -w apps/server && npm run start -w apps/server

Mas eu prefiro separar:

Migrations rodam manualmente antes do deploy
Servidor só inicia

Para não correr risco de migration quebrar produção automaticamente.

Fase 12 — backup

Railway não elimina sua responsabilidade com backup.

Para começo, faça backup manual semanal:

pg_dump "$DATABASE_URL" > backup_2026_06_05.sql

Depois automatiza.

No Railway, você paga por recursos consumidos; CPU, RAM, egress e volume storage entram na conta, e o plano Pro cobre os primeiros US$ 20 de uso.

Então backup e storage também precisam entrar no controle de custo.

Arquivos que eu criaria
Backend
apps/server/src/index.ts
apps/server/src/app.ts

apps/server/src/config/env.ts

apps/server/src/db/pool.ts
apps/server/src/db/migrate.ts
apps/server/src/db/repositories/accounts.repo.ts
apps/server/src/db/repositories/characters.repo.ts

apps/server/src/auth/password.ts
apps/server/src/auth/jwt.ts
apps/server/src/auth/requireAuth.ts

apps/server/src/http/auth.routes.ts
apps/server/src/http/character.routes.ts
apps/server/src/http/studio.routes.ts
apps/server/src/http/ws-ticket.routes.ts
apps/server/src/http/health.routes.ts

apps/server/src/ws/wsServer.ts
apps/server/src/ws/GameRoom.ts
apps/server/src/ws/enterTicket.ts
Frontend
apps/web/src/shared/apiClient.ts
apps/web/src/shared/authClient.ts
apps/web/src/shared/characterStore.ts
apps/web/src/shared/sessionStore.ts
Shared
packages/shared/protocol.ts
packages/shared/types/character.ts
packages/shared/types/account.ts
packages/shared/game-data/vocations.ts
packages/shared/game-data/outfits.ts
packages/shared/game-data/game.config.ts
Database
database/migrations/001_init.sql
database/migrations/002_characters.sql
database/migrations/003_maps.sql
database/migrations/004_indexes.sql
database/seeds/dev.sql
Railway
railway.json
.env.example
Arquivos que seriam removidos ou aposentados

Depois da migração completa:

supabase/schema.sql
src/shared/supabaseClient.ts
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ENTER_TICKET_SECRET

E futuramente:

mockAuth.ts

Mas eu não removeria mockAuth no primeiro momento. Eu deixaria como modo dev até o backend estar pronto.

Ordem exata que eu faria
Etapa 1 — preparar estrutura
1. Criar branch: railway-migration
2. Criar apps/web, apps/server, packages/shared, database/migrations
3. Mover arquivos sem alterar regra de negócio
4. Ajustar imports
5. Garantir npm run dev:web e npm run dev:server
Etapa 2 — backend HTTP
6. Instalar Express/pg/bcrypt/jwt/zod
7. Criar /health
8. Criar conexão com DATABASE_URL
9. Criar migration 001_init.sql
10. Rodar migration local
Etapa 3 — auth
11. Criar POST /api/auth/register
12. Criar POST /api/auth/login
13. Criar GET /api/auth/me
14. Criar authClient.ts no frontend
15. Trocar login/register para usar API nova
Etapa 4 — personagens
16. Criar GET /api/characters
17. Criar POST /api/characters
18. Criar GET /api/characters/:id
19. Criar DELETE /api/characters/:id
20. Criar PATCH /api/characters/:id/location
21. Trocar characterStore.ts para usar API
Etapa 5 — WebSocket seguro
22. Criar POST /api/ws-ticket
23. Ticket assinado só no backend
24. Alterar GameRoom para exigir ticket
25. Join passa a usar characterId real
26. Servidor carrega personagem do banco
27. Servidor ignora nome/posição enviados pelo cliente quando necessário
Etapa 6 — posição autoritativa
28. Servidor mantém posição em memória
29. Servidor salva posição ao desconectar
30. Servidor salva posição a cada 15–30s
31. Frontend para de salvar posição diretamente durante jogo
Etapa 7 — deploy Railway
32. Criar projeto no Railway
33. Criar PostgreSQL
34. Criar app service pelo GitHub
35. Configurar DATABASE_URL
36. Configurar JWT_SECRET
37. Configurar ENTER_TICKET_SECRET
38. Configurar PORT
39. Rodar migrations
40. Deploy
41. Testar register/login/character/play/studio
Etapa 8 — limpar Supabase
42. Remover @supabase/supabase-js
43. Remover supabaseClient.ts
44. Remover variáveis Supabase
45. Atualizar docs/hosting.md
46. Atualizar README
Minha recomendação prática

Eu não faria “Railway + Supabase” se sua intenção é evitar migração depois.

Eu faria direto:

Railway PostgreSQL
Railway Node backend
Railway WebSocket
Railway frontend servido pelo backend

E deixaria tudo em um serviço app + um serviço postgres.

Isso é o mais barato e mais simples para seu momento.

Atenção: o maior risco

O maior risco não é Railway.

O maior risco é tentar migrar tudo de uma vez e quebrar:

login
personagens
play
studio
websocket
posição salva

Então o plano certo é:

primeiro duplicar a estrutura
depois criar backend
depois trocar auth
depois trocar personagens
depois trocar websocket
só no final remover Supabase
Minha conclusão

Sim, eu recomendo você migrar agora, antes de crescer.

O seu projeto ainda está no momento certo para isso. O schema ainda é pequeno, o Auth ainda não tem muitos usuários reais, e o WebSocket ainda está simples. Se esperar criar inventário, lojas, quests, monstros, magias e pagamentos, a migração fica muito mais difícil.

A decisão final que eu tomaria:

Railway como plataforma única.
PostgreSQL Railway como banco.
Node.js como backend/API/WebSocket.
Frontend servido pelo mesmo backend.
Supabase removido.
Redis só no futuro.