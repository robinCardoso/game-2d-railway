O WebSocket está sincronizando posição e nome, mas ainda não está sincronizando a aparência/sprite/outfit do outro jogador.

Hoje o PlayerSnapshot do protocolo tem basicamente:

playerId
name
mapId
instanceId
tileX
tileY
z

Ele não carrega outfitId, spriteSheetUrl, gender, vocationId nem direction. Então o cliente que vê o outro player sabe onde ele está e qual é o nome dele, mas não sabe qual sprite deve desenhar. Isso aparece no protocolo atual compartilhado entre servidor e cliente.

No servidor, o toSnapshot() também retorna só esses dados básicos do jogador, sem aparência.

Então está funcionando o multiplayer, mas ainda está faltando a camada de network appearance.

Como o sistema deveria funcionar

O ideal é separar em 2 coisas:

1. Estado de rede
   posição, mapa, direção, playerId

2. Aparência visual
   outfitId, spriteSheetUrl, gender, vocationId

O servidor não precisa mandar a sprite inteira toda hora. Ele só precisa mandar a referência da aparência quando o jogador entra.

Exemplo:

export interface PlayerAppearance {
  outfitId: string;
  spriteSheetUrl: string;
  gender: 'male' | 'female';
  vocationId: string;
}

E o snapshot do player deveria virar:

export interface PlayerSnapshot {
  playerId: string;
  name: string;

  mapId: string;
  instanceId?: string;

  tileX: number;
  tileY: number;
  z: number;
  direction: 'north' | 'south' | 'east' | 'west';

  appearance: PlayerAppearance;
}

Assim, quando você abre 2 abas:

Aba 1 entra com Knight male
Aba 2 recebe PlayerSnapshot do Knight male
Aba 2 carrega /tiles/characters/knight_male.png
Aba 2 desenha o outro player com a outfit correta
Onde ajustar no seu sistema
1. shared/protocol.ts

Adicionar aparência no PlayerSnapshot.

Algo assim:

export interface PlayerAppearance {
  outfitId: string;
  spriteSheetUrl: string;
  gender: 'male' | 'female';
  vocationId: string;
}

export interface PlayerSnapshot {
  playerId: string;
  name: string;

  mapId: string;
  instanceId?: string;

  tileX: number;
  tileY: number;
  z: number;
  direction: 'north' | 'south' | 'east' | 'west';

  appearance: PlayerAppearance;
}

E no PlayerMovedMessage, eu também adicionaria direction:

export interface PlayerMovedMessage {
  type: 'player_moved';
  v: number;
  playerId: string;
  tileX: number;
  tileY: number;
  z: number;
  mapId: string;
  instanceId?: string;
  direction?: 'north' | 'south' | 'east' | 'west';
}

Porque o outro jogador precisa virar para a direção certa.

2. POST /api/ws-ticket

O ticket hoje já leva dados importantes do personagem, como characterId, accountId, name, mapId, tileX, tileY, z e direction. Mas ele precisa levar também:

outfitId
spriteSheetUrl
gender
vocationId

Então quando o backend buscar o personagem no banco para gerar o ticket, inclua esses dados.

Exemplo conceitual:

const ticketPayload = {
  characterId: character.id,
  accountId: user.id,
  name: character.name,

  mapId: character.map_id,
  tileX: character.position_x,
  tileY: character.position_y,
  z: character.position_z,
  direction: character.direction,

  appearance: {
    outfitId: character.outfit_id,
    spriteSheetUrl: character.sprite_sheet_url,
    gender: character.gender,
    vocationId: character.vocation_id,
  },
};
3. server/src/GameRoom.ts

No ConnectedPlayer, adicionar:

appearance: PlayerAppearance;

No handleJoin, depois de validar o ticket:

appearance = ticket.appearance;

No toSnapshot, retornar:

private toSnapshot(p: ConnectedPlayer): PlayerSnapshot {
  return {
    playerId: p.id,
    name: p.name,
    mapId: p.mapId,
    instanceId: p.instanceId,
    tileX: p.tileX,
    tileY: p.tileY,
    z: p.z,
    direction: p.direction,
    appearance: p.appearance,
  };
}

E no player_moved, mandar direção:

const payload: ServerMessage = {
  type: 'player_moved',
  v: PROTOCOL_VERSION,
  playerId: player.id,
  tileX: player.tileX,
  tileY: player.tileY,
  z: player.z,
  mapId: player.mapId,
  instanceId: player.instanceId,
  direction: player.direction,
};
4. GameNetClient

Quando receber:

welcome
player_joined
state_sync

ele deve guardar o player com aparência.

Quando receber:

player_moved

ele só atualiza:

posição
mapa
z
direction

Não precisa reenviar appearance em todo movimento.

5. Renderização no playApp

Hoje provavelmente o outro player está sendo desenhado como marcador simples/nome, porque o cliente não tem sprite dele.

O ideal é criar um controlador visual para cada remote player:

const remoteCharacterControllers = new Map<string, CharacterSpriteController>();

Quando chegar um player novo:

player_joined

o client faz:

createRemoteCharacterController(player.appearance.spriteSheetUrl);

Quando o player sair:

player_left

remove:

remoteCharacterControllers.delete(playerId);

Quando ele se mover:

player_moved

atualiza posição/direção e anima.

Fluxo correto final

O fluxo ideal fica assim:

1. Jogador cria personagem
   salva vocation_id, gender, outfit_id, sprite_sheet_url

2. Jogador entra no play
   frontend pede /api/ws-ticket

3. Backend gera ticket com:
   characterId
   accountId
   nome
   posição
   direção
   appearance

4. Cliente conecta no WebSocket
   envia join + ticket

5. Servidor valida ticket
   cria ConnectedPlayer com posição + aparência

6. Servidor envia para os outros:
   player_joined com PlayerSnapshot completo

7. Outros clientes carregam spriteSheetUrl
   desenham a outfit correta

8. Durante movimento:
   servidor envia só posição + direção
Dica importante de performance

Não mande isso a cada movimento:

spriteSheetUrl
outfitId
gender
vocationId
nome

Mande isso só em:

welcome
player_joined
state_sync

E no movimento mande só:

playerId
tileX
tileY
z
mapId
instanceId
direction

Isso reduz muito o tráfego.

Performance para MMORPG 2D

Para seu jogo, eu seguiria essas regras desde agora:

1. Atualização só por sala/mapa

Você já está fazendo isso com roomKey. Ótimo.

O player em Rookgaard não precisa receber movimento de player em outro mapa.

2. Depois, limitar por distância

Hoje, se tiver 100 players no mesmo mapa, todo mundo pode receber todo mundo.

Mais para frente, faça “área de interesse”:

só envia players num raio de 15 a 25 tiles

Exemplo:

player A em x=100, y=100
player B em x=180, y=180
não precisa sincronizar

Isso é uma das maiores otimizações para MMORPG.

3. Não salvar posição a cada passo

Você já fez certo salvando por fila/intervalo no servidor.

Mantenha assim:

salvar posição a cada 15–30 segundos
salvar ao desconectar
salvar ao trocar mapa

Nunca:

salvar no banco a cada movimento
4. Preload/cache de sprites

Quando receber spriteSheetUrl, carregue uma vez e guarde em cache:

const imageCache = new Map<string, HTMLImageElement>();

Se 10 knights usam a mesma sprite, carrega uma vez só.

5. Movimento por tile, não pixel livre

Continue usando movimento por tile. É muito mais barato e mais fácil de validar.

O cliente pode animar suave visualmente, mas a posição oficial é:

tileX
tileY
z
6. JSON está ok agora

Para MVP, JSON no WebSocket está ótimo.

Só pense em binário depois que tiver muitos jogadores online. Agora seria complexidade desnecessária.

O que eu faria agora

Eu faria um commit focado só nisso:

feat: sync remote player appearance over websocket

Com estas mudanças:

1. Adicionar PlayerAppearance no protocol.ts
2. Incluir appearance no ws-ticket
3. Guardar appearance no ConnectedPlayer
4. Enviar appearance em PlayerSnapshot
5. Enviar direction no player_moved
6. Cliente criar sprite controller para remote players
7. Cachear spriteSheetUrl

Depois disso, quando você abrir duas abas, o esperado é:

Aba 1 vê o player 2 com outfit correta
Aba 2 vê o player 1 com outfit correta
nomes aparecem corretamente
movimento sincronizado
direção muda corretamente