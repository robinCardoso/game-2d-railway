# Log de melhorias do Studio (mapa + sprites)

Documento de referência para humanos e agentes IA. **Atualizar este arquivo** quando mudar calibrador, registry, carregamento de mapas ou APIs de sprite.

Última revisão: **2026-06-05**

---

## Resumo executivo

| Área | Problema que existia | Solução implementada |
|------|----------------------|----------------------|
| Calibrador multi-select | Clique não selecionava frames | `click` dedicado; drag off em multi-select; cleanup listeners |
| Calibrador ao editar | Grade 1×1 / 64px default | `mapSpriteCalibration.ts` + inferência ao carregar sprite |
| Mapa diferente a cada F5 | IDs instáveis + race no registry | Registry determinístico + resolução por `ref` |
| Random no mapa salvo | Confusão random vs render | Random **só** em `resolvePaintTileId`; mapa guarda ids fixos |
| Variantes soltas na paleta | Strip sem `variantGroup` | `inferVariantGroupForStrip()` + export inferido |
| Exclusão de sprites | Só existia em `dist/` | UI 🗑️ + `sprite-usage` + `delete-map-sprite` no source |
| Metadados órfãos | `01_grama_randon` vs `01_grama.png` | Chave JSON = filename do PNG |
| **Save sem camadas** | JSON só tinha `tiles` + `spawn` | `formatMapDocumentJson` inclui `layers.grass` / `layers.border` / `layers.items` |
| **Auto-borda visual** | Filetes errados, cantos L, cruz (+) | `borderMaskBits.ts` + `collectBorderDrawMasks()` multi-sprite |
| **CPU alto (Studio)** | Bordas recalculadas todo frame; minimap 256×256×60 | Cache de draw, culling viewport, minimap lazy, 30 FPS idle |
| **UX de Exportação** | Perda de dados (stripping), botões redundantes, campos vazios | `resolveStripBaseName` ajustado, inputs obrigatórios, botões contextuais no calibrador |
| **Borracha do Mapa** | Borracha não limpava piso base quando havia grama (comportamento de dois passos impedido por drag culling) | Remoção do `continue` em `eraseTileAt`, limpando grama, base e borda de uma só vez |
| **Quinas Internas (L)** | Visualização das quinas L em faixa plana 4x1 sem indicação espacial de onde ficava a grama | Alteração para uma grade 3x3 simétrica e intuitiva (cantos de pedra, centro/cardinais de grama) |
| **Movimentação de Sprites** | Trocar categoria/subpasta de um sprite existente não movia a imagem física `.png` de lugar no servidor | API detecta URL local no `spriteBase64` e move/copia o arquivo físico automaticamente no backend |
| **Fatiamento Customizado** | O motor de jogo ignorava offsets (`offsetX`, `offsetY`, `gap`) ao fatiar variant strips horizontais/verticais | `tileRegistry.ts` aprimorado para respeitar os offsets e tamanhos customizados de `tile_properties.json` |
| **Auto-borda Dinâmico** | O sistema só ativava auto-borda para o grupo de variação estático `grass` | `autoBorderUi.ts` busca dinamicamente conjuntos cujo `fillTerrain` corresponda ao `variantGroup` selecionado |
| **Terrenos/Grupos Dropdowns** | Campos de texto para `fillTerrain` e `variantGroup` propícios a erros de digitação e esquecimentos | Substituídos por `<select>` dinâmicos com opção de escolher existentes ou criar novos grupos na hora |
| **Play auto-borda errada** | `playApp.ts` usava `grass_edges` / `grass` fixos; mapas com `terra_edges` e grupos `*-grass-random` renderizavam filetes quebrados na base | `playBorderConfig.ts` carrega manifest; `isMapBorderTile` ignora bordas na camada base; `isGrassTile` reconhece grupos `*-grass-random` |
| **Studio preso em “CARREGANDO…” (dev)** | Proxy Vite `/tiles` → Express devolvia 404 em `?import` / `?url` (`import.meta.glob`, JSON) | Plugin `tilesDevPlugin` no Vite serve `tiles/` localmente; proxy só `/api` e `/health` |
| **Play sem mapa (canvas vazio)** | `playApp` só conhecia 3 mapas em `DEFAULT_GAME_DATA.maps`; custom (`meu_mapa`, etc.) ignorados | Play usa `MAP_REGISTRY` + `hydrateRegistryFromPublicMapFiles()` como o Studio |
| **Play spawn em área vazia** | Personagem em `10,10` (default) mas Rookgaard tem tiles só ~33–50; mapa “carregava” mas canvas preto | `resolveEffectiveSpawn()` + `game.config` start `50,50`; módulo compartilhado `src/world/worldBoot.ts` |

---

## Módulos e arquivos-chave

```
src/engine/config.ts              TILE_SIZE = 32, getAllFloorZs()
src/engine/tileRegistry.ts        buildTileRegistryAsync (ordem path)
src/engine/tileRefResolver.ts     resolveMapTileId, remapWorldMapTileIds
src/engine/tileVariants.ts        resolvePaintTileId (só pintura)
src/engine/worldMap.ts            loadMapFromJson(..., tileRegistry?)
src/engine/mapDocumentFormat.ts   serialize + format JSON (inclui layers)
src/engine/mapPaintLayers.ts      grassOverlay, borderOverlay (LayerMap)
src/engine/borderMaskBits.ts      bits cardinais + diagonais + quinas L
src/engine/autoBorderEngine.ts    recalc regional, collectBorderDraw*, cache
src/main.ts                       loop Studio, paint, draw, perf, idle FPS
src/game/playApp.ts               loop Play (60 FPS, cache de bordas)
src/editor/mapSpriteCalibration.ts inferMapSpriteCalibration
src/editor/mapSpriteEditor.ts     calibrador, exclusão, sync calibração
src/editor/autoBorderUi.ts        toggle Pin, recalcular andar
src/editor/borderSetCalibratorUi.ts calibrador conjunto grass_edges
src/editor/characterCalibratorModal.ts  modo mapa, multi-select
src/editor/mapSpriteBatchExport.ts export strip + grupo inferido
vite.config.ts                    APIs list/usage/delete/save sprites
tiles/tile_properties.json        metadados por filename
public/tile_variant_groups.json   labels preview 🎲
public/auto_border_sets.json      conjuntos MVP (grass_edges)
docs/auto-border.md               motor + UI auto-borda
```

---

## 1. Calibrador (modo mapa)

### Multi-seleção
- Checkbox `#calMapMultiSelectToggle` resetado ao abrir modal.
- Seleção via `click` no canvas (não depender só de mouseup sem drag).
- Arraste de margem desativado quando multi-select ativo.
- Listeners removidos com `AbortController` ao fechar.

### Grade ao editar sprite existente
- `inferMapSpriteCalibration(imageW, imageH, hints)` — strip 128×32 → 4×1 frames 32px.
- Campos do painel + `initialGridCols/Rows` passados ao calibrador.
- Persistência opcional em `tile_properties`: `frameWidth`, `gridCols`, `sheetLayout`, etc.

---

## 2. Carregamento de mapas (estabilidade)

### Causa raiz do “mapa mudava a cada refresh”
1. IDs numéricos atribuídos na ordem de `img.onload` (não determinística).
2. Loader usava só `id` do JSON, ignorando `ref` / `tileRefs`.
3. Mapa podia carregar antes do registry terminar.

### Correções
```text
tileRegistryReady (await) → bootstrapApp → loadMapFile(..., TILE_TYPES)
loadMapFromJson → deserializeMapDocument(..., registry)
  → resolveTilesByFloor (ref por célula)
  → remapWorldMapTileIds (fallback tileRefs)
reloadTileRegistry → snapshot com refs → remapear worldMap
```

### Regras
- **Salvar mapa:** sempre enriquecer com `ref` (`enrichTilesWithRefs`).
- **Carregar mapa:** sempre passar registry atual para resolver refs.
- **Pintar:** `resolvePaintTileId` sorteia; célula salva id fixo da variante escolhida.

---

## 3. Variant strips e pincel 🎲

### Um PNG, N tiles no registry
- Export “Exportar selecionados” → **1 PNG** horizontal (`N × 32` px).
- Registry expande em N entradas (`fileKey`: `nome#0` … `#N-1`).

### Pincel aleatório (9000–9999)
- Criado por `attachVariantBrushes()` quando ≥2 tiles com mesmo `variantGroup`.
- Existe só na paleta do editor; **nunca** no JSON do mapa.

### Fail-safe de grupo
- Sem `variantGroup` no JSON → inferir de filename (`ground_pedra_variants` → `stone`).
- Export batch com “Sem grupo” ainda grava grupo inferido quando possível.

---

## 4. Exclusão segura de sprites

### UI
- `#deleteMapSpriteBtn` no painel **Criar Sprites** (visível ao selecionar sprite na lista).

### Fluxo
1. `GET /api/sprite-usage?filename=`
2. Se `totalCells > 0` → bloquear com lista de mapas
3. `DELETE /api/delete-map-sprite?filename=&category=&force=false`
4. Remove PNG, `tile_properties`, ajusta `tile_variant_groups.json`
5. `reloadTileRegistry()` + refresh paleta

### Pendente / backlog
- `force=true` + substituição de refs nos mapas (migração automática)

---

## 5. Paleta Tileset vs seletor Criar Sprites

| | Tileset `#tileSelector` | `#mapSpriteServerSelect` |
|--|-------------------------|---------------------------|
| Fonte | Glob `tiles/**/*.png` | API `/api/list-map-sprites` |
| Pastas | Todo `tiles/` | Só `tiles/maps/` |
| Edição | Pintar mapa | CRUD sprite + calibrador |

Mesmo PNG em `tiles/maps/grass/01_grama.png` aparece nos dois (nomes podem diferir capitalização).

---

## 6. Melhorias relacionadas (sessões anteriores)

- Editor unificado Personagem/NPC/Mob (`spriteSheetEditor.ts`)
- Spawn com `TILE_SIZE` correto (`entity.ts`, `spriteDraw.ts`)
- MapDocument esparso v1 — ver `docs/map-format.md`

---

## 7. Auto-borda + camadas + performance (2026-06-02)

Sessão de estabilização do motor `grass_edges`, persistência de camadas e otimização de CPU no Studio.

### 7.1 Modelo de camadas (runtime)

| Camada | Variável em `main.ts` | JSON (`layers`) |
|--------|----------------------|-----------------|
| Base | `worldMap` | `tiles` |
| Grama (overlay) | `grassOverlayMap` | `layers.grass` |
| Borda (overlay) | `borderOverlayMap` | `layers.border` (opcional; pode ser 0 células se só render dinâmico) |

- **Pintura grama + auto-borda ON:** grama vai para `grassOverlay`; base (pedra) **não** é apagada.
- **Borracha:** remove grama do overlay primeiro; base intacta.
- **Random 🎲:** só em `resolvePaintTileId` ao pintar; mapa salvo guarda id fixo da variante.

### 7.2 Save de mapas — bug corrigido

**Problema:** `formatMapDocumentJson` / `buildMapDocumentExportView` omitiam `layers` → save devolvia só `tiles` + `spawn`.

**Arquivo:** `src/engine/mapDocumentFormat.ts`

**Regra:** export deve incluir `layers.grass` e `layers.border` quando não vazios. Undo/histórico em `main.ts` já usava snapshot das três camadas (`getMapPaintSnapshot`).

### 7.3 Motor de borda (`autoBorderEngine.ts`, `borderMaskBits.ts`)

| Função | Papel |
|--------|--------|
| `cellHasGrass()` | Qualquer tile no overlay grama conta como grama (nunca desenhar borda por cima) |
| `collectBorderDrawMasks()` | Decompõe máscaras multi-sprite: cruz (+), quinas L (3/6/9/12), T-junctions, pares O+E / N+S, diagonais |
| `collectBorderDrawTileIds()` | Resolve máscaras → ids do registry; fallback `borderOverlay` |
| `recalculateAutoBorderRegion()` | Halo 2; pula células com grama no overlay; invalida cache regional |
| `collectBorderDrawTileIdsCached()` | Cache por célula até invalidação |
| `invalidateBorderDrawCache()` | Map load, undo, reload tiles |
| `invalidateBorderDrawCacheRegion()` | Após recalc regional |

**Render:** filete na **célula de chão vizinha**, não na grama. Corredor O+E / N+S desenha **dois filetes** na mesma célula quando necessário.

**Calibrador:** presets 9 vizinhos + 4 cardinais + botão quinas L — ver `docs/auto-border.md`.

### 7.4 Pintura — performance ao arrastar pincel

**Arquivo:** `src/main.ts`

- `deferBorderRecalc` + `mergePendingBorderRecalc` durante traço de pincel/lápis.
- `flushPendingBorderRecalc()` no **mouseup** (1 recálculo por traço, não por célula).
- `lastPaintCellKey` evita repintar mesma célula no drag.
- `expandAutoBorderRecalcBounds()` inclui vizinhos ortogonais de grama recém-pintada.

### 7.5 Render — viewport culling (não desenha 256×256 todo frame)

**Arquivo:** `src/main.ts` — função `draw()`

```text
computeViewportTileBounds(camX, camY, zoom) → startX..endX, startY..endY
getAllFloorZs().forEach(z):
  floorHasVisibleContentInView(z, ...) → pula andares vazios na viewport
  for y in startY..endY, x in startX..endX → desenha só células visíveis
```

Mapa 256×256 fica **na RAM**; por frame desenha ~700–1400 células (depende do zoom), não 65536.

`buildBorderMaskTileIndex()` — **1× por frame** (fora do loop de andares).

### 7.6 Minimap lazy

**Arquivo:** `src/main.ts` — `drawMinimap()`

- Fundo 256×256 só quando `markMinimapDirty()` (load, resize, pintura na base do andar atual).
- Ponto do jogador atualizado só quando tile muda.
- Parado: ~0 ms no `[Perf]`.

### 7.7 Studio idle FPS (30 FPS parado)

**Arquivo:** `src/main.ts` — **somente Studio**; `playApp.ts` permanece 60 FPS.

| Condição | FPS |
|----------|-----|
| Sem input por 2 s, aba Mapa/Tileset | 30 |
| Mouse, teclado, pintura, pan | 60 |
| Abas Portais / Spawns (pulse) | 60 |
| WASD, animação personagem, preview linha/retângulo | 60 |

Funções: `markStudioActivity()`, `studioNeedsContinuousAnimation()`, `getStudioFrameIntervalMs()`.

### 7.8 Flags de debug (dev only)

| Flag | Ativação | Efeito |
|------|----------|--------|
| `debug.perf` | `localStorage.setItem('debug.perf','1')` | `[Perf] draw ms | viewport N/65536 | fps 30/60 | …` |
| `debug.paint` | `localStorage.setItem('debug.paint','1')` | `[PaintDebug]` + `console.table` por célula (**pesado** ao pintar) |
| `debug.map.save` | `localStorage.setItem('debug.map.save','1')` | `[MapSaveDebug]` contagens base/grass/border |
| `debug.movement` | `localStorage.setItem('debug.movement','1')` | Log PLAYER tile / walkable a cada 2 s |

Desligar: `localStorage.removeItem('debug.perf')` (idem para as outras).

### 7.9 Arquivos alterados nesta sessão (referência)

| Arquivo | Mudanças principais |
|---------|---------------------|
| `src/engine/mapDocumentFormat.ts` | Export/import `layers` no JSON formatado |
| `src/engine/borderMaskBits.ts` | Bits diagonais, quinas L, `resolveBorderMaskForRegistry` |
| `src/engine/autoBorderEngine.ts` | `collectBorderDrawMasks`, cache, invalidação regional |
| `src/engine/mapPaintLayers.ts` | (existente) get/set/clear LayerMap |
| `src/main.ts` | draw culling, cache bordas, minimap, idle FPS, paint defer, perf stats |
| `src/game/playApp.ts` | `collectBorderDrawTileIdsCached`, invalidate no load |
| `src/editor/autoBorderUi.ts` | Toggle Pin, recalcular andar |
| `src/editor/borderSetCalibratorUi.ts` | Presets calibrador borda |
| `docs/auto-border.md` | Motor + UI |
| `docs/studio-improvements-log.md` | Este log |
| `.cursor/rules/studio-map-sprites.mdc` | Invariantes auto-borda + performance |
| `AGENTS.md` | Resumo invariantes |

---

## 8. UX de Exportação de Sprites (2026-06-03)

Sessão dedicada à resolução de problemas de usabilidade que causavam perda de dados e sobrescrita indevida de arquivos durante a calibração e exportação em lote de sprites de mapa.

### 8.1 Preservação do Prefixo do Nome
**Arquivo:** `src/editor/mapSpriteBatchExport.ts`

- A função `resolveStripBaseName` foi ajustada para parar de remover agressivamente números do início e do final do prefixo do sprite (ex: `03-ground-pedra`).
- Isso evita que o sistema reverta o prefixo para valores padrão genéricos (como `ground_pedra`), o que levava à criação de sprites duplicados (ex: `ground_pedra_01.png` apagando outro sprite existente). O prefixo digitado no painel principal agora é passado integralmente para o modal de exportação.

### 8.2 Validação de Campos Obrigatórios
**Arquivo:** `src/editor/mapSpriteBatchExport.ts`

- Os campos **Prefixo do Nome** (`prefixInput`) e **Subpasta/Categoria** (`categoryInput`) tornaram-se obrigatórios na exportação em lote.
- Foi implementada uma validação ao clicar em "Confirmar" que bloqueia a exportação e notifica o usuário via *toast*, focando o campo vazio, evitando que sprites sejam gerados em caminhos incorretos.

### 8.3 Redundância Visual e Lógica de Botões
**Arquivo:** `src/editor/characterCalibratorModal.ts`

- **Modo Seleção Múltipla:** O botão genérico "Confirmar" foi ocultado na UI, deixando apenas o botão "✅ Exportar selecionados" visível. Isso força o fluxo direto para a exportação e evita confusão.
- **Modo Seleção Única:** O botão "✅ Exportar selecionados" foi ocultado, deixando clara a intenção do botão "Confirmar" de retornar a seleção única (1 frame) para a interface do painel principal para ajustes manuais antes do salvamento em lote.

---

## 9. Testes manuais de regressão

### Sprites e mapas (base)

1. **F5 no Studio** — mapa salvo idêntico (mesmas refs visuais).
2. **Calibrador** — strip 128×32 abre como 4×1, multi-select alterna tiles verdes.
3. **Pintar 🎲** — salvar, F5 — células não mudam aleatoriamente.
4. **Excluir sprite** — bloqueio se usado em `public/maps/*.json`.
5. **Paleta** — strip sem grupo vira 🎲 (≥2 frames), não tiles soltos.
6. **Criar Sprites** — selecionar existente preenche 32×32 e grade correta.

### Auto-borda + performance (2026-06)

7. **Save layers** — `public/maps/meu_mapa.json` contém `layers.grass` após pintar grama; F5 restaura overlay.
8. **Formas irregulares** — grama sobre pedra; filetes nos vizinhos; quinas L e cruz (+) corretas.
9. **Pintura rápida** — arrastar pincel grama: 1 recálculo no mouseup (sem lag de toast por célula).
10. **Parado** — `debug.perf`: `viewport ~700/65536`, `fps 30 (idle)` após 2 s; draw &lt; 4 ms.
11. **Interagir** — mover câmera/teclado: `fps 60` imediato.
12. **Play mode** — `play.html` sempre 60 FPS; bordas visuais iguais ao Studio.
13. **Random no draw** — nunca: bordas vêm de cache/recalc, não de `Math.random` em `draw()`.

---

## 10. Borracha do Mapa (2026-06-04)

### Limpeza Multi-Camadas em Passo Único
- **Arquivo:** `src/main.ts`
- **Problema:** A borracha em células com overlay de grama apenas limpava a grama e pulava o piso base e as bordas. Por causa do culling de traço (`lastPaintCellKey`), isso impedia o usuário de limpar a célula completa em um único movimento de arrastar.
- **Solução:** Removida a instrução `continue` em `eraseTileAt`, permitindo que a remoção do overlay de grama prossiga e também apague o piso base (`worldMap`) e a borda correspondente.

---

## 11. Calibrador de Quinas Internas (L) (2026-06-04)

### Grade 3x3 Intuitiva para Quinas L
- **Arquivos:** `src/editor/borderSetPreview.ts`, `studio.html`, `src/style.css`
- **Problema:** A visualização horizontal em 4x1 das quinas internas (L) não dava ao usuário referência espacial de onde a grama ficava em relação à pedra, dificultando calibrar o PNG correto.
- **Solução:** O preview de quinas L foi transformado em uma grade 3x3 simétrica ao preview de bordas retas. O centro e as posições cardinais (N, E, S, O) são renderizados como grama, e os cantos representam as quinas L (L6 no NW, L12 no NE, L3 no SW, L9 no SE). A área do canvas foi redimensionada e ajustada no CSS.

---

## 12. Movimentação Automática de Categoria/Subpasta (2026-06-04)

### Organização Dinâmica de Pastas no Servidor
- **Arquivo:** `vite.config.ts` (API `/api/save-map-sprite`)
- **Problema:** Ao carregar um sprite existente para edição, o navegador carrega a imagem via URL absoluta do servidor. Se o usuário alterasse o campo "Subpasta em tiles/maps" e salvasse, a imagem física `.png` permanecia na pasta antiga, pois o backend esperava apenas dados de imagem em formato Base64 para gravar no disco. Com isso, a alteração de categoria não era efetivada de verdade na estrutura de pastas.
- **Solução:** Aprimorada a API `/api/save-map-sprite` para verificar se `spriteBase64` é uma URL local que contenha `/tiles/`. Se for e o caminho de destino (`targetDir`) for diferente do caminho de origem do arquivo, o servidor automaticamente faz a cópia do arquivo físico para a nova pasta de destino e apaga o arquivo antigo de forma segura.

---

## 13. Suporte a Fatiamento Customizado no Motor (2026-06-04)

### Suporte a offsetX, offsetY, gapX, gapY e frameWidth/Height no TileRegistry
- **Arquivo:** `src/engine/tileRegistry.ts`
- **Problema:** O registrador de tiles (`registerVariantStrip` e `inferVariantStripFrameCount`) ignorava as propriedades de calibração customizada (como `offsetX`, `offsetY`, `gapX`, `gapY`, `frameWidth`, `frameHeight` e `sheetLayout`) ao carregar e fatiar o PNG. Ele assumia por padrão que a imagem sempre começava em `x = 0` com blocos contíguos de `TILE_SIZE` (32px). Quando um sprite possuía um offset inicial (como 32px de espaço vazio no início de `01_grama_variants.png`), os tiles ficavam desalinhados no mapa e na paleta (mostrando linhas verticais ou tiles cortados).
- **Solução:** Modificado o registrador para respeitar as propriedades do arquivo `tile_properties.json`. Se `variantStripFrames` estiver configurado, ele assume este valor explicitamente em vez da contagem automática da largura da imagem. O cálculo do `sourceRect` de cada frame agora leva em conta os valores de offset (`offsetX`, `offsetY`), espaçamento (`gapX`, `gapY`), dimensões customizadas e layout de folha (vertical/horizontal).

---

## 14. Vínculo Dinâmico de Auto-borda por Grupo (2026-06-04)

### Seleção Automática do Conjunto ao Selecionar Pincel 🎲
- **Arquivo:** `src/editor/autoBorderUi.ts`
- **Problema:** A seleção de pincéis de grama ativava o auto-borda de forma estática, vinculando-se unicamente ao grupo `"grass"`. Ao criar novos terrenos personalizados com outros nomes de grupo de variação (como `01-grass-random`), o Studio não selecionava automaticamente o conjunto de bordas correto, exigindo que o usuário alternasse manualmente na aba Pin.
- **Solução:** Modificada a função `onMapEditorTileSelectionChanged` para buscar dinamicamente na lista de conjuntos de borda carregados se existe algum cujo campo `fillTerrain` seja idêntico ao `variantGroup` do pincel selecionado. Se encontrar, ele ativa o auto-borda e seleciona o conjunto correspondente imediatamente.

---

## 15. Seleção Dinâmica de Terrenos e Grupos por Dropdown (2026-06-04)

### Substituição de Campos de Texto por Dropdowns (Select)
- **Arquivos:** `studio.html`, `src/editor/mapSpriteEditor.ts`
- **Problema:** Ao criar um conjunto de auto-borda ou calibrar um novo sprite de terreno, o usuário precisava digitar manualmente o nome do grupo de variação (como `01-grass-random`). Esse fluxo gerava ambiguidades, erros de digitação e esquecimento de termos, impedindo a engine e o auto-borda de funcionarem corretamente.
- **Solução:**
  1. O campo **Terreno pintado (fill)** do conjunto auto-borda foi substituído por um `<select>` nativo dinâmico.
  2. O campo **Grupo de variação (opcional)** do terreno também foi substituído por um `<select>` nativo dinâmico. Se o usuário escolher `-- Sem grupo --`, o sprite é salvo como estático. Se escolher um grupo existente, é agrupado com ele. Se escolher a opção `+ Novo Grupo...`, um campo de texto surge na hora permitindo que ele digite o nome do novo grupo personalizado.

---

## 16. Suporte a Sprites Grandes e Camada de Natureza / Itens (2026-06-04)

### Renderização em Duas Passadas (Depth / Sorting) e Calibração de Sprites Grandes
- **Arquivos:** `src/main.ts`, `src/game/playApp.ts`, `src/engine/tileDraw.ts`, `src/engine/collision.ts`, `src/editor/mapSpriteEditor.ts`, `src/editor/mapSpriteBatchExport.ts`, `src/engine/mapPaintLayers.ts`
- **Problema:** 
  1. Ao calibrar sprites maiores que 32x32px (como árvores de 64x64px), o sistema tentava redimensioná-los ou desenhá-los de maneira desalinhada.
  2. Ao desenhar o mapa, o motor renderizava o chão, gramas, bordas e decorações de cada célula no mesmo loop. Isso fazia com que o chão desenhado nas células à direita (ex: `x+1`) passasse por cima e cortasse verticalmente a metade direita de sprites grandes desenhados na célula anterior `x`.
  3. Colocar uma árvore ou pedra no mapa apagava/substituía o chão de grama por baixo dela, pois tudo ficava na camada base.
- **Solução:**
  1. **Calibrador Visual & Batch Export:** Permite ao usuário escolher se deseja manter o tamanho original ou redimensionar para 32x32px ao salvar sprites maiores. As propriedades `frameWidth` e `frameHeight` são salvas no catálogo de metadados.
  2. **Renderização com âncora (`tileDraw.ts`):** O motor calcula o tamanho real do frame e posiciona via `getSpriteTilePlacement` (centro horizontal + base no tile). Sprites 64×64 usam `anchorX` / `anchorY` em `tile_properties.json` para alinhar o pé ao centro inferior da célula (ver §21).
  3. **Camada de Sobreposição de Itens (`items`):** Adicionada a camada `itemsOverlayMap` (serializada no JSON do mapa como `layers.items`). Tiles da paleta nas abas `NATUREZA`, `PAREDES` e `ITENS` são pintados automaticamente nesta camada, preservando o chão original intacto por baixo. A borracha (Eraser) remove primeiro a decoração na camada superior e, num segundo clique, o chão base.
  4. **Renderização em passadas (evoluída em §22):** Passo 1 desenha chão/grama/bordas; Passo 2 usa Y-sorting para itens e entidades (ver §22).
  5. **Combinação de Colisões (`collision.ts`):** A lógica de colisão (`queryWalkable`) mescla as propriedades físicas do chão base e do item de sobreposição. Se uma árvore for não caminhável, o personagem colide com sua célula base, mesmo que haja grama caminhável abaixo.

---

## 17. Referências

- [auto-border.md](./auto-border.md) — motor, UI, máscaras
- [sprite-exporter-walkthrough.md](./sprite-exporter-walkthrough.md)
- [map-format.md](./map-format.md) — `layers`, `ref`, tileRefs
- [architecture.md](./architecture.md)
- Regra Cursor: `.cursor/rules/studio-map-sprites.mdc`
- AGENTS.md — guia para agentes IA

---

## 18. Centralização de Mapas e Portais no Game Data (2026-06-04)

### Desacoplamento e Centralização da Camada de Configuração de Dados
- **Arquivos:** `src/game-data/default/maps.ts`, `src/game-data/default/portals.ts`, `src/game-data/default/index.ts`, `src/game/playApp.ts`
- **Problema:** A configuração de mapas e as posições de portais estáticos do mundo do jogo estavam acopladas no motor do jogo e nos JSONs dos mapas do client.
- **Solução:**
  1. **Commit 1:** Criado `maps.ts` definindo `MAPS: GameMapConfig[]` centralizadamente na camada de Game Data e substituído o `MAP_REGISTRY` no runtime do client por `DEFAULT_GAME_DATA.maps`.
  2. **Commit 2:** Criado `portals.ts` definindo `PORTALS: GamePortalConfig[]` no Game Data. Removida a variável `worldPortals` in `playApp.ts` e implementado o helper `getPortalAt(mapId, position)` para buscar portais dinamicamente da fonte de dados estática `DEFAULT_GAME_DATA.portals`.

---

## 19. Sistema de Customização de Personagens e Calibração de Âncora (2026-06-04)

### 19.1 Animated Preview e Outfit Presets
- **Arquivos:** [create.ts](file:///c:/Users/Robson/source/game-2d/src/characters/create.ts), [characters-new.html](file:///c:/Users/Robson/source/game-2d/characters-new.html), [loadOutfitPresets.ts](file:///c:/Users/Robson/source/game-2d/src/game-data/default/loadOutfitPresets.ts)
- **Problema:** A criação de personagem usava um dropdown de presets simplista que renderizava o spritesheet PNG inteiro de forma estática com fundo magenta.
- **Solução:** Substituída a visualização estática por um `<canvas id="presetPreviewCanvas">` de 128x128. O script carrega a configuração JSON do outfit selecionado, lê a animação `walk_down` (ou `idle_down` como fallback), aplica Chroma Key em tempo real para remover o magenta, e renderiza o personagem caminhando para o sul em loop. A tag `<img>` antiga e quebrada foi removida do HTML.

### 19.2 Sincronização e Carga Dinâmica de Sprite Config
- **Arquivos:** [characterStore.ts](file:///c:/Users/Robson/source/game-2d/src/shared/characterStore.ts), [mockAuth.ts](file:///c:/Users/Robson/source/game-2d/src/shared/mockAuth.ts), [playApp.ts](file:///c:/Users/Robson/source/game-2d/src/game/playApp.ts)
- **Problema:** Ao criar um personagem, o sistema gravava as configurações do outfit com dimensões padrões genéricas de 64x64 sem Chroma Key. Isso fazia o jogo em `/play.html` renderizar o spritesheet inteiro em cima do mapa com fundo rosa. Além disso, se o desenvolvedor atualizasse a calibração de um visual no arquivo JSON do servidor, as modificações não se refletiam nos personagens já criados.
- **Solução:**
  1. Durante a criação, `createCharacter` e `mockCreateCharacter` fazem fetch do arquivo JSON oficial do outfit e persistem suas propriedades corretas de fatiamento no banco/localStorage.
  2. No loop de inicialização do jogo (`startPlay` em `playApp.ts`), a engine faz fetch e mescla a configuração oficial do arquivo JSON em tempo real sobre as configurações salvas do personagem, garantindo que atualizações de spritesheet e âncoras se refletiam instantaneamente para todos os jogadores.

### 19.3 Preview de Roster em Canvas
- **Arquivo:** [roster.ts](file:///c:/Users/Robson/source/game-2d/src/characters/roster.ts)
- **Problema:** A listagem de personagens no menu principal (`characters.html`) exibia o spritesheet de textura inteiro com o fundo magenta nas cartas de escolha do personagem.
- **Solução:** Substituída a renderização por um `<canvas>` de 64x64 por card. A função `drawCharacterPreview` carrega as configurações da spritesheet, faz o fatiamento correto do frame virado para o sul (idle/walk down), remove o fundo magenta via Chroma Key e renderiza a pixel-art perfeita e limpa do aventureiro.

### 19.4 Calibrador de Âncoras com Guia Visual (Studio)
- **Arquivo:** [spriteSheetEditor.ts](file:///c:/Users/Robson/source/game-2d/src/editor/spriteSheetEditor.ts)
- **Problema:** O editor de fichas de personagens permitia preencher os campos `Ajuste Âncora X` e `Y` mas não dava nenhum feedback visual das alterações. O boneco ficava oculto no mapa do editor (por causa de `hidePlayerSprite: true` no boot) e o canvas de preview lateral apenas esticava o frame cobrindo a área toda, sem aplicar as âncoras.
- **Solução:** O loop `drawPreviewLoop` do preview lateral de animação do editor foi aprimorado. Agora ele desenha uma célula guia azul tracejada de 32x32px (escalada) representando o bloco de colisão, uma mira (cruz) vermelha representando o ponto de âncora padrão dos pés do personagem, e desenha o sprite aplicando os valores de `anchorX` e `anchorY` em tempo real. Isso permite ao usuário ver o sprite deslizar e calibrar visualmente até os pés tocarem a mira de forma exata.

---

## 20. Play — auto-borda alinhada ao Studio (2026-06-05)

### 20.1 Config dinâmica de conjunto auto-borda
- **Arquivos:** `src/game/playBorderConfig.ts`, `src/game/playApp.ts`
- **Problema:** O Play usava `borderSetId: 'grass_edges'` e `fillTerrain: 'grass'` hardcoded, enquanto o manifest (`public/auto_border_sets.json`) e os tiles reais usam `terra_edges` / `02-grass-random`.
- **Solução:** `loadPlayBorderConfig()` busca `/api/list-auto-border-sets` (mesma fonte do Studio) antes de carregar o mapa; fallback `terra_edges` + `02-grass-random`.

### 20.2 Bordas não desenham na camada base
- **Arquivos:** `src/engine/tileDraw.ts` (`isMapBorderTile`), `src/game/playApp.ts`, `src/main.ts`
- **Problema:** Mapas legados com ids de filete (ex. 8, 9) na grade `floors` exibiam fragmentos triangulares como se fossem piso.
- **Solução:** Camada base ignora tiles `assetType === 'border'`; filetes continuam via `collectBorderDrawTileIdsCached` / `layers.border`.

### 20.3 Detecção de grama para vizinhança de borda
- **Arquivo:** `src/engine/autoBorderEngine.ts`
- **Solução:** `isGrassTile` reconhece grupos `01-grass-random`, `02-grass-random` e variantes com `grass`/`grama` no nome.

### Checklist pós-fix Play
- [ ] Salvar `mainland.json` no Studio (formato esparso + `layers` + `tileRefs`) — o arquivo em disco ainda pode estar legado só com ids 8/9 na base
- [ ] Play: pedra na base, grama no overlay, filetes nas células vizinhas
- [ ] Rookgaard continua igual (já usa `layers` corretamente)

---

## 21. Âncora de sprites de mapa (2026-06-04)

### 21.1 Posicionamento unificado com personagens
- **Arquivos:** `src/functions/tileConfig.ts`, `src/engine/tileDraw.ts`, `src/editor/mapSpriteCalibration.ts`, `src/editor/mapSpriteEditor.ts`, `tiles/tile_properties.json`
- **Problema:** Sprites de mapa maiores que 32×32 (ex. `01_arvore` 64×64 com pé no canto inferior direito) eram centralizados horizontalmente sem ajuste — o pé ficava ~32px à direita do centro da célula.
- **Solução:**
  1. `TileProperties` e o registry propagam `anchorX` / `anchorY` de `tile_properties.json`.
  2. `drawRegistryTile` usa `getSpriteTilePlacement` (mesma lógica dos personagens) no Studio e no Play.
  3. Calibrador **Criar Sprites** lê e persiste âncora via `calibrationToPropertyPayload` + `onConfirm` do calibrador.
  4. `01_arvore`: `anchorX: -32`, `anchorY: 0`, `paletteCategory: "nature"`.

### Checklist pós-âncora mapa
- [ ] Studio: pintar `01_arvore` — pé alinhado ao centro inferior da célula
- [ ] Salvar mapa → F5 → posição mantida
- [ ] Play: mesma posição visual
- [ ] Tile 32×32 sem âncora — comportamento idêntico ao anterior

---

## 22. Y-sorting de profundidade (2026-06-04)

### 22.1 Personagem vs árvores e decorações
- **Arquivos:** `src/engine/depthSortDraw.ts`, `src/game/playApp.ts`, `src/main.ts`
- **Problema:** Após §16, todos os itens da camada `items` eram desenhados numa passada fixa antes (ou sem comparar Y com) personagens/NPCs. Árvores 64×64 cobriam o jogador ao passar ao sul, ou o jogador ficava sempre na frente ao norte — sem profundidade estilo Tibia.
- **Solução:**
  1. Novo módulo `depthSortDraw.ts`: coleta drawables (itens overlay, NPCs, remotos, jogador local), calcula `sortY`/`sortX` pelo **pé** do sprite (`getSpriteTilePlacement` / âncora do tile).
  2. **Passo 1** inalterado: chão base + grama + auto-borda (evita corte lateral de chão).
  3. **Passo 2:** fila Y-sort unificada; desenho na ordem `sortY` asc, `sortX` asc.
  4. Overlays de editor (zonas, portais, spawns, preview) e UI permanecem **após** o Y-sort.
- **Regra:** Norte da árvore → personagem atrás; sul → personagem na frente; durante movimento usa `worldY` interpolado.

### Checklist pós-Y-sort
- [ ] Play: passar ao norte da `01_arvore` — copa cobre personagem
- [ ] Play: passar ao sul — personagem na frente
- [ ] Studio: mesmo comportamento com jogador visível
- [ ] NPC/remoto na mesma linha — ordem por `sortX`
- [ ] Chão/grama/borda — sem regressão

---

## 23. Railway Fase A — servidor unificado (2026-06-05)

### 23.1 Deploy unificado
- **Arquivos:** `server/src/app.ts`, `server/src/studio/studioService.ts`, `server/src/routes/studio/`, `docs/hosting.md`
- **Mudança:** Em produção (`npm run start`), um único processo Node serve `dist/` (MPA), `/tiles/`, WebSocket e 18 APIs do Studio (portadas de `vite.config.ts`).
- **Dev:** `npm run dev` mantém middleware Vite; duplicação temporária até Fase D.

### 23.2 Volume persistente
- Variável `DATA_ROOT` (ex.: `/data` no Railway Volume) para mapas, sprites e presets editáveis.
- Boot copia seeds do repositório se o volume estiver vazio.

### 23.3 Studio em produção
- Removidos guards `import.meta.env.DEV` em `mapDevSave.ts`, `studioMapSession.ts`, `main.ts` (botão save).
- `apiFetch.ts` envia `Authorization: Bearer` (Supabase) nas rotas `/api/*`.
- `studioGuard.ts` valida `can_access_studio` no servidor.

### 23.4 WebSocket same-origin
- `playApp.ts` / `main.ts`: em prod sem `VITE_GAME_SERVER_WS`, usa `wss://<host>`.

### Checklist Railway Fase A
- [ ] `npm run build && npm run start` — landing, play, studio abrem em :8787
- [ ] `/health` retorna JSON ok
- [ ] `/tiles/...` serve sprites
- [ ] Studio: salvar mapa persiste (com `DATA_ROOT` ou `public/maps` local)
- [ ] Studio: APIs retornam 401 sem token GM
- [ ] Play: WS conecta same-origin; 2 abas sincronizam
- [ ] Após redeploy com volume, saves persistem

---

## 24. Railway Fase B — PostgreSQL + auth JWT (2026-06-05)

### 24.1 Backend próprio
- **Arquivos:** `database/migrations/`, `server/src/db/`, `server/src/auth/`, `server/src/routes/auth.ts`, `server/src/routes/characters.ts`
- **Mudança:** Contas e personagens em PostgreSQL; JWT próprio substitui Supabase no browser.
- Migrations automáticas no boot + `npm run db:migrate --prefix server`.

### 24.2 Frontend
- **Arquivos:** `src/shared/authClient.ts`, `authGuard.ts`, `characterStore.ts`, `apiFetch.ts`
- Removido `src/shared/supabaseClient.ts` e `@supabase/supabase-js` da raiz.
- Dev: mock localStorage por padrão; `VITE_USE_API_AUTH=true` força API.
- Prod: auth API ativa por padrão (`isApiAuthEnabled()`).

### 24.3 Studio guard
- `studioGuard.ts` valida JWT + `can_access_studio` no banco (não mais Supabase).
- Conta `*@gm.dev` no register recebe `role=gm` e `can_access_studio=true`.

### Checklist Railway Fase B
- [ ] PostgreSQL + `DATABASE_URL` — migrations aplicadas no boot
- [ ] `POST /api/auth/register` e `/login` retornam JWT
- [ ] `GET /api/auth/me` com Bearer retorna perfil
- [ ] CRUD personagens via `/api/characters`
- [ ] `npm run dev` — mock auth funciona sem DB
- [ ] `npm run build && npm run start` — login real + play + studio GM
- [ ] `/health` retorna `phase: railway-b`, `database: true`
- [ ] Studio: APIs com JWT GM (sem `STUDIO_MOCK_GM` em prod)

---

## 25. Railway Fase C — WS seguro + posição autoritativa (2026-06-05)

### 25.1 Ticket WS no backend
- **Arquivos:** `server/src/routes/wsTicket.ts`, `server/src/enterTicket.ts`
- `POST /api/ws-ticket` emite ticket HMAC com posição do PostgreSQL.
- Produção: `REQUIRE_WS_TICKET` ativo — join sem ticket retorna `MISSING_TICKET`.
- Removida dependência de `VITE_ENTER_TICKET_SECRET` em builds de produção.

### 25.2 Posição autoritativa
- **Arquivos:** `server/src/game/PositionPersistence.ts`, `server/src/GameRoom.ts`
- Servidor persiste `map_id` / posição no DB (debounce, disconnect, `map_change`).
- `playApp.ts` não chama `updateCharacterLocation` quando `isServerWsTicketEnabled()`.

### 25.3 Reconexão proativa
- **Arquivo:** `src/net/gameNetClient.ts`
- Reconexão aos 13 min com renovação de ticket (`refreshEnterTicket`).

### Checklist Railway Fase C
- [ ] `POST /api/ws-ticket` retorna ticket com personagem da conta logada
- [ ] WS join sem ticket em prod → erro `MISSING_TICKET`
- [ ] Movimento no overworld persiste no PostgreSQL após disconnect
- [ ] `play.html` não grava posição via PATCH durante jogo (modo API ticket)
- [ ] Reconexão proativa renova ticket antes de 15 min Railway
- [ ] `/health` retorna `phase: railway-c`, `requireWsTicket: true` em prod

---

## 26. Railway Fase D — APIs unificadas + limpeza (2026-06-05)

### 26.1 Uma implementação de APIs
- **Arquivos:** `vite.config.ts` (proxy), `server/src/studio/studioService.ts`
- Removido ~1000 linhas de middleware duplicado do Vite.
- `npm run dev` = `concurrently` Vite + Express; `/api/*` e `/tiles` proxied para `:8787`.

### 26.2 Supabase removido
- Pasta `supabase/schema.sql` removida; schema em `database/migrations/`.
- Docs atualizados (sem referências operacionais ao Supabase).

### 26.3 Studio guard em dev
- `studioGuard.ts` aceita `Bearer mock-gm` em desenvolvimento (compatível com `apiFetch` mock).

### Checklist Railway Fase D
- [ ] `npm run dev` — Studio salva mapa/sprite via proxy (mesmo código que prod)
- [ ] `npm run build && npm run start` — APIs idênticas sem proxy
- [ ] `npm run dev:web` — frontend sozinho (APIs indisponíveis, esperado)
- [ ] `/health` retorna `phase: railway-d`
- [ ] Nenhuma dependência `@supabase/supabase-js` no projeto

