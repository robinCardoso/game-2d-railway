# Sistema de loot — Elarion Online

Última revisão: **2026-06-10**

## Modelo atual: loot pessoal por participante

Quando um mob morre, **cada jogador elegível** recebe:

- **XP cheio** (`scaleMobKillXpReward`) — não divide entre o grupo
- **Roll independente** da tabela `loot` do preset (`rollMobLoot` por jogador)
- **Autoloot** direto na mochila (`grantMobAutoloot`)

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
| [`shared/inventoryAutoloot.ts`](../shared/inventoryAutoloot.ts) | Empilha na mochila |

## Catálogo e presets

- Itens: [`public/item_catalog.json`](../public/item_catalog.json) — `implemented: true` obrigatório para dropar
- Loot de mob: campo `loot` em [`public/creature_presets.json`](../public/creature_presets.json)
- Ícones: `tiles/items/icons/{id}.png` — ver [`docs/item-sprite-pipeline.md`](./item-sprite-pipeline.md)

## Invariantes (anti-regressão)

- Random de loot **só no servidor** — nunca no `draw()` do cliente
- `implemented: false` bloqueia drop (validação em `applyAutolootGrants`)
- Dev sem PostgreSQL: inventário em memória (`devInventoryStore.ts`) por `characterId`

## Backlog

- Corpse no chão / pickup manual (estilo Tibia clássico)
- Party UI + modos de loot (leader / round-robin)
- Política B de escala de chance em grupo
- Float de XP para todos os elegíveis (hoje só `killerPlayerId` no cliente)
