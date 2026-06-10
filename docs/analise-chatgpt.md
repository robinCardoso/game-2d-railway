# Análise escala OTC — implementações P1

Checklist derivado da análise de paridade com OTC/TFS. Detalhes de rede e AOI: [multiplayer-remote-players.md](./multiplayer-remote-players.md).

Última revisão: **2026-06-10**

---

## Implementações concluídas (P1 escala)

### 1. AOI de combate e eventos PvP ✅

`attackHandlers.ts` usa `broadcastToPlayerSpectators` (retângulo 25×20 de `creatureSpectatorRange.ts`) para:

- `player_damaged`
- `player_died`
- `player_respawned`

Mesmo padrão de `player_moved`, `player_joined`, `player_left` e eventos de criatura.

**Teste:** `pvp.test.ts` — jogador longe não recebe `player_damaged`.

---

### 2. Cap de aggro por jogador (estilo OTC) ✅

`MONSTER_MAX_ACTIVE_CHASERS_PER_TARGET = 10` em `shared/creatureChase.ts`.

- Servidor: `RoomCreatureManager` — só os N mobs mais próximos **em aproximação** rodam chase por alvo; mobs já no alcance melee mantêm IA.
- Offline: `npcAI.ts` — mesma regra para packs grandes no Play SP.

**Helper:** `shouldMonsterApproachChase()` + testes em `creatureChase.test.ts`.

---

### 3. Viewport cull no Play (cliente) ✅

`collectNpcDepthDrawables` / `collectRemoteDepthDrawables` recebem `viewport` de `playApp.ts` (mesmo bounds do chão visível).

**Teste:** `depthSortDraw.viewport.test.ts`.

---

### 4. Tick de IA só no aware range (servidor) ✅

`RoomCreatureManager` filtra chase com `creatureHasPlayerInAwareRange()` — mobs sem jogador no retângulo 25×20 não rodam IA de perseguição.

**Helper:** `creatureHasPlayerInAwareRange()` em `creatureSpectatorRange.ts`.

---

### 5. Velocidade de caminhada por mob (`walkStepMs`) ✅

- Campo opcional em `creature_presets.json` / `mobPresetTypes.ts`
- Editor: **Criar → Mobs Stats** → campo **Velocidade de caminhada (ms/tile)**
- Servidor: `RoomCreatureManager` + `tickMonsterChaseStep` usam `walkStepMs` no gate e no `stepDurationMs` do protocolo
- Offline: `npcAI.ts` sincroniza `moveSpeedPx` com o preset

**Testes:** `creatureChase.test.ts` — `walkStepMs` e facing aggro.

---

## Movimento WS — correção rubber-band (jun/2026) ✅

Em produção (latência Railway), `MOVEMENT_TOO_FAST` gerava `position_correction` e o jogador **voltava** visualmente na diagonal.

- Servidor: `MOVEMENT_TOO_FAST` → só `error`, **sem** `position_correction`
- Cliente: `forceResyncPosition()` reenvia o tile quando o intervalo já passou
- Tolerância rate limit: `stepDurationMs × 0.80`

Ver [multiplayer-remote-players.md](./multiplayer-remote-players.md) §2.2.

---

## Backlog maior (depois)

| Item | Quando |
|------|--------|
| `stepDurationMs` calculado no servidor | play público / anti-cheat |
| `move_request` (intenção, não posição) | refactor de movimento |
| BFS pathfinding (cardinal) | ✅ `findCardinalPathFirstStep` em `creatureChase.ts` |
| Buffer snapshots atrasado 100–150ms | remotos mais suaves |
| `stages.json` por level | substitui `GAME_RATE_EXP` global |

---

Referência OTC: `otc-server-main` (local, se disponível).

Índice geral: [recent-features-jun-2026.md](./recent-features-jun-2026.md).
