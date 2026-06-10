# Sistema de loot — Elarion Online

Última revisão: **2026-06-10**

## Modelo atual: loot pessoal por participante

Quando um mob morre, **cada jogador elegível** recebe:

- **XP cheio** (`scaleMobKillXpReward`) — não divide entre o grupo
- **Roll independente** da tabela `loot` do preset (`rollMobLoot` por jogador)
- **Autoloot** direto nas bolsas liberadas (`grantMobAutoloot`) — preenchimento sequencial 1→2→3 (até 5 quando desbloqueadas)

O `killerPlayerId` em `creature_died` permanece **apenas para UI** (float de XP no cliente).

## Elegibilidade

Um jogador recebe XP + loot se **todas** forem verdadeiras:

1. Causou dano autoritativo ao mob nesta vida (`damageByPlayer` ≥ 1)
2. Está **vivo** (`health > 0`)
3. Na **mesma sala** `mapId@instanceId`
4. No **AOI de combate** (retângulo 25×20 OTC) em relação ao tile do mob na morte
5. Dano acumulado ≥ **5%** do `maxHealth` do mob (`LOOT_MIN_DAMAGE_SHARE_PERCENT`)

Implementação: [`shared/lootEligibility.ts`](../shared/lootEligibility.ts)

## Economia em grupo

**Política A (ativa):** roll completo da tabela por jogador elegível — co-op recompensador em dev/teste.

Se a inflação aparecer em produção, migrar para política B (escalar `chance / sqrt(n)` ou `chance / n`) — ver backlog no plano de loot multi-jogador.

## Pipeline servidor

```
processAttack / processSpellCast
  → damageByPlayer[playerId] += damage
Mob morre
  → resolveLootEligiblePlayerIds(...)
  → para cada elegível: grantKillExperience + grantMobAutoloot
  → WS inventory_updated + chat loot (só para o jogador)
```

Arquivos:

| Arquivo | Função |
|---------|--------|
| [`server/src/game/RoomCreatureManager.ts`](../server/src/game/RoomCreatureManager.ts) | `damageByPlayer`, loot do preset |
| [`server/src/game/grantAutoloot.ts`](../server/src/game/grantAutoloot.ts) | Roll + persistência PG |
| [`server/src/gameRoom/handlers/creatureKillRewards.ts`](../server/src/gameRoom/handlers/creatureKillRewards.ts) | Orquestra XP + loot por elegível |
| [`shared/mobLoot.ts`](../shared/mobLoot.ts) | `rollMobLoot` |
| [`shared/inventoryAutoloot.ts`](../shared/inventoryAutoloot.ts) | Empilha nas bolsas liberadas (sequencial) |
| [`shared/inventoryBags.ts`](../shared/inventoryBags.ts) | Helpers 5 bolsas × 50 slots, `unlockedBagSlots` |

## Catálogo e presets

- Itens: [`public/item_catalog.json`](../public/item_catalog.json) — `implemented: true` obrigatório para dropar
- Loot de mob: campo `loot` em [`public/creature_presets.json`](../public/creature_presets.json)
- Ícones: `tiles/items/icons/{id}.png` — ver [`docs/item-sprite-pipeline.md`](./item-sprite-pipeline.md)

## Invariantes (anti-regressão)

- Random de loot **só no servidor** — nunca no `draw()` do cliente
- `implemented: false` bloqueia drop (validação em `applyAutolootGrants`)
- **5 bolsas** independentes (`bags[0..4]`), **50 slots** cada; padrão **3 liberadas** (`unlockedBagSlots: 3`); bolsas 4–5 bloqueadas até compra futura
- Autoloot enche bolsa 1, depois 2, depois 3 (só nas liberadas); overflow se todas cheias
- Dev sem PostgreSQL: inventário em memória (`devInventoryStore.ts`) por `characterId`
- **Railway `DATA_ROOT`:** volume pode ter `item_catalog.json` antigo/vazio — boot mescla do repo (`catalogVolumeSync.ts`); servidor e `/item_catalog.json` fazem fallback se ainda vazio
- **Equip manual:** autoloot só enche bolsas; Play HUD → abas **1–5** → clique no item → Equipar/Desequipar → `PUT /inventory` + WS `inventory_updated` (8 slots equipamento; equipar de qualquer bolsa liberada)
- **PUT inventário:** cliente não pode aumentar `unlockedBagSlots` — validado contra `characters.unlocked_bag_slots` (migration `008_character_unlocked_bags.sql`)

## Backlog

- Loja / API `unlock-bag` para bolsas 4–5 (monetização; flag `unlocked_bag_slots` já persistida)
- Mover item manualmente entre bolsas
- Corpse no chão / pickup manual (estilo Tibia clássico)
- Party UI + modos de loot (leader / round-robin)
- Política B de escala de chance em grupo
- Float de XP para todos os elegíveis (hoje só `killerPlayerId` no cliente)
