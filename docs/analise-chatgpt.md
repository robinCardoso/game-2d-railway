Você realmente avançou bastante: o projeto agora já está com cara de Railway-first, sem depender do Supabase no fluxo principal.

O novo repositório tem:

frontend Vite MPA
backend Express
PostgreSQL Railway
auth JWT própria
WebSocket no mesmo servidor
ticket WS pelo backend
Studio APIs portadas para Express
Volume Railway planejado em /data
migrations próprias
sem @supabase/supabase-js

O README já descreve o servidor unificado com frontend, PostgreSQL, auth JWT, WebSocket e APIs do Studio, além das variáveis obrigatórias DATABASE_URL, JWT_SECRET, ENTER_TICKET_SECRET e DATA_ROOT=/data.

Veredito rápido
Área	Status
Estrutura Railway	Muito boa
Remoção do Supabase	Bem encaminhada
PostgreSQL próprio	Bom
Auth JWT	Funcional para MVP
WebSocket seguro	Bem melhor
Reconexão Railway 15 min	Implementada
Studio em produção	Muito avançado
Volume /data	Bem planejado
Pontos críticos restantes	Build/start, CORS PATCH, GM automático, duplicidade WS

Minha avaliação geral:

Você completou cerca de 80% a 85% da migração Railway.
Ainda não considero 100% pronto para produção, mas está muito perto de um MVP online testável.

O que ficou muito bom
1. Você manteve a estrutura atual, sem monorepo

Isso foi uma decisão boa. O projeto continua com:

src/
server/
shared/
database/migrations/
public/
tiles/

E isso reduz risco. O Railway não exige monorepo, então essa escolha foi correta.

2. Servidor unificado ficou certo

Agora o server/src/index.ts sobe:

Express
HTTP
WebSocket
migrations
MapCollisionStore
GameRoom
static dist

Ele usa env.port e env.host, e o env.ts já define HOST=0.0.0.0 em produção. Isso está alinhado com a exigência do Railway de escutar em 0.0.0.0:$PORT.

Esse ponto está correto.

3. MPA foi preservado corretamente

Você não caiu no erro do catch-all SPA.

O app.ts usa express.static(paths.distDir, { index: 'index.html' }), mas não força tudo para index.html. Isso preserva:

/login.html
/register.html
/characters.html
/play.html
/studio.html

E o vite.config.ts continua configurado com múltiplos inputs HTML.

Esse ponto ficou muito bom.

4. Banco PostgreSQL próprio ficou no caminho certo

Você criou:

database/migrations/001_init.sql
database/migrations/002_characters.sql

Com:

accounts
characters
schema_migrations

A tabela accounts substitui o auth.users do Supabase, e characters agora tem colunas reais para:

map_id
position_x
position_y
position_z
direction

Isso é bem melhor do que depender só de outfit_config JSONB.

Também gostei que você manteve outfit_config. Isso ajuda na transição.

5. Auth própria ficou funcional

Você criou rotas:

POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

O backend valida senha com bcrypt, gera JWT e retorna o perfil do usuário. O frontend usa game2d_auth_token no localStorage. Para MVP está aceitável.

Mais para frente, podemos melhorar para cookie httpOnly, mas não precisa travar agora.

6. API de personagens ficou bem estruturada

As rotas estão corretas:

GET    /api/characters
POST   /api/characters
GET    /api/characters/:id
DELETE /api/characters/:id
PATCH  /api/characters/:id/location
PATCH  /api/characters/:id/last-played

E o mais importante: o frontend não envia account_id; o backend pega pelo token. Isso está certo.

Também gostei que você manteve limite de 4 personagens por conta.

7. Ticket WebSocket melhorou muito

Antes o ticket era assinado no cliente. Agora você tem:

POST /api/ws-ticket

O backend busca o personagem da conta autenticada, cria o ticket e inclui:

characterId
accountId
name
mapId
tileX
tileY
z
direction

Isso ficou bem mais seguro.

E em produção o requireWsTicket fica ativo automaticamente quando existe DATABASE_URL.

8. Reconexão Railway foi implementada

Você colocou reconexão proativa aos 13 minutos no GameNetClient.

Isso é importante porque Railway informa limite de 15 minutos para WebSocket/SSE e recomenda lógica de reconexão no cliente.

Esse ponto está muito bom.

9. Studio foi muito além do esperado

Você portou as APIs do Studio para Express:

/api/save-map
/api/save-tile-catalog
/api/save-map-sprite
/api/save-map-sprites-batch
/api/save-border-set
/api/delete-border-set
/api/save-character
/api/delete-character
/api/list-maps
/api/list-characters
/api/list-map-sprites
/api/upsert-creature-preset
/api/upsert-outfit-preset

E protegeu com requireStudioGuard, validando token e can_access_studio.

Isso era uma das partes mais difíceis da migração. Você avançou muito aqui.

Pontos que eu corrigiria antes de produção
1. Problema crítico: tsx em produção

Hoje o server/package.json usa:

"start": "tsx src/index.ts"

E tsx está em devDependencies.

Isso pode quebrar no Railway se o deploy instalar dependências em modo produção e ignorar devDependencies.

Correção recomendada

Melhor opção: compilar o servidor para JS.

Alterar server/tsconfig.json para emitir arquivos:

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src", "../shared"]
}

Alterar server/package.json:

{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/index.js",
    "db:migrate": "tsx src/db/migrate.ts"
  }
}

E no root:

{
  "scripts": {
    "build": "tsc && vite build && npm run build --prefix server",
    "start": "npm run start --prefix server"
  }
}

Isso deixa produção mais segura.

Alternativa simples: mover tsx para dependencies, mas eu prefiro compilar.

2. CORS está faltando PATCH

No app.ts, você libera:

GET, POST, DELETE, OPTIONS

Mas suas APIs usam PATCH para:

/api/characters/:id/location
/api/characters/:id/last-played

Se tudo estiver same-origin, não quebra. Mas se você usar CLIENT_ORIGIN com frontend em outro domínio, o navegador pode bloquear PATCH no preflight.

Corrigir
res.setHeader(
  'Access-Control-Allow-Methods',
  'GET, POST, PATCH, DELETE, OPTIONS'
);
3. Documentação diz *@gm.dev, mas código só aceita gm@gm.dev

Na documentação você escreveu que conta GM pode ser *@gm.dev.

Mas no código o registro GM automático é apenas:

const isGmDev = normalized === 'gm@gm.dev';

Escolha uma regra

Se quiser qualquer e-mail @gm.dev:

const isGmDev = normalized.endsWith('@gm.dev');

Se quiser só gm@gm.dev, corrija a documentação.

Minha sugestão: não liberar qualquer @gm.dev em produção real. Para MVP tudo bem, mas depois crie um admin manual no banco.

4. WebSocket ainda permite duplicar o mesmo personagem

Hoje, se o mesmo personagem conectar em duas abas, o servidor pode manter dois jogadores com o mesmo characterId.

O GameRoom desconecta o mesmo socket antigo, mas não remove uma conexão anterior do mesmo characterId.

Corrigir

No handleJoin, depois de validar o ticket, antes de criar novo player:

for (const existing of this.players.values()) {
  if (existing.characterId === characterId && existing.socket !== socket) {
    existing.socket.close();
    this.handleDisconnect(existing.socket);
  }
}

Isso evita:

Robson aparece 2 vezes no mapa
posição salva conflitante
duas abas brigando pelo mesmo personagem
5. Servidor ainda confia no cliente para movimento dentro da conexão

O join agora é bem mais seguro. Porém depois do join, o cliente ainda envia:

mapId
tileX
tileY
z
direction

O servidor valida tile, walkable e passo adjacente, o que é bom. Mas ainda falta uma proteção importante: limite de velocidade por tempo.

Hoje o servidor valida “um tile adjacente por mensagem”, mas um cliente modificado poderia mandar muitas mensagens por segundo.

Próxima melhoria

Adicionar no ConnectedPlayer:

lastMoveAt: number;

E no movimento:

const now = Date.now();
if (now - player.lastMoveAt < 120) {
  reject;
}
player.lastMoveAt = now;

Depois você pode ajustar por speed do personagem/vocação.

6. Migrations rodam automaticamente no boot

Isso está prático para MVP:

await runMigrations();

Mas em produção real, uma migration com erro pode impedir o app de subir.

Para agora tudo bem. Depois, melhor separar:

npm run db:migrate --prefix server
npm run start --prefix server

No MVP, pode manter como está.

7. Volume /data ficou bem planejado, mas precisa backup obrigatório

Você fez certo ao usar DATA_ROOT=/data e copiar seeds iniciais para o volume. Railway Volumes são o recurso certo para persistir arquivos no serviço.

Mas agora o Studio salva coisa importante no volume:

maps
tiles
characters
presets
tile_catalog
auto_border_sets

Então backup não é opcional. Seu docs/hosting.md já recomenda backup de volume e PostgreSQL, o que está correto.

Eu criaria logo um checklist semanal:

backup PostgreSQL
backup /data
baixar backup local
testar restore em ambiente dev
Minha ordem de correção agora

Eu faria exatamente nesta ordem:

1. Corrigir start/build do servidor

Prioridade máxima.

não depender de tsx em produção
compilar server para dist
start com node
2. Corrigir CORS PATCH

Pequeno e rápido.

3. Corrigir regra GM

Decidir:

só gm@gm.dev
ou qualquer @gm.dev

E deixar código + docs iguais.

4. Impedir login duplicado do mesmo personagem no WS

Muito importante para evitar bug estranho.

5. Adicionar rate limit de movimento

Evita speed hack simples.

6. Testar no Railway com checklist real

Testar:

register
login
create character
enter play
2 abas multiplayer
andar e salvar posição
fechar e abrir de novo
studio listar mapas
studio salvar mapa
redeploy
ver se mapa persiste
Minha conclusão

Você fez uma migração muito boa.

O sistema agora está muito mais coerente do que antes:

Supabase saiu do centro
Railway virou plataforma principal
PostgreSQL virou banco oficial
backend virou autoridade
WebSocket ficou mais seguro
Studio saiu do Vite dev e foi para Express
Volume foi planejado corretamente

Eu ainda não diria “está 100% produção”, mas diria:

Está pronto para começar teste online controlado no Railway, depois de corrigir build/start e CORS.

O principal agora não é criar features novas. É estabilizar este ciclo:

deploy Railway
login
criação de personagem
play online
posição salva no PostgreSQL
Studio salva no volume
redeploy sem perder dados