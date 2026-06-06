Minha recomendação prática

Eu faria em 2 commits, nesta ordem:

1. tuning das constantes
2. broadcast no início do passo

Mas eu não pararia no tuning, porque ele melhora, mas não resolve o problema raiz.

Commit 1 — tuning rápido

Faça primeiro porque é pequeno e reduz o delay imediatamente.

Eu usaria:

const REMOTE_STEP_DURATION_MS = 180;
const MIN_REMOTE_STEP_MS = 120;
const MAX_REMOTE_STEP_MS = 260;
const REMOTE_SMOOTHING_EXTRA_MS = 20;
const REMOTE_IDLE_GRACE_MS = 80;

Se você já tem diagonal separada:

const MAX_REMOTE_STEP_WITH_DIAG_MS = 300;

Isso deve deixar o remoto menos “pesado”.

Mas cuidado: se baixar demais, pode voltar o efeito:

anda → trava → anda → trava

Então eu não iria abaixo de 120ms agora.

Commit 2 — broadcast no início do passo

Esse é o commit que realmente vai melhorar a sensação online.

Hoje você tem esse trecho:

if (isSteppingReserveOnly) {
  player.steppingDestTileX = steppingDestTileX;
  player.steppingDestTileY = steppingDestTileY;
  return;
}

O problema é esse return silencioso. O servidor reserva o destino, mas os outros clientes não sabem que o player começou a andar.

O ideal é, nesse momento, enviar um evento para os outros players.

Você tem duas opções.

Opção A — reaproveitar player_moved

Mais simples.

Quando receber isSteppingReserveOnly, depois de validar, envie um player_moved com destino:

const payload: ServerMessage = {
  type: 'player_moved',
  v: PROTOCOL_VERSION,
  playerId: player.id,
  tileX: steppingDestTileX,
  tileY: steppingDestTileY,
  z: player.z,
  mapId: player.mapId,
  instanceId: player.instanceId,
  direction: player.direction,
  stepDurationMs: player.lastStepDurationMs,
};

this.broadcastToRoom(player.roomKey, payload, player.socket);

E mantém o return.

Vantagem

Menos código. O cliente remoto já sabe lidar com player_moved.

Risco

Você está dizendo para o remoto “o player foi para o tile X” antes do servidor finalizar o passo. Mas como o servidor já validou e reservou o destino, para MVP está ok.

Opção B — criar player_stepping

Mais correto.

No protocolo:

export interface PlayerSteppingMessage {
  type: 'player_stepping';
  v: number;
  playerId: string;
  fromTileX: number;
  fromTileY: number;
  toTileX: number;
  toTileY: number;
  z: number;
  mapId: string;
  instanceId?: string;
  direction: Direction;
  stepDurationMs: number;
}

No servidor, quando reservar:

const payload: ServerMessage = {
  type: 'player_stepping',
  v: PROTOCOL_VERSION,
  playerId: player.id,
  fromTileX: player.tileX,
  fromTileY: player.tileY,
  toTileX: steppingDestTileX,
  toTileY: steppingDestTileY,
  z: player.z,
  mapId: player.mapId,
  instanceId: player.instanceId,
  direction: player.direction,
  stepDurationMs: player.lastStepDurationMs,
};

this.broadcastToRoom(player.roomKey, payload, player.socket);

No cliente remoto, player_stepping inicia interpolação para o destino.

Quando o player_moved final chegar depois, ele apenas confirma/corrige.

Vantagem

Mais limpo e mais profissional.

Risco

Mais alteração no protocolo e no cliente.

Qual eu escolheria agora?

Para seu momento, eu escolheria:

Opção A primeiro: reaproveitar player_moved no início do passo.

Motivo: você já está testando Railway, multiplayer e movimento. Agora o objetivo é sentir o jogo fluido rapidamente, sem criar muita estrutura nova.

Depois, se ficar bom, você pode refatorar para player_stepping.

Cuidado importante

Se você mandar player_moved no início do passo e depois mandar outro player_moved no final com o mesmo tile, o cliente remoto não pode reiniciar a interpolação.

Então no RemotePlayerSpriteManager, precisa garantir:

se target tile é igual ao tile atual/target atual:
  não reinicia movimento
  só atualiza direction/stepDuration se necessário

Algo como:

const sameTarget =
  player.tileX === state.tileX &&
  player.tileY === state.tileY &&
  player.z === state.z;

if (sameTarget) {
  state.lastDirection = player.direction;
  state.controller.setDirection(toSpriteDirection(player.direction));
  return;
}

Se isso já existe, ótimo. Se não, implemente antes de broadcastar no início.

Minha ordem final

Eu faria assim:

Commit 1:
tune: reduce remote movement delay

Commit 2:
feat: broadcast remote movement when step starts

No Commit 2, por enquanto:

usar player_moved no reserve-only
não criar player_stepping ainda
garantir que o cliente não reinicie interpolação no mesmo target

Resultado esperado:

Antes:
local anda → termina passo → remoto começa a andar

Depois:
local começa passo → remoto começa a andar quase junto

O delay deve cair de algo como:

350–600ms

para algo mais perto de:

120–250ms

Aí sim vai parecer multiplayer fluido.