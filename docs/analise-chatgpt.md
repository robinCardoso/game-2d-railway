## **Próxima implementação recomendada**

### **1. AOI de combate e eventos PvP (P1 — continuação natural do P0)**

Hoje `attackHandlers.ts` ainda usa `broadcastToRoom` para:

- `player_damaged`
- `player_died`
- `player_respawned`

Quem está longe recebe pacote à toa. O próximo passo é trocar por `broadcastToPlayerSpectators` (mesmo retângulo 25×20 de `creatureSpectatorRange.ts`), como já foi feito em `player_moved`.

**Esforço:** baixo (~1 handler + testes)  
**Ganho:** menos tráfego WS e menos trabalho no cliente com muitos jogadores

---

### **2. Cap de aggro por jogador (estilo OTC)**

Com muitos Magões, todos dentro de 7 SQM ainda rodam IA de chase todo tick — só 8 ocupam surround, o resto vai pro anel, mas **todos pensam**.

Limitar a ~8–10 mobs **ativos** por alvo (os mais próximos) reduz CPU no servidor e deixa o comportamento mais Tibia.

**Esforço:** médio  
**Ganho:** escala com packs grandes (como na sua screenshot)

---

### **3. Viewport cull no Play (cliente)**

Itens já usam `viewport` em `collectItemDepthDrawables`; **NPCs e remotos não** — `collectNpcDepthDrawables` / `collectRemoteDepthDrawables` iteram tudo.

Com 30+ entidades, isso pesa no draw mesmo fora da tela.

**Esforço:** baixo–médio  
**Ganho:** FPS no Play com muitos mobs/jogadores

---

### **4. Tick de IA só no aware range (servidor)**

Broadcast de criaturas já é filtrado; o **tick de chase** ainda roda para todos os monstros da sala com alvo no aggro.

Pular mobs sem nenhum jogador no retângulo 25×20 economiza CPU em mapas grandes.

**Esforço:** médio  
**Ganho:** servidor com mapas cheios de spawn

---

### **5. Backlog maior (depois)**


| **Item**                                       | **Quando**                               |
| ---------------------------------------------- | ---------------------------------------- |
| `stepDurationMs` calculado no servidor         | play público / anti-cheat                |
| `move_request` (intenção, não posição)         | refactor de movimento                    |
| A* pathfinding                                 | mobs presos em obstáculos com frequência |
| Atualizar `docs/multiplayer-remote-players.md` | AOI jogadores ainda marcado como backlog |


---

  
"C:\Users\Robson\source\otc-server-main\server"