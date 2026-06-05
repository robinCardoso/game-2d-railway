# Auto-borda — UI, persistência e motor

> **Escopo:** interface do Studio, persistência de conjuntos (`grass_edges`, etc.) e motor de camadas no mapa (`base` + overlay grama + overlay borda).

## Analogia correta (como ler o mapa)

```text
[ pedra ][ pedra ][ pedra ]     ← borda (filete) desenhada AQUI, sobre a pedra
[ pedra ][ GRAMA  ][ GRAMA  ]     ← fill de grama (overlay) AQUI
[ pedra ][ GRAMA  ][ pedra ]
```

- **Grama** = overlay em cima da pedra (a pedra continua embaixo).
- **Filete** = overlay na **célula de pedra vizinha**, não na grama.
- A **máscara** diz de onde vem a grama vizinha (N=1, E=2, S=4, O=8).
- O PNG da máscara tem **preto = transparente** (só o filete aparece sobre a pedra).

Erro comum: confundir **número do slot** (Col 1, Col 2…) com **número da máscara** (1, 2, 4, 8). Use o preset **4 cardinais** no calibrador.

## Regra central

Ao pintar **grama** com auto-borda ligada, **qualquer célula de chão** (pedra, areia, terra, madeira, etc.) **adjacente** à grama recebe a **máscara de borda por cima**, sem apagar o piso de baixo.

- Um único conjunto de máscaras serve para **todos** os pisos — arte de “filete de grama” genérico sobreposto à base.
- **Não existe** na UI campo “vizinho = pedra / areia / água”.

## Modelo de camadas (motor)

| Camada | Conteúdo | Apagada? |
|--------|----------|----------|
| **Base** (`worldMap`) | Qualquer tile de chão (`paletteCategory: ground`) | Não |
| **Overlay fill** (`layers.grassOverlay`) | Grama pintada | Borracha remove só isto |
| **Overlay borda** (`layers.borderOverlay`) | Máscara do conjunto ativo | Recalculada automaticamente |

Persistência no JSON do mapa: campo `layers` com entradas esparsas `{ z, x, y, id }` por camada.

Módulos: `src/engine/mapPaintLayers.ts`, `src/engine/autoBorderEngine.ts`, `src/engine/terrain.ts` (velocidade com overlay grama).

A borda aparece na **célula de chão vizinha** (cardinal N/E/S/O), não na célula de grama.

**Gatilho:** pincel **Grama aleatório** + toggle **Auto-borda** ON.

## Caso de uso (assets atuais)

| Papel | Asset | Grupo |
|-------|--------|--------|
| Pintura | `grama_20_var_variants` → **Grama aleatório** | `grass` |
| Exemplos de chão | `ground_pedra_variants`, futuros areia/terra… | `stone`, etc. |

Conjunto MVP: **`grass_edges`** — label **“Bordas de grama”**.

## Mapa de IDs (UI)

### Criar Sprites — tipo `border_set`

| ID | Exemplo |
|----|---------|
| `#mapSpriteBorderSetIdInput` | `grass_edges` |
| `#mapSpriteBorderSetLabelInput` | `Bordas de grama` |
| `#mapSpriteFillTerrainInput` | `grass` |
| `#mapSpriteBorderCategoryInput` | `terrain/borders/grass_edges` |
| `#saveMapSpriteBorderSetBtn` | Salvar conjunto (stub) |

**Não criar:** ~~`#mapSpriteNeighborTerrainInput`~~

Lista `#mapSpriteServerSelect`: optgroups **Terreno** / **Itens** (sprites editáveis) + **Conjuntos auto-borda** (`GET /api/list-auto-border-sets`). Máscaras e sheet internos do conjunto **não** aparecem na lista de sprites — só o conjunto agregado.

### Calibrador — modo `borderSet`

| ID | Função |
|----|--------|
| `#calibratorBorderSetPanel` | Painel do modo borda |
| `#calBorderSetBadge` | Badge `grama → chão` |
| `#calBorderPreset3x3` / `#calBorderPreset4x4` | **9 vizinhos** (8 slots + centro vazio) / **4 cardinais** |
| `#calBorderCellList` | Máscaras 0–15 + diagonais por célula |
| `#calBorderPreviewCanvas` | Prévia 3×3 (grama isolada + filetes; vermelho = máscara faltando) |
| `#calBorderInnerPreviewCanvas` | Prévia 3×3 das quinas internas L (centro/cardinais = grama; cantos = quinas L L6/L12/L3/L9) |
| `#calBorderPreviewStatus` | Legenda OK / máscaras faltando |
| `#calBorderConfirmBtn` | Confirmar calibração do conjunto |

Módulo: `src/editor/borderSetCalibratorUi.ts`.

### Aba Pin

| ID | Função |
|----|--------|
| `#autoBorderToolbar` | Container |
| `#autoBorderEnabledToggle` | Liga/desliga |
| `#autoBorderSetSelect` | Conjunto ativo |
| `#autoBorderPaintHint` | Hint “qualquer chão vizinho” |
| `#autoBorderRecalcFloorBtn` | Recalcular andar |

### Aba Tile

| ID | Função |
|----|--------|
| `#tileAutoBorderStatusChip` | Ex.: `Auto-borda: Bordas de grama` |

Módulo: `src/editor/autoBorderUi.ts` — carrega conjuntos via `GET /api/list-auto-border-sets`, smart default ao selecionar pincel `grass`.

## Fluxo ADM

1. **Criar Sprites** → tipo **Conjunto auto-borda** → preencher `grass_edges`, fill `grass`.
2. Carregar PNG → **Calibrar grade** → atribuir máscaras 0–15 → **Confirmar conjunto**.
3. **Salvar conjunto** → grava sheet + PNGs por máscara + `public/auto_border_sets.json` + `tile_properties.json`.
4. No mapa: pintar **qualquer chão** como base.
5. **Pin** → Auto-borda ON (ou ligar automaticamente ao escolher Grama 🎲).
6. **Tile** → **Grama aleatório** → pintar.
7. Motor: overlay grama na célula pintada; em todo chão vizinho elegível, overlay borda — sem config extra. Botão **Recalcular andar** refaz o andar atual.

## Detecção de vizinho (motor)

**Cardinais (prioridade):** bits N=1, E=2, S=4, O=8 — pedra com grama em lado reto.

**Diagonais:** se nenhum cardinal encosta na grama, bits NE=16, SE=32, SO=64, NO=128 — pedra só na diagonal da grama (cantos do 3×3).

```text
[ 32 ][  4 ][ 64 ]     ← diagonais + pedra acima da grama
[  2 ][GRAMA][  8 ]
[ 16 ][  1 ][128 ]
```

Cardinais têm prioridade: se a pedra já tem grama em N/E/S/O, usa máscara 1–15 (inclui cantos compostos 3, 9…).

Módulos: `src/engine/borderMaskBits.ts`, `src/engine/autoBorderEngine.ts`.

```text
Para cada célula (x,y) com overlay grama:
  Para cada vizinho cardinal (cx,cy):
    Se célula tem base chão (ground, walkable típico)
    E NÃO tem overlay grama
    → aplicar borderOverlayId do conjunto grass_edges (máscara por bits N/E/S/O)
  Para cada vizinho diagonal (dx,dy) — só se máscara cardinal = 0:
    → máscara 16/32/64/128
```

Sem comparar `variantGroup` stone vs sand — só “é chão” vs “tem grama ao lado”.

## Render em runtime (multi-sprite por célula)

Uma célula de chão pode precisar **mais de um tile de borda** (ex.: corredor O+E, cruz + com 4 quinas L).

| Etapa | Onde | Regra |
|-------|------|--------|
| Recalc (pintura) | `recalculateAutoBorderRegion` | Grava **1** id primário em `borderOverlay`; halo 2 |
| Draw | `collectBorderDrawMasks` → `collectBorderDrawTileIdsCached` | Resolve **todos** os sprites necessários por célula |
| Cache | `borderDrawTileIdsCache` | Invalida em load, undo, reload tiles, recalc regional |
| Grama | `cellHasGrass` | Se overlay grama ≠ vazio → **nunca** desenha borda na célula |

**NÃO REGREDIR:** random só em `resolvePaintTileId`; draw usa ids fixos + cache.

## Performance (Studio)

Ver seção 7 em [studio-improvements-log.md](./studio-improvements-log.md).

Resumo:

- **Viewport culling:** `draw()` itera só `startX..endX` × `startY..endY` (~700 tiles), não 256×256.
- **Andares vazios:** `floorHasVisibleContentInView` pula Z sem conteúdo na tela.
- **Minimap:** rebuild 256×256 só ao carregar/trocar andar/pintar base; ponto do player incremental.
- **Idle FPS:** Studio 30 FPS após 2 s parado; Play (`playApp.ts`) sempre 60 FPS.
- **Debug:** `localStorage debug.perf` → `viewport N/65536 tiles`, `fps 30 (idle)`.

## Fora de escopo (UI atual)

- Aba Borda dedicada no mapa
- Tiles de borda na paleta Tile
- Conjuntos separados por tipo de chão (`grass_stone`, `grass_sand`, …) — backlog

## Ver também

- [ui-menus.md](./ui-menus.md) — mapa de painéis e IDs estáveis
- [studio-improvements-log.md](./studio-improvements-log.md) — histórico de melhorias do Studio
