Ponto de atenção ainda existente
Combate ainda é client-side

Isso não é erro neste momento, mas precisa ficar marcado.

Hoje o cliente ainda calcula:

ataque
dano
vida do monstro
morte
XP

Então para MVP funciona, mas para multiplayer real ainda pode dar inconsistência:

Player A mata o monstro na tela dele
Player B ainda pode ver o monstro vivo
XP é calculado localmente
loot futuro poderia ser explorado pelo cliente

Minha recomendação: não mexe nisso agora, mas marca como próxima grande fase.

A próxima evolução correta seria:

server-authoritative combat

Com:

servidor controla monstros
servidor calcula dano
servidor confirma morte
servidor concede XP
servidor calcula loot
cliente só envia intenção de ataque

Mas isso é uma fase grande. Agora você precisava primeiro fechar vocação runtime e XP persistente, e esse commit fez isso.

Pequena melhoria recomendada

Eu só deixaria mais claro no código que existem dois níveis de autoridade:

const SERVER_AUTHORITATIVE_POSITION = isServerWsTicketEnabled();
const SERVER_AUTHORITATIVE_COMBAT = false;

Hoje isso está implícito: posição não salva no frontend em produção, mas progresso salva. Funciona, mas no futuro você pode esquecer e achar que “WS ticket ativo” significa “tudo é servidor”. Separar essas flags evita confusão.

Minha conclusão

Esse commit está muito bom.

Você resolveu os 3 problemas principais do commit anterior:

1. vocações dinâmicas agora alimentam Play/Create/UI/Combat
2. vocations.json agora pode vir do backend/volume
3. XP/level agora persiste mesmo em produção Railway