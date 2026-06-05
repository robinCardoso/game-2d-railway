# UI do editor — menus e painéis

## Comportamento

1. **Menu superior** — ações rápidas e dropdowns (Arquivo, Editar, Ver…).
2. **Pílulas** (Pintar, Tiles, Andar) — abrem o **flyout** lateral; segundo clique fecha.
3. **Flyout** — um painel por vez, ~300px; mapa ocupa o resto da tela.
4. **Barra de status** — posição, Z, speed sempre visíveis (sem abrir painel).
5. **Esc** — fecha flyout.

## Adicionar opção futura

| Tipo | Onde |
|------|------|
| Ação única (export, etc.) | `index.html` → dropdown em Arquivo/Editar |
| Painel com formulário | Nova `<section class="flyout-section" data-panel="meuId">` + `menu-pill` ou item em dropdown com `data-open-panel="meuId"` |
| Menu com 1 só opção | Preferir `menu-pill` direto (ex.: Conta) em vez de dropdown com 1 item |
| Registro de título | `menuBar.ts` → `PANEL_TITLES` |
| Atalho que abre painel | `data-open-panel="meuId"` no botão |

## IDs estáveis (não renomear sem atualizar `main.ts`)

`exportBtn`, `importMapBtn`, `tileSelector`, `floorSelector`, `roleSelector`, `collisionToggle`, `boatToggle`, `posX`…`posZ`, dev buttons.

## Criar Sprites (mapa)

Painel **Criar Sprites** (`data-panel="mapSprites"` ou equivalente no `studio.html`):

| Elemento | ID | Função |
|----------|-----|--------|
| Lista de sprites | `#mapSpriteServerSelect` | Só PNGs em `tiles/maps/**` (API) |
| Excluir | `#deleteMapSpriteBtn` | Sprite ou conjunto auto-borda selecionado — verifica uso nos mapas antes de remover |
| Calibrador | aberto via painel | Multi-select, export strip, grade inferida |

Paleta **Tileset** (`#tileSelector`) lista **todos** os PNGs em `tiles/**` — escopo diferente do seletor acima.

Documentação: [sprite-exporter-walkthrough.md](./sprite-exporter-walkthrough.md), [studio-improvements-log.md](./studio-improvements-log.md).

### Conjunto auto-borda (`border_set`)

Tipo de asset em **Criar Sprites** para máscaras genéricas de borda (overlay sobre chão vizinho). **Não** há campo “terreno vizinho” — um conjunto serve para qualquer piso adjacente.

| Elemento | ID | Função |
|----------|-----|--------|
| Bloco do formulário | `#mapSpriteBorderSetBlock` | Visível só quando tipo = `border_set` |
| ID do conjunto | `#mapSpriteBorderSetIdInput` | Ex.: `grass_edges` |
| Nome exibido | `#mapSpriteBorderSetLabelInput` | Ex.: `Bordas de grama` |
| Terreno pintado (fill) | `#mapSpriteFillTerrainInput` | Liga ao pincel 🎲 (ex.: `grass`) |
| Pasta destino | `#mapSpriteBorderCategoryInput` | Ex.: `terrain/borders/grass_edges` |
| Salvar | `#saveMapSpriteBorderSetBtn` | `POST /api/save-border-set` |

Calibrador em modo `borderSet`: badge **grama → chão**, presets 3×3/4×4, `#calBorderCellList` (máscaras 0–15), `#calBorderConfirmBtn`.

Documentação completa: [auto-border.md](./auto-border.md).

## Auto-borda no mapa (aba Pin / Tile)

Toolbar na aba **Pin** (`#autoBorderToolbar`):

| Elemento | ID | Função |
|----------|-----|--------|
| Toggle | `#autoBorderEnabledToggle` | Liga/desliga auto-borda |
| Conjunto | `#autoBorderSetSelect` | Conjuntos com `fillTerrain: grass` (MVP mock: `grass_edges`) |
| Hint | `#autoBorderPaintHint` | Copy “qualquer chão vizinho” |
| Recalcular | `#autoBorderRecalcFloorBtn` | Disabled até motor existir |

Aba **Tile**: chip `#tileAutoBorderStatusChip` quando Grama 🎲 + toggle ON.

JS: `src/editor/autoBorderUi.ts` — `initAutoBorderUi()`, smart default ao selecionar pincel `grass`.

## Player vs GM

Elementos com `data-requires-edit="true"` somem quando cargo = Player (`setEditorMenusVisible`).
