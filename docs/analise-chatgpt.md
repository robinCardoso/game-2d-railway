progress_sync: melhorou, mas eu ainda faria uma trava mais dura

Você adicionou ALLOW_CLIENT_PROGRESS_SYNC, com default false, e no GameRoom.handleProgressSync colocou:

if (env.isProduction && !env.allowClientProgressSync) return;
if (this.requireWsTicket) return;

Isso já melhora bastante o cenário anterior. O commit também adicionou aviso de boot se produção estiver sem REQUIRE_WS_TICKET, e aviso se JWT_SECRET padrão de dev estiver em produção.

Mas eu ainda acho que esse trecho deveria ser mais rígido.

Hoje, se alguém configurar por engano:

NODE_ENV=production
ALLOW_CLIENT_PROGRESS_SYNC=true
REQUIRE_WS_TICKET=false

o servidor pode aceitar progress_sync em produção.

Eu deixaria assim:

if (env.isProduction) return;
if (!env.allowClientProgressSync) return;
if (this.requireWsTicket) return;

Ou seja: produção nunca aceita XP do cliente, mesmo que uma env seja ligada sem querer.

Minha recomendação:

private handleProgressSync(
  socket: WebSocket,
  msg: Extract<ClientMessage, { type: 'progress_sync' }>
): void {
  // Segurança: XP em produção só pode vir do servidor.
  if (env.isProduction) return;

  // Dev/offline precisa liberar explicitamente.
  if (!env.allowClientProgressSync) return;

  if (this.requireWsTicket) return;

  // resto da lógica...
}

Essa seria minha única correção de segurança neste commit.

4. Registry dinâmico de mapas: muito boa evolução

Você trocou o carregamento fixo de mapas no MapCollisionStore:

mainland
rookgaard
orc_cave

por:

for (const entry of getServerMapRegistry())

E criou initServerMapRegistry() no boot do servidor.

Isso é muito importante para o Studio, porque antes todo mapa novo dependia de edição manual em código. Agora o servidor consegue escanear maps/*.json e registrar mapas novos automaticamente. O log também mostra os mapas registrados no boot.

O único ponto de atenção: mapas descobertos dinamicamente entram com:

instanced: false

Isso é aceitável agora. Mas futuramente, se você criar mapa pelo Studio que seja dungeon/instância, vai precisar ler isso de algum metadata do próprio JSON ou de um manifest.

Exemplo futuro:

{
  "id": "goblin_cave",
  "name": "Goblin Cave",
  "instanced": true
}