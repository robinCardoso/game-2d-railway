Agora você está exatamente no próximo problema natural:

O servidor manda “o player foi do tile A para o tile B”, mas o cliente remoto está desenhando direto no tile B.
Então parece teleporte/pulo, não caminhada.

Você precisa de duas coisas separadas:

1. Interpolação visual entre SQMs
2. Animação walk loop da outfit

Não mexa no servidor agora. O servidor já deve continuar mandando estado discreto por tile. A suavização deve ser no cliente.

Como deve funcionar

O servidor continua sendo autoritativo:

player saiu de x=50,y=50
player foi para x=51,y=50
servidor valida
servidor envia player_moved

O cliente remoto não deve desenhar imediatamente em x=51,y=50.

Ele deve fazer:

posição visual atual: x=50,y=50
posição alvo: x=51,y=50
durante 180ms/250ms/300ms:
  interpolar worldX/worldY até o alvo
quando terminar:
  trava exatamente no tile alvo

E enquanto está interpolando:

sprite remote = walking
frame 1 → frame 2 → frame 3 → frame 4

Quando termina:

sprite remote = idle
frame parado
Estrutura recomendada

Hoje o RemotePlayerSpriteManager carrega a sprite e guarda SpriteAnimationController por player. Ele já atualiza direção no ensurePlayer e chama ctrl.update(nowMs) no tick.

Agora você precisa evoluir ele para guardar também estado visual de movimento.

Eu criaria um novo tipo:

type RemoteVisualState = {
  playerId: string;

  tileX: number;
  tileY: number;
  z: number;

  visualX: number;
  visualY: number;

  fromX: number;
  fromY: number;
  toX: number;
  toY: number;

  moveStartedAt: number;
  moveDurationMs: number;
  moving: boolean;

  lastDirection: 'north' | 'south' | 'east' | 'west';
  controller: SpriteAnimationController;
};

Ou seja: o player remoto passa a ter duas posições:

posição lógica:
  tileX, tileY

posição visual:
  visualX, visualY

A posição lógica vem do servidor.
A posição visual é interpolada no cliente.

Implementação prática
1. Criar movimento remoto dentro de RemotePlayerSpriteManager

Em vez de o playApp desenhar o remoto direto pelo tileX/tileY, o manager deve expor algo como:

remoteSprites.getDrawableState(playerId)

retornando:

{
  worldX: visualX,
  worldY: visualY,
  worldZ: z,
  controller
}
Função de update

Dentro de RemotePlayerSpriteManager, no sync(players):

sync(players: PlayerSnapshot[]): void {
  const now = performance.now();

  for (const player of players) {
    void this.ensurePlayer(player);

    const state = this.states.get(player.playerId);
    if (!state) continue;

    this.applyNetworkPosition(state, player, now);
  }
}

A função applyNetworkPosition:

private applyNetworkPosition(
  state: RemoteVisualState,
  player: PlayerSnapshot,
  now: number
): void {
  const targetWorldX = player.tileX * TILE_SIZE_SCREEN;
  const targetWorldY = player.tileY * TILE_SIZE_SCREEN;

  const changed =
    player.tileX !== state.tileX ||
    player.tileY !== state.tileY ||
    player.z !== state.z;

  if (!changed) {
    state.lastDirection = player.direction;
    state.controller.setDirection(protocolDirectionToSprite(player.direction));
    return;
  }

  state.fromX = state.visualX;
  state.fromY = state.visualY;
  state.toX = targetWorldX;
  state.toY = targetWorldY;

  state.tileX = player.tileX;
  state.tileY = player.tileY;
  state.z = player.z;

  state.moveStartedAt = now;
  state.moveDurationMs = 220;
  state.moving = true;
  state.lastDirection = player.direction;

  state.controller.setDirection(protocolDirectionToSprite(player.direction));
  state.controller.setMoving?.(true);
}

Se o seu SpriteAnimationController ainda não tiver setMoving, aí precisa adicionar.

2. Interpolar no tick

No tick(nowMs) do manager:

tick(nowMs: number): void {
  for (const state of this.states.values()) {
    if (state.moving) {
      const t = Math.min(
        1,
        (nowMs - state.moveStartedAt) / state.moveDurationMs
      );

      const eased = t; // depois pode usar easeOut

      state.visualX = state.fromX + (state.toX - state.fromX) * eased;
      state.visualY = state.fromY + (state.toY - state.fromY) * eased;

      if (t >= 1) {
        state.visualX = state.toX;
        state.visualY = state.toY;
        state.moving = false;
        state.controller.setMoving?.(false);
      }
    }

    state.controller.update(nowMs);
  }
}

Para começar, use linear. Depois você pode melhorar com:

const eased = t < 0.5
  ? 2 * t * t
  : 1 - Math.pow(-2 * t + 2, 2) / 2;

Mas linear já resolve o “pulo”.

3. Walk loop da outfit

O SpriteAnimationController precisa saber quando tocar animação.

A ideia correta:

local player:
  andando pelo input → walking true
  parado → walking false

remote player:
  interpolando entre tiles → walking true
  chegou no alvo → walking false

Se hoje o controller troca frame sempre ou só usa idle, adicione estado:

private moving = false;

setMoving(value: boolean): void {
  this.moving = value;
  if (!value) {
    this.currentFrame = this.getIdleFrameForDirection();
  }
}

No update(nowMs):

update(nowMs: number): void {
  if (!this.moving) {
    this.frameIndex = 0;
    return;
  }

  if (nowMs - this.lastFrameAt >= this.frameDurationMs) {
    this.frameIndex = (this.frameIndex + 1) % this.walkFrames.length;
    this.lastFrameAt = nowMs;
  }
}

O importante: a animação não deve depender de chegar mensagem nova do servidor. Ela deve depender do estado moving.

Duração do movimento

Para agora, eu usaria:

remote move duration: 220ms
walk frame duration: 80ms a 120ms

Por quê?

Se ficar muito rápido:

parece teleporte

Se ficar muito lento:

remote fica atrasado demais

Como o seu jogo é por grid, algo entre 180ms e 260ms costuma ficar bom.

Mais para frente, isso deve vir do servidor:

stepDurationMs

Porque knight, mage, buff de speed, terreno lento etc. podem mudar o tempo do passo.

Mas agora pode ser fixo.

Importante: não sincronizar pixel por rede

Não faça o servidor mandar:

worldX/worldY a cada frame

Isso seria pior para performance.

O certo é:

servidor manda tile discreto
cliente interpola visualmente

Esse é o modelo ideal para seu tipo de jogo.

Cuidado com o depth sort

Quando você interpolar o remoto, o desenho deve usar:

visualX / visualY

mas a ordenação de profundidade pode usar:

visualY + altura do sprite

ou pode continuar usando tileY no começo.

Para ficar bonito, eu recomendo:

sortY = visualY + TILE_SIZE_SCREEN;

Assim, enquanto o player anda, ele passa na frente/atrás de objetos com mais naturalidade.

Como você já usa collectRemoteDepthDrawables e drawDepthSorted, a mudança deve ficar concentrada ali: em vez de usar player.tileX * tileSize, usar a posição visual do manager. O commit mostra que você já mexeu no depthSortDraw.ts para desenhar remotos com sprite real, então esse é o lugar certo para adaptar o desenho.

Ordem que eu faria agora
Commit 1 — suavizar movimento remoto
feat: interpolate remote player movement

Mudanças:

RemotePlayerSpriteManager
  - guardar visualX/visualY
  - detectar mudança de tile
  - interpolar no tick
  - expor estado visual para desenho

playApp/depthSortDraw
  - usar visualX/visualY para desenhar remoto

Esse commit resolve o “pulo de SQM”.

Commit 2 — walk loop do remoto
feat: animate remote player walk cycle

Mudanças:

SpriteAnimationController
  - setMoving(true/false)
  - tocar walk frames quando moving
  - idle quando parado

RemotePlayerSpriteManager
  - setMoving(true) ao iniciar interpolação
  - setMoving(false) ao terminar

Esse commit resolve o “outfit andando”.

Commit 3 — walk loop do local, se ainda não estiver completo
feat: animate local player walk cycle from grid movement

Se o local já anima, ótimo. Se não, aplique a mesma regra:

gridMovement ativo → controller moving true
gridMovement parado → controller moving false