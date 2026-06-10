## **Implementações concluídas (P1 escala)**

### **1. AOI de combate e eventos PvP** ✅

`attackHandlers.ts` usa `broadcastToPlayerSpectators` (retângulo 25×20 de `creatureSpectatorRange.ts`) para:

- `player_damaged`
- `player_died`
- `player_respawned`

Mesmo padrão de `player_moved`, `player_joined`, `player_left` e eventos de criatura.

**Teste:** `pvp.test.ts` — jogador longe não recebe `player_damaged`.

---

### **2. Cap de aggro por jogador (estilo OTC)** ✅

`MONSTER_MAX_ACTIVE_CHASERS_PER_TARGET = 10` em `shared/creatureChase.ts`.

- Servidor: `RoomCreatureManager` — só os N mobs mais próximos **em aproximação** rodam chase por alvo; mobs já no alcance melee continuam ativos.
- Offline: `npcAI.ts` — mesma regra para packs grandes no Play SP.

**Helper:** `shouldMonsterApproachChase()` + testes em `creatureChase.test.ts`.

---

### **3. Viewport cull no Play (cliente)** ✅

`collectNpcDepthDrawables` / `collectRemoteDepthDrawables` recebem `viewport` de `playApp.ts` (mesmo bounds do chão visível).

**Teste:** `depthSortDraw.viewport.test.ts`.

---

### **4. Tick de IA só no aware range (servidor)** ✅

`RoomCreatureManager` filtra chase com `creatureHasPlayerInAwareRange()` — mobs sem jogador no retângulo 25×20 não rodam IA de perseguição.

**Helper:** `creatureHasPlayerInAwareRange()` em `creatureSpectatorRange.ts`.

---

### **5. Backlog maior (depois)**


| **Item**                                       | **Quando**                               |
| ---------------------------------------------- | ---------------------------------------- |
| `stepDurationMs` calculado no servidor         | play público / anti-cheat                |
| `move_request` (intenção, não posição)         | refactor de movimento                    |
| BFS pathfinding (cardinal)                     | ✅ `findCardinalPathFirstStep` em `creatureChase.ts` |
| Atualizar `docs/multiplayer-remote-players.md` | ✅ AOI jogadores/criaturas/PvP documentado |


---

Referência OTC: `C:\Users\Robson\source\otc-server-main\server`
