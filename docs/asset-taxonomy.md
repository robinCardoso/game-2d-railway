# Taxonomia de assets de mapa

Guia rápido para **onde colocar PNGs**, **quais metadados usar** e **como evitar quebras de mapa** ao adicionar conteúdo novo (paredes, montanhas, decoração).

## O que entra no tile registry

| Pasta | Registry | Uso |
|-------|----------|-----|
| `tiles/maps/**` | Sim | Chão, grama, bordas, natureza, paredes, itens |
| `tiles/effects/**` | **Não** | FX de combate/UI — fetch direto (ex. `target_ring.json`) |
| `tiles/characters/**` | **Não** | Outfits e sprites de criaturas |

Filtro em código: `shouldRegisterTilePath()` em [`src/engine/tileRegistry.ts`](../src/engine/tileRegistry.ts).

## Estrutura de pastas recomendada

```
tiles/maps/
  ground-randon/       → piso base (paletteCategory: ground)
  grass-randon/          → overlay grama (Studio)
  borders/grass_edges/   → auto-borda (assetType: border)
  nature/tree/           → árvores, arbustos (paletteCategory: nature → overlay Y-sort)
  walls/                 → paredes, muros (paletteCategory: walls → overlay Y-sort)
  items/                 → decoração pequena (paletteCategory: items → overlay Y-sort)
  mountains/
    floor/               → piso de montanha (paletteCategory: ground)
    cliff/               → rocha/parede alta (paletteCategory: walls, tileRole: neutral)
    decor/               → pedras, detalhes (paletteCategory: nature)
  water/randon/          → água (paletteCategory: ground)
```

Montanhas **não** exigem categoria nova na engine: piso = `ground`; rochas altas = `walls` ou `nature` na camada de overlay.

## Metadados obrigatórios (`tile_properties.json`)

Chave = **nome do arquivo sem `.png`**.

| Campo | Valores | Função |
|-------|---------|--------|
| `assetType` | `terrain`, `items`, `border` | Comportamento físico / auto-borda |
| `paletteCategory` | `ground`, `nature`, `walls`, `items`, `border` | Aba da paleta + camada ao pintar |
| `tileRole` | `fill`, `border_overlay`, `border_sheet`, `neutral` | Auto-borda ignora `neutral` |
| `walkable` | bool | Colisão |
| `variantGroup` | string | Pincel aleatório 🎲 |

Sprites grandes (64×64 ou mais): incluir `frameWidth`, `frameHeight`, `anchorX`, `anchorY`, `gridCols`, `gridRows`.

### Exemplos (templates — adicione o PNG com o mesmo nome)

**Parede:**

```json
"01_stone_wall": {
  "walkable": false,
  "speedModifier": 1,
  "assetType": "terrain",
  "paletteCategory": "walls",
  "tileRole": "neutral",
  "nameOverride": "01-stone-wall",
  "frameWidth": 32,
  "frameHeight": 64,
  "anchorX": 0,
  "anchorY": -16
}
```

**Piso de montanha:**

```json
"01_mountain_floor": {
  "walkable": true,
  "speedModifier": 1,
  "assetType": "terrain",
  "paletteCategory": "ground",
  "tileRole": "fill",
  "variantGroup": "mountain-floor",
  "nameOverride": "01-mountain-floor"
}
```

**Cliff / rocha (overlay):**

```json
"01_mountain_cliff": {
  "walkable": false,
  "speedModifier": 1,
  "assetType": "terrain",
  "paletteCategory": "walls",
  "tileRole": "neutral",
  "nameOverride": "01-mountain-cliff",
  "frameWidth": 64,
  "frameHeight": 64,
  "anchorX": -16,
  "anchorY": -8
}
```

Salvar PNG em `tiles/maps/walls/`, `tiles/maps/mountains/floor/` ou `mountains/cliff/` conforme o tipo.

## Contrato de mapa (`ref` first)

- Toda célula salva deve ter **`ref`** (fileKey estável).
- **`id` numérico** pode mudar quando PNGs novos entram no registry — não confiar só nele.
- Pincel aleatório (9000–9999) **nunca** persiste no JSON.
- Validação no save: [`validateMapDocument()`](../src/engine/mapDocumentValidation.ts).

Prioridade no load: `ref` da célula → `tileRefs[id].ref` → id legado.

## Checklist ao adicionar sprite

1. PNG em `tiles/maps/<categoria>/` (nunca em `effects/` se for tile de mapa)
2. Entrada em `tile_properties.json` com `paletteCategory` + `assetType` + `walkable`
3. Recarregar tiles no Studio ou F5 no Play
4. Re-salvar mapas afetados (gera `ref` + `tileRefs`)
5. Rodar `npm test` (testes de ref/registry)

Ver também: [`docs/map-format.md`](map-format.md), [`.cursor/rules/studio-map-sprites.mdc`](../.cursor/rules/studio-map-sprites.mdc).
