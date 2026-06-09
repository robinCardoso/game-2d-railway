# Pipeline de sprites de itens (inventário + mundo)

Plano para evoluir o **catálogo de itens** (metadados + stats) até itens **visíveis e jogáveis** no inventário, com suporte futuro a animações.

**Estado atual (2026-06-08):** Commits A+B+C+D implementados — calibrador com strip animada (`animations.idle`), preview animado no Studio e inventário Play com loop via `itemIconAnimator`. **Falta:** drop no chão (Commit E), PNGs reais nos itens seed, checklist manual HUD §18.

---

## O que já existe (não confundir)

| Camada | Onde | O que faz |
|--------|------|-----------|
| **Catálogo** | `public/item_catalog.json` | id, nome, categoria, slot, `speedBonus` / `attackBonus` / `defenseBonus`, flag `implemented` |
| **Editor Studio** | Menu Criar → 📦 Itens (Catálogo) | CRUD do JSON; badge **OK** = `implemented: true` |
| **Loot de mobs** | Mobs Stats | Valida `itemId` contra o catálogo |
| **Inventário PG** | `character_equipment` + `character_backpack_slots` | Persistência autoritativa |
| **Combate servidor** | `GameRoom` + `equipmentBonuses` | Bônus de ataque/defesa do equipamento |
| **HUD inventário Play** | `playHudInventory.ts` | Ícone 32×32 (estático ou animado); fallback texto sem sprite |
| **Sprites de mapa** | `tiles/maps/items/**` | Decoração no **mapa** (Y-sort); **não** é ícone de inventário |

Os itens seed (`boots_of_haste`, `warrior_ring`, etc.) são **rascunhos de stats** — `implemented: false` até existir arte + calibração.

---

## O que ainda não existe (escopo restante)

1. Sprite no chão / drop (Commit E)
2. PNGs calibrados nos itens seed do catálogo
3. Animações custom (frames fora de ordem row-major) — hoje só strip `idle` automática
4. FX de uso / equipado no personagem

---

## Taxonomia proposta de assets

Separar **mapa** de **inventário** (anti-regressão):

```
tiles/
  maps/items/          → decoração no mapa (já existe; paletteCategory: items)
  items/               → NOVO — gameplay de item
    icons/             → ícone 32×32 (inventário, loot popup)
    world/             → sprite no chão (drop, opcional)
    effects/           → strip animada (brilho, poção, etc.; opcional)
```

| Pasta | Entra no tile registry? | Uso |
|-------|-------------------------|-----|
| `tiles/maps/**` | Sim | Mapa Studio |
| `tiles/items/**` | **Não** | Fetch dedicado (como `tiles/effects/**`) |
| `tiles/characters/**` | Não | Personagens |

---

## Formato do catálogo (evolução)

Manter `item_catalog.json` como fonte de verdade de **gameplay**. Adicionar campos visuais (fase 1):

```json
{
  "id": "warrior_ring",
  "name": "Warrior Ring",
  "category": "equipment",
  "slot": "ring",
  "attackBonus": 2,
  "implemented": false,
  "sprite": {
    "iconUrl": "tiles/items/icons/warrior_ring.png",
    "frameWidth": 32,
    "frameHeight": 32,
    "gridCols": 1,
    "gridRows": 1
  }
}
```

Fase 2 (animações):

```json
"sprite": {
  "iconUrl": "tiles/items/icons/magic_potion.png",
  "frameWidth": 32,
  "frameHeight": 32,
  "gridCols": 4,
  "gridRows": 1,
  "animations": {
    "idle": { "frames": [0, 1, 2, 3], "speedFps": 8, "loop": true }
  }
}
```

Alternativa: `public/item_sprite_calibration.json` (chave = `itemId`), espelhando `knight.calibration.json` — decisão na implementação; o catálogo deve referenciar URL estável.

---

## Studio — fluxo profissional (commits sugeridos)

### Commit A — Fundação

- Criar `tiles/items/icons/` (vazio + `.gitkeep`)
- Estender `ItemCatalogEntry` + `sanitizeItemCatalogEntry` com bloco `sprite` opcional
- APIs: ao salvar catálogo, validar que `implemented: true` exige `sprite.iconUrl` e arquivo no disco
- Documentar em `docs/asset-taxonomy.md`

### Commit B — Calibrador de item

- Novo modal: **Criar → Sprite de Item** (ou aba no catálogo “Visual”)
- Reutilizar padrões de `mapSpriteEditor` / `characterCalibratorModal`:
  - grade 32×32 (ou N×32 strip)
  - preview com célula tracejada
  - export PNG para `tiles/items/icons/{itemId}.png`
  - salvar calibração no catálogo ou JSON lateral
- Botão no catálogo: “Abrir calibrador” quando item selecionado
- Listagem no catálogo: thumbnail 32×32 ao lado do nome (quando existir PNG)

### Commit C — Registry cliente + inventário

- `src/game-data/itemIconRegistry.ts` — carrega PNGs de `sprite.iconUrl` (fetch, cache)
- `playHudInventory.ts` — `<canvas>` ou `drawImage` por slot; fallback texto se sem sprite
- Tooltip: nome do catálogo + stats
- `loadItemCatalog()` antes de abrir inventário (já ocorre no boot do Play)

### Commit D — Animações (quando necessário)

- Strip horizontal no calibrador (mesmo contrato que variant strips: `W = N × 32`)
- Player de animação leve só para ícones “vivos” (poções, runas)
- Não misturar com tile registry de mapa

### Commit E — Mundo (opcional)

- Drop no chão: sprite `tiles/items/world/`
- Sincronizar com loot server-side (fora do escopo do HUD)

---

## Regras de `implemented`

| Flag | Significado |
|------|-------------|
| `false` | Cadastro válido (loot de mob, referência em JSON); **sem** ícone obrigatório |
| `true` | PNG calibrado existe; ícone aparece no inventário; equipar/drop permitido na UI |

O servidor pode continuar aplicando bônus de stats mesmo com `implemented: false` (útil para testes); a UI deve esconder ou marcar “sem arte” itens não implementados.

---

## Checklist de validação (pós-pipeline)

- [ ] Criar item no catálogo → calibrador → export PNG 32×32
- [ ] Marcar implementado só após PNG existir
- [ ] Inventário Play mostra ícone, não `itemId`
- [ ] Equipar no PG + ícone no slot de equipamento
- [ ] Loot de mob referencia item com ícone
- [ ] `tiles/items/**` não entra no tile registry de mapa
- [ ] Strip animada (4 frames) roda no slot da mochila
- [ ] `npm test` — validação de catálogo + `implemented` vs arquivo

---

## Relação com outros planos

- [docs/analise-chatgpt.md](analise-chatgpt.md) — HUD inventário (UI pronta; falta sprite)
- [docs/studio-improvements-log.md](studio-improvements-log.md) §33.4 — catálogo atual
- [docs/asset-taxonomy.md](asset-taxonomy.md) — `tiles/maps/items` ≠ ícone de inventário

**Ordem recomendada:** concluir **Commit A → B → C** antes de drag-and-drop, drop no chão ou marketplace.
