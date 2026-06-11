## Status da implementação (2026-06-11)

| Fase | Estado | Notas |
|------|--------|-------|
| 0 Baseline | ✅ | Testes OR em `tileWalkable`; lifecycle minimize preservado |
| 1 Primitivos | ✅ | `shared/movement/direction8.ts`, `distance.ts` |
| 2 Servidor validator | ✅ | `movementValidator`, `movementTiming` (1.15), `movementRateLimit` |
| 3 Protocolo | ✅ | `move` com `direction8` + `seq`; legado `tileX/Y` sem `direction8` |
| 4 Cliente buffer | ✅ | `movementInputBuffer`, `inputDirection8`, `getNetworkStepDurationMs` |
| 5 Combate | ✅ | Chebyshev em `playerAttack` / magias (`isPlayerInAttackRange`) |
| 6 Mobs diagonal | ✅ | `getChaseDirection8` em `creatureChase` (cardinal → diagonal) |
| 7 Auto-walk | ✅ | A* `pathfinding8.ts`; Shift+clique no Play |
| 8 Mobile | ✅ | Joystick 8-dir Capacitor (`mobileDirection8.ts`) |

**Decisões fixas:** canto diagonal **OR** (`sideXOk \|\| sideYOk`); servidor fator diagonal **1.15**; `MOVEMENT_TOO_FAST` sem `position_correction`.

---

Vou estruturar como uma migração segura, não como “trocar a movimentação inteira de uma vez”. A parte mais delicada é diagonal sem quebrar colisão, ataque, monstros, PvP e validação do servidor.

Pensou por 6s

Sim. Se vamos mirar uma sensação mais próxima de Zezenia Online, então o plano precisa deixar de ser “4 direções com suavização” e virar um sistema de 8 direções server-authoritative, com diagonal segura.

Só um cuidado: eu encontrei documentação oficial/wiki do Zezenia falando de setas/WASD e auto-walk, mas não encontrei uma página oficial atual dizendo claramente “diagonal movement” como regra documentada. Existe discussão antiga no fórum do Zezenia sugerindo teclas diagonais Q/E/Z/X, o que mostra que esse tema faz parte da comunidade do jogo. Então vou tratar o objetivo como: implementar movimento 8 direções no seu jogo, com sensação Zezenia-like, mantendo o servidor como autoridade.

Plano estrutural: movimento 8 direções estilo Zezenia
Objetivo final

O jogador poderá andar em:

Norte
Sul
Leste
Oeste
Noroeste
Nordeste
Sudoeste
Sudeste

Mas o servidor continuará decidindo tudo:

pode andar?
qual tile destino?
tem colisão?
tem criatura bloqueando?
tem portal?
está muito rápido?
está em PZ?
está em combate?
qual velocidade real?

O cliente só melhora a sensação visual.

1. Modelo de direção

Hoje provavelmente seu sistema trabalha com algo próximo disso:

type Direction = 'north' | 'south' | 'east' | 'west';

Precisamos expandir para:

export type Direction8 =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'north_east'
  | 'north_west'
  | 'south_east'
  | 'south_west';

Criar arquivo:

shared/movement/directions.ts

Conteúdo sugerido:

export type Direction8 =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'north_east'
  | 'north_west'
  | 'south_east'
  | 'south_west';

export type DirectionVector = {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
};

export const DIRECTION_VECTORS: Record<Direction8, DirectionVector> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },

  north_east: { dx: 1, dy: -1 },
  north_west: { dx: -1, dy: -1 },
  south_east: { dx: 1, dy: 1 },
  south_west: { dx: -1, dy: 1 }
};

export function isDiagonalDirection(direction: Direction8): boolean {
  const v = DIRECTION_VECTORS[direction];
  return v.dx !== 0 && v.dy !== 0;
}
2. Regra mais importante: diagonal não pode atravessar parede

Esse é o ponto mais perigoso.

Exemplo:

@ = player
# = parede
. = livre

# .
@ .

Se o player tentar ir para nordeste, o tile diagonal pode estar livre, mas ele está “passando pela quina” da parede.

Então para andar diagonal, não basta validar o tile destino.

Para ir de:

x, y

para:

x + 1, y - 1

o servidor precisa validar:

destino diagonal: x + 1, y - 1
tile lateral:      x + 1, y
tile vertical:     x, y - 1

Ou seja:

function canMoveDiagonal(fromX, fromY, dx, dy) {
  const destination = isWalkable(fromX + dx, fromY + dy);
  const sideA = isWalkable(fromX + dx, fromY);
  const sideB = isWalkable(fromX, fromY + dy);

  return destination && sideA && sideB;
}

Minha recomendação: não permita cortar canto.

Regra:

Diagonal só é permitida se o destino e os dois tiles adjacentes estiverem livres.

Isso evita bug de andar atravessando parede, árvore, pedra, mob ou canto de casa.

Opção B — diagonal custa mais tempo

Usar fator aproximado:

diagonal = step normal * 1.414

Exemplo:

const DIAGONAL_SPEED_FACTOR = 1.414;

Se o step normal é:

160ms

diagonal seria:

226ms

Vantagem:

justo matematicamente
bom para PvP
bom para balanceamento

Problema:

pode parecer menos fluido
Minha recomendação para seu jogo

Eu usaria um meio-termo:

const DIAGONAL_SPEED_FACTOR = 1.15;

Não deixa diagonal absurdamente rápida, mas também não deixa pesada.

Exemplo:

step reto:     160ms
step diagonal: 184ms

Isso dá sensação boa sem quebrar completamente o balanceamento.

4. Protocolo WebSocket

Hoje seu cliente provavelmente manda algo como:

{
  type: 'move',
  direction: 'north'
}

Vamos manter isso simples:

{
  type: 'move',
  direction: 'north_east',
  seq: 123,
  clientTime: 123456789
}

O servidor responde:

{
  type: 'player_moved',
  playerId: '...',
  fromTileX: 100,
  fromTileY: 100,
  tileX: 101,
  tileY: 99,
  direction: 'north_east',
  stepDurationMs: 184,
  serverTime: 999999,
  seq: 123
}

O seq é importante para o cliente saber qual input foi confirmado.

5. Alteração no servidor

Criar pasta:

server/src/gameRoom/movement/

Arquivos:

server/src/gameRoom/movement/direction8.ts
server/src/gameRoom/movement/movementValidator.ts
server/src/gameRoom/movement/movementTiming.ts
server/src/gameRoom/movement/movementAntiCheat.ts
movementValidator.ts

Responsável por validar tile destino.

import {
  DIRECTION_VECTORS,
  Direction8,
  isDiagonalDirection
} from '../../../shared/movement/directions';

type ValidateMoveInput = {
  fromX: number;
  fromY: number;
  z: number;
  direction: Direction8;
  isWalkable: (x: number, y: number, z: number) => boolean;
  isOccupied: (x: number, y: number, z: number) => boolean;
};

export function validateMove(input: ValidateMoveInput) {
  const vector = DIRECTION_VECTORS[input.direction];

  const toX = input.fromX + vector.dx;
  const toY = input.fromY + vector.dy;

  if (!input.isWalkable(toX, toY, input.z)) {
    return {
      ok: false as const,
      code: 'NOT_WALKABLE',
      toX,
      toY
    };
  }

  if (input.isOccupied(toX, toY, input.z)) {
    return {
      ok: false as const,
      code: 'OCCUPIED_TILE',
      toX,
      toY
    };
  }

  if (isDiagonalDirection(input.direction)) {
    const sideX = input.fromX + vector.dx;
    const sideY = input.fromY;

    const verticalX = input.fromX;
    const verticalY = input.fromY + vector.dy;

    if (!input.isWalkable(sideX, sideY, input.z)) {
      return {
        ok: false as const,
        code: 'DIAGONAL_BLOCKED_SIDE_X',
        toX,
        toY
      };
    }

    if (!input.isWalkable(verticalX, verticalY, input.z)) {
      return {
        ok: false as const,
        code: 'DIAGONAL_BLOCKED_SIDE_Y',
        toX,
        toY
      };
    }

    if (input.isOccupied(sideX, sideY, input.z)) {
      return {
        ok: false as const,
        code: 'DIAGONAL_BLOCKED_CREATURE_X',
        toX,
        toY
      };
    }

    if (input.isOccupied(verticalX, verticalY, input.z)) {
      return {
        ok: false as const,
        code: 'DIAGONAL_BLOCKED_CREATURE_Y',
        toX,
        toY
      };
    }
  }

  return {
    ok: true as const,
    toX,
    toY,
    direction: input.direction
  };
}
6. Timing do movimento

Criar:

server/src/gameRoom/movement/movementTiming.ts
import { Direction8, isDiagonalDirection } from '../../../shared/movement/directions';

const DIAGONAL_SPEED_FACTOR = 1.15;

export function getStepDurationMs(baseStepDurationMs: number, direction: Direction8): number {
  if (!isDiagonalDirection(direction)) {
    return baseStepDurationMs;
  }

  return Math.round(baseStepDurationMs * DIAGONAL_SPEED_FACTOR);
}

Depois, dentro do moveHandlers.ts, onde hoje calcula stepDurationMs, aplicar:

const finalStepDurationMs = getStepDurationMs(baseStepDurationMs, direction);
7. Anti-cheat no servidor

O servidor precisa validar cooldown diferente para diagonal.

Hoje você já tem problemas com MOVEMENT_TOO_FAST. Com diagonal, precisa ficar ainda mais controlado.

Regra:

const minAllowedNextMoveAt = player.lastMoveAt + finalStepDurationMs - toleranceMs;

Exemplo:

const MOVE_TOLERANCE_MS = 35;

Validação:

if (now < player.nextMoveAllowedAt - MOVE_TOLERANCE_MS) {
  rejectMove(player, 'MOVEMENT_TOO_FAST', false);
  return;
}

E quando o movimento for aceito:

player.lastMoveAt = now;
player.nextMoveAllowedAt = now + finalStepDurationMs;

Importante: o cliente pode mandar direction: 'north_east', mas quem calcula o tempo é o servidor.

8. Cliente: input com 8 direções

Criar:

src/game/movement/inputDirectionResolver.ts
import type { Direction8 } from '../../../shared/movement/directions';

type PressedKeys = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export function resolveDirection8(keys: PressedKeys): Direction8 | null {
  const vertical =
    keys.up && !keys.down
      ? 'north'
      : keys.down && !keys.up
        ? 'south'
        : null;

  const horizontal =
    keys.left && !keys.right
      ? 'west'
      : keys.right && !keys.left
        ? 'east'
        : null;

  if (vertical === 'north' && horizontal === 'east') return 'north_east';
  if (vertical === 'north' && horizontal === 'west') return 'north_west';
  if (vertical === 'south' && horizontal === 'east') return 'south_east';
  if (vertical === 'south' && horizontal === 'west') return 'south_west';

  if (vertical) return vertical;
  if (horizontal) return horizontal;

  return null;
}
9. Input buffer

Para ficar gostoso, não pode depender de apertar exatamente no frame certo.

Criar:

src/game/movement/movementInputBuffer.ts
import type { Direction8 } from '../../../shared/movement/directions';

const MAX_BUFFER_SIZE = 2;

export class MovementInputBuffer {
  private queue: Direction8[] = [];

  push(direction: Direction8) {
    const last = this.queue[this.queue.length - 1];

    if (last === direction) {
      return;
    }

    this.queue.push(direction);

    while (this.queue.length > MAX_BUFFER_SIZE) {
      this.queue.shift();
    }
  }

  pop(): Direction8 | null {
    return this.queue.shift() ?? null;
  }

  peek(): Direction8 | null {
    return this.queue[0] ?? null;
  }

  clear() {
    this.queue = [];
  }
}

Regra:

Se o player está andando, guarda até 2 próximos inputs.
Quando termina o step, envia o próximo.
10. Cliente: interpolação diagonal

Hoje o player anda de um tile para outro.

Para diagonal, o interpolador precisa aceitar X e Y ao mesmo tempo.

Criar:

src/game/movement/smoothStepInterpolator.ts
type Step = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number;
  durationMs: number;
};

export function interpolateStep(step: Step, now: number) {
  const elapsed = now - step.startedAt;
  const t = Math.min(1, Math.max(0, elapsed / step.durationMs));

  const eased = easeOutCubic(t);

  return {
    x: step.fromX + (step.toX - step.fromX) * eased,
    y: step.fromY + (step.toY - step.fromY) * eased,
    done: t >= 1
  };
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

Esse interpolador funciona para:

100,100 -> 101,100
100,100 -> 101,99
100,100 -> 100,99

Sem diferença estrutural.

11. Sprite e direção visual

Aqui temos uma decisão importante.

Opção B — manter 4 direções e mapear diagonal para direção dominante

Mais simples.

function getVisualFacing(direction: Direction8) {
  if (direction === 'north_east') return 'east';
  if (direction === 'south_east') return 'east';
  if (direction === 'north_west') return 'west';
  if (direction === 'south_west') return 'west';

  return direction;
}

Minha recomendação: permitir ataque melee diagonal, mas com cuidado.

A validação vira:

const dx = Math.abs(attacker.tileX - target.tileX);
const dy = Math.abs(attacker.tileY - target.tileY);

const isAdjacent8 = dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);

Para melee:

if (!isAdjacent8) {
  rejectAttack('TARGET_TOO_FAR');
}

Para distância/magia:

const distance = Math.max(dx, dy);

Isso se chama distância Chebyshev.

Exemplo:

reta:     dx=3, dy=0 => distância 3
diagonal: dx=3, dy=3 => distância 3

Em jogo com 8 direções, isso faz sentido.

13. Magias em área

Aqui precisa padronizar cedo.

Com diagonal, existem três formas de medir range:

Manhattan
distance = dx + dy;

Ruim para diagonal, porque diagonal fica mais cara.

Euclidiana
distance = Math.sqrt(dx * dx + dy * dy);

Boa matematicamente, mas pode complicar visual tile-based.

Chebyshev
distance = Math.max(dx, dy);

Minha recomendação para seu jogo:

Usar Chebyshev para range de ataque/magia.

Porque combina com grid 8 direções.

14. Monstros com diagonal

Não implemente diagonal no player e deixe monstros burros por muito tempo.

Fase 1:

Player anda diagonal
Monstros continuam 4 direções

Só para testar.

Fase 2:

Monstros usam diagonal para perseguir

Regra simples de IA:

function getChaseDirection(monster, target): Direction8 {
  const dx = Math.sign(target.tileX - monster.tileX);
  const dy = Math.sign(target.tileY - monster.tileY);

  if (dx === 1 && dy === -1) return 'north_east';
  if (dx === -1 && dy === -1) return 'north_west';
  if (dx === 1 && dy === 1) return 'south_east';
  if (dx === -1 && dy === 1) return 'south_west';
  if (dx === 1) return 'east';
  if (dx === -1) return 'west';
  if (dy === -1) return 'north';
  if (dy === 1) return 'south';

  return null;
}

Mas sempre usando o mesmo movementValidator.

Nunca criar uma regra separada para monstro.

15. Auto-walk por clique

Zezenia tem clique no mapa/minimap para auto-walk documentado no manual/wiki.

No seu jogo, o auto-walk precisa evoluir para pathfinding 8 direções.

Hoje, se você tiver pathfinding 4 direções, ele funciona assim:

vai direita
vai direita
vai cima
vai cima

Com 8 direções:

vai nordeste
vai nordeste

O algoritmo ideal:

A* com 8 vizinhos

Vizinhos:

const neighbors = [
  { dx: 0, dy: -1, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },

  { dx: 1, dy: -1, cost: 1.15 },
  { dx: -1, dy: -1, cost: 1.15 },
  { dx: 1, dy: 1, cost: 1.15 },
  { dx: -1, dy: 1, cost: 1.15 }
];

Mas novamente: diagonal só entra se não cortar canto.

16. Mobile

Para celular, diagonal é ainda mais importante.

Se o jogador usa direcional virtual, precisamos de 8 zonas:

       N
   NW     NE
W     centro    E
   SW     SE
       S

No joystick virtual:

const angle = Math.atan2(pointerY, pointerX);

Depois converte para 8 direções.

Mas eu não começaria por joystick analógico livre. Eu faria:

Joystick visual redondo
mas internamente snap para 8 direções

Ou seja, mesmo se o dedo estiver em qualquer ângulo, o jogo converte para um dos 8 comandos.

17. Ordem de implementação correta
Fase 1 — Base compartilhada

Arquivos:

shared/movement/directions.ts
shared/movement/distance.ts

Implementar:

Direction8
DIRECTION_VECTORS
isDiagonalDirection
getChebyshevDistance
getManhattanDistance

Não mexe ainda em servidor/client.

Fase 2 — Servidor aceita direção 8

Arquivos:

server/src/gameRoom/handlers/moveHandlers.ts
server/src/gameRoom/movement/movementValidator.ts
server/src/gameRoom/movement/movementTiming.ts

Implementar:

validação de Direction8
destino diagonal
bloqueio de cortar canto
stepDuration diagonal
anti-cheat por nextMoveAllowedAt

Neste ponto, o cliente ainda pode mandar só 4 direções.

Fase 3 — Cliente envia diagonal

Arquivos:

src/game/movement/inputDirectionResolver.ts
src/game/movement/movementInputBuffer.ts
src/net/gameNetClient.ts
src/pages/playApp.ts

Implementar:

detectar duas teclas pressionadas
converter para Direction8
enviar move diagonal
buffer de até 2 steps
cancelar buffer quando erro grave
Fase 4 — Interpolação visual

Arquivos:

src/game/movement/smoothStepInterpolator.ts
src/game/render/playerRenderer.ts
src/game/render/remotePlayerRenderer.ts

Implementar:

fromX/fromY -> toX/toY
suavização diagonal
remote players com stepDurationMs
sem teleportar remoto toda hora
Fase 5 — Combate

Arquivos:

server/src/gameRoom/handlers/attackHandlers.ts
server/src/gameRoom/combat/combatRange.ts
server/src/gameRoom/creatures/RoomCreatureManager.ts

Implementar:

melee adjacente 8 direções
range com Chebyshev
magias usando regra padronizada
monstros validando alcance diagonal
Fase 6 — Monstros

Arquivos:

server/src/gameRoom/creatures/RoomCreatureManager.ts
server/src/gameRoom/creatures/creatureMovement.ts
server/src/gameRoom/pathfinding/pathfinder8.ts

Implementar:

chase diagonal simples
depois A* 8 direções
bloqueio de cortar canto
ocupação de tile
Fase 7 — Auto-walk

Arquivos:

src/game/pathfinding/clientPathPreview.ts
server/src/gameRoom/pathfinding/pathfinder8.ts

Implementar:

click to move
path 8 direções
servidor valida cada passo
cliente apenas sugere caminho
Fase 8 — Mobile

Arquivos:

src/ui/mobile/virtualJoystick.ts
src/game/movement/mobileDirectionResolver.ts

Implementar:

joystick 8 direções
snap por ângulo
não enviar movimento se dedo estiver no centro
18. Ajustes no banco/dados

Provavelmente você não precisa mudar banco.

Se hoje salva:

tileX
tileY
z
direction

Só precisa garantir que direction aceite valores novos:

north_east
north_west
south_east
south_west

Se o banco tiver enum rígido, precisa migration.

Se for texto livre, não precisa.

19. Riscos principais
Risco 1 — atravessar parede na diagonal

Resolve com:

validar destino + dois lados adjacentes
Risco 2 — diagonal ficar rápida demais

Resolve com:

DIAGONAL_SPEED_FACTOR = 1.15 ou 1.20
Risco 3 — PvP ficar desbalanceado

Resolve com:

range Chebyshev
cooldown server-side
melee 8 direções
testes de perseguição
Risco 4 — sprite ficar estranho

Resolve em fases:

primeiro 4 direções
depois 8 direções para player
depois 8 direções para monstros
Risco 5 — cliente dessincronizar

Resolve com:

seq no move
serverTime no player_moved
nextMoveAllowedAt no servidor
resync leve
position_correction só em erro grave
20. Checklist técnico para considerar pronto

Antes de considerar a diagonal pronta, eu testaria:

[ ] andar nordeste em campo aberto
[ ] andar sudeste em campo aberto
[ ] tentar cortar canto de parede
[ ] tentar passar diagonal entre dois objetos
[ ] tentar diagonal contra mob bloqueando
[ ] atacar mob na diagonal
[ ] mob perseguir player na diagonal
[ ] player fugir diagonal sem ficar rápido demais
[ ] auto-walk usar diagonal
[ ] remoto ver outro player andando diagonal suave
[ ] minimizar Electron e voltar sem teleportar errado
[ ] spam de tecla não gerar MOVEMENT_TOO_FAST em excesso
[ ] servidor bloquear pacote adulterado
Minha recomendação final

Sim, vale implementar diagonal.

Mas eu não faria como uma feature visual. Eu faria como uma mudança de arquitetura de movimento:

4 direções tile-based
        ↓
8 direções server-authoritative
        ↓
diagonal com colisão segura
        ↓
interpolação suave
        ↓
combate/range adaptado
        ↓
monstros/pathfinding adaptados

O primeiro commit ideal seria pequeno:

feat(movement): add shared 8-direction movement primitives

Depois:

feat(server): validate diagonal movement without corner cutting

Depois:

feat(client): resolve keyboard input into 8-direction movement

Essa ordem evita quebrar o jogo inteiro e permite testar cada etapa separadamente.