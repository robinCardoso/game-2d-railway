# Log de melhorias do Studio (mapa + sprites)

Documento de referência para humanos e agentes IA. **Atualizar este arquivo** quando mudar calibrador, registry, carregamento de mapas ou APIs de sprite.

Última revisão: **2026-06-06**

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
| **Itens altos somem de repente** | `collectItemDepthDrawables` só iterava tiles visíveis; árvore 64×64 sumia quando o SQM do pé saía da tela | Margem + cull por bounding box do sprite + fade 28px na borda (`depthSortDraw.ts`) |
| **Árvore “fantasma” ao andar** | Fade usava distância até a borda mesmo com sprite inteiro na tela (copa perto do topo → alpha ~0.35) | Fade só com overflow (parte fora da tela); mínimo `ITEM_EDGE_FADE_MIN_ALPHA` 0.65 |
| **Outfit de jogador remoto** | WS sincronizava só posição/nome; remoto desenhado como quadrado rosa | `PlayerAppearance` no protocolo + ticket + `RemotePlayerSpriteManager` no Play |
| **Movimento remoto “pulo”** | Remoto desenhado direto no tile do servidor, sem walk | `RemotePlayerSpriteManager` interpola `visualX/Y` + `walk`/`idle` como o grid local |
| **Remoto “anda e trava”** | Idle imediato ao chegar no tile + duração fixa 200ms | Grace 120ms + duração estimada pelo intervalo entre pacotes |
| **Velocidade remota desalinhada** | Remoto estimava ms pelo intervalo de rede | `stepDurationMs` em `move` / `player_moved` (duração real do passo local) |
| **Delay remoto online (Railway)** | Remoto só recebia `player_moved` ao fim do passo + interpolação conservadora (~350–600ms) | Constantes mais baixas em `remotePlayerSprites.ts`; `GameRoom` broadcasta `player_moved` no `steppingReserveOnly`; cliente não reinicia deslize no mesmo destino |
| **Doc escala multiplayer** | Roadmap para muitos players online não estava centralizado | [docs/multiplayer-remote-players.md](./multiplayer-remote-players.md) — estado atual + Fases A–D |
| **Diagonal no Play (WS)** | `isAdjacentStep` só aceitava ortogonal; servidor rejeitava W+D e `position_correction` puxava o jogador | `canAdjacentStep` em `shared/tileWalkable.ts` + reset `gridMovement.stepping` na correção |
| **Pulo ao mudar direção** | Sprite/rede mudavam de face antes do deslize terminar → `position_correction` | `activeStepFacing` trava sprite no passo; grid tick antes do sprite; rede adia sync só de direção durante deslize |
| **Clamp stepDuration servidor** | Cliente podia mandar 16ms; GPT sugeriu 80ms mas conflita com speed 55ms | `MIN_SERVER_STEP_DURATION_MS` 55 em `shared/protocol.ts` |
| **Input movimento global** | `chordHeldSinceMs` / facing em módulo — risco Play+Studio/reload | Estado no `GridMovementController`; `resetGridMovementInputState(ctrl)` |
| **Rate limit movimento WS** | Cliente podia floodar `move` mesmo com clamp de duração | `GameRoom`: `lastMoveAcceptedAtMs` + intervalo `stepMs × 0.85`; código `MOVEMENT_TOO_FAST` |
| **Rate limit falso positivo** | Sync mandava duração do *próximo* passo (terreno lento) ≠ ritmo real (~331ms vs 453ms) | `lastCompletedStepDurationMs` no cliente + `lastObservedMoveIntervalMs` no servidor |
| **Spam rejeição movimento** | Cliente malicioso podia floodar `error` + `position_correction` + log | `rejectMove()` + `lastMoveRejectionSentAtMs`; throttle 400ms; silent drop no intervalo |
| **Paleta spawns após salvar mob** | `#charRegisterInPalette` ausente no HTML → `creature_presets.json` nunca atualizava | Checkbox em `studio.html`; hint aba Spawns aponta para Criar Mobs/NPCs |
| **Animação wrap no calibrador** | `startFrame` no fim da linha + `frames>1` não destacava célula na linha seguinte | `sheetFrameLayout.ts` — índice linear com wrap; calibrador, preview e runtime |
| **Criar Mob — campos e exclusão** | Nome/subpasta/descrição vinham preenchidos (`Novo Mob`); sem botão Novo; excluir pouco visível | Campos vazios + validação no save; `✨ Novo Mob` + Excluir na lista (como Criar Sprites); preset ao carregar existente |
| **Paleta spawns — preview sprite** | Só círculo colorido + emoji na aba Spawns | `creaturePresetThumbnail.ts` — canvas com frame idle/walk do JSON; lista de spawns no mapa também |
| **Layout paleta spawns** | `.tile-option` altura 56px truncava nome/descrição | Cards `.spawn-preset-card` em coluna única; thumb + texto legível |
| **Nome sobre entidades** | Player no Play usava fonte 8px sem contorno | `drawOutlinedEntityName` — bold 11px + stroke preto; player azul, mob verde, remoto rosa |
| **visualSize mob** | `applyVisualSize` sobrescrevia `frameWidth` (recorte errado na sheet 64px) | Só `drawScale` = alvo ÷ frame nativo; `imageSmoothingEnabled` false em entidades |
| **Roadmap de Expansão** | Sem documentação de requisitos para lojas de apps | [docs/playstore-steam-roadmap.md](./playstore-steam-roadmap.md) detalhando Tauri, Capacitor, D-Pad, WS reconect e checklist |
| **Âncora de mapa na UI** | Falta de inputs para `anchorX` e `anchorY` no painel Criar Sprites | Adicionados inputs na UI; sync com calibrador, load e save no servidor |
| **Definição de textos/canvas** | Textos entupidos pelo outline grosso e canvas com blur de subpixel | Fonte ajustada para Tahoma/Arial, contorno 2.0; resize() arredonda pixels e fixa estilo |
| **Árvores no chão (regressão)** | `target_ring.png` em `tiles/effects/` entrou no registry + double-remap corrompeu células com `ref` | Exclusão `effects/`/`characters/`; `resolvedSparseTileRefs`; padronização em `docs/asset-taxonomy.md` |
| **Padronização tiles/mapas** | IDs numéricos instáveis; layers sem resolve unificado; save sem validação | `shouldRegisterTilePath` sync+async; layers usam `resolveTilesByFloor`; `validateMapDocument`; `npm test` |
| **Banner level up no login** | `progress_sync` pós-WS com ticket dev sem XP fazia `leveledUp: true` (1→3) | `playSessionLevel` + `shouldCelebrateSessionLevelUp`; sync servidor silencioso; ticket dev com level/exp |



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

---

## 27. Planejamento de Lançamento: Steam e Play Store (2026-06-06)

### 27.1 Roadmap de Expansão de Plataformas
- **Arquivo:** [docs/playstore-steam-roadmap.md](./playstore-steam-roadmap.md)
- **Mudança:** Criação de documentação detalhada para migração e empacotamento do jogo em ambientes nativos.
- **Tópicos Abordados:**
  1. **Steam:** Utilização de Tauri v2 + Rust (`steamworks-rs`) para build leve; autenticação automática por ticket de sessão; configurações nativas de tela.
  2. **Play Store:** Empacotamento via Capacitor; mapeamento de D-Pad/joystick virtual para emulação de teclas no `playApp.ts`; UI/UX responsiva e scaling do canvas; ciclo de vida do app (salvar estado ao pausar e reconexão silenciosa de WS).
  3. **Checklist:** Tarefas divididas por fases (Core, Desktop/Steam, Mobile/Play Store) para planejamento futuro.

---

## 28. Controle de Âncoras para Sprites de Mapa na UI (2026-06-06)

### 28.1 Implementação de Inputs no Studio
- **Arquivos:** `studio.html`, `src/editor/mapSpriteEditor.ts`
- **Mudança:** Adicionados campos de entrada para `Ajuste Âncora X` e `Ajuste Âncora Y` no painel "Criar Sprites" (editor de blocos/itens).
- **Integração:** Os valores de âncora agora são exibidos e editáveis diretamente no formulário, sincronizam-se ao carregar um sprite do servidor, são limpos ao criar um novo sprite e são atualizados automaticamente quando retornados pelo Modal do Calibrador Visual.
- **Feedback Visual:** O canvas de preview do sprite de mapa agora renderiza a célula 32×32 tracejada em azul e a mira vermelha (+) de âncora nos pés, de forma idêntica ao painel de Personagens, facilitando ver o efeito dos valores de âncora inseridos em tempo real.

---

## 29. Correção de Definição Visual e Contraste de Textos (2026-06-06)

### 29.1 Textos e Canvas sem Blur
- **Arquivos:** `src/engine/depthSortDraw.ts`, `src/game/playApp.ts`, `src/main.ts`
- **Problema:** Nomes das entidades pareciam desfocados e "entupidos" devido à espessura excessiva do contorno e ao tipo de fonte. Além disso, o canvas sofria leve desfoque se o container DOM esticasse em larguras/alturas fracionárias (subpixel render).
- **Solução:**
  1. **Nomes nítidos:** Modificada a fonte em `depthSortDraw.ts` de `'Outfit'` para `Tahoma, Arial, sans-serif` (excelente legibilidade em baixa resolução) e reduzido o contorno `lineWidth` de `2.5` para `2.0` (liberando espaço para a cor interna das letras).
  2. **Canvas Pixel-Perfect:** Ajustada a função `resize()` para arredondar dimensões via `Math.floor` e definir explicitamente `canvas.style.width/height` em pixels inteiros, impedindo o navegador de aplicar filtro bilinear por subpixel.

---

## 30. Correção de Persistência de Âncoras e Configuração de Itens (2026-06-06)

### 30.1 Persistência de anchorX / anchorY no Backend
- **Arquivo:** `server/src/studio/helpers.ts`
- **Problema:** Ao salvar ou exportar em lote uma sprite de mapa, a API `saveMapSprite` dependia de `mergeMapSpriteCalibrationEntry` para persistir dados de calibração em `tile_properties.json`. No entanto, os campos `anchorX` e `anchorY` estavam ausentes da lista de campos mesclados (`intFields`), fazendo com que o servidor os ignorasse completamente e as alterações fossem perdidas a cada salvamento.
- **Solução:** Adicionados `anchorX` e `anchorY` ao array `intFields` em `mergeMapSpriteCalibrationEntry` e implementada conversão segura para inteiro (`parseFloat` + `Math.floor`) para garantir que os valores numéricos sejam gravados corretamente, mesmo se enviados como string.

### 30.2 Edição de Propriedades Físicas para Itens e Decorações
- **Arquivos:** `studio.html`, `src/editor/mapSpriteEditor.ts`
- **Problema:** A seção "Propriedades do Terreno" ficava invisível ao selecionar o asset tipo `items` (Item / Decoração). Além disso, o editor de sprites ignorava o carregamento das propriedades físicas (`walkable`, `speedModifier`, `isStair`, etc.) no formulário quando o sprite selecionado pertencia ao tipo `items`, impossibilitando a criação de decorações sólidas/bloqueantes ou a calibração de suas velocidades/âncoras.
- **Solução:**
  1. Renomeado o bloco do painel para "Propriedades Físicas" e modificado o comportamento em `syncTerrainPropertiesVisibility` para mantê-lo visível tanto para `terrain` quanto para `items`.
  2. Atualizada a lógica de carregamento no evento `change` do seletor de sprites para preencher os controles do formulário se o tipo for `terrain` ou `items`.
  3. Atualizada a verificação na validação de persistência para processar o grupo de variações e salvar as propriedades corretas quando o tipo for `items`.

---

## 31. Editor Visual e Dinâmico de Vocações (2026-06-06)

### 31.1 Gerenciamento Dinâmico de vocations.ts
- **Arquivos:** `server/src/config/paths.ts`, `server/src/studio/studioService.ts`, `server/src/routes/studio/index.ts`
- **Mudança:** Criada uma infraestrutura no backend para ler e gravar as vocações configuradas em um arquivo `vocations.json` (usado como base de dados estável) e gerar de forma automatizada o código TypeScript para `src/game-data/default/vocations.ts`. Isso permite que o editor da web salve as vocações sem necessidade de parser de AST no código TS, mantendo os imports estáticos do motor de jogo intactos.
- **APIs adicionadas:**
  - `GET /api/get-vocations`: Retorna as vocações configuradas (inicializa com Knight, Mage e Archer se o arquivo JSON não existir).
  - `POST /api/save-vocations`: Recebe as configurações editadas, grava em `vocations.json` e regrava o arquivo `vocations.ts` para recompilação instantânea via Vite.

### 31.2 Interface Visual e Integração com Criação de Personagens
- **Arquivos:** `studio.html`, `src/editor/vocationEditorModal.ts`, `src/editor/spriteSheetEditor.ts`, `src/characters/create.ts`, `src/main.ts`
- **Mudança:**
  - **Menu e Atalhos:** Adicionado botão de atalho "Vocações (Stats)" no menu superior "Criar" e um botão de engrenagem (⚙️) ao lado do seletor de vocações no painel do personagem.
  - **Modal de Edição:** Implementado o modal `#vocationEditorModal` com layout em duas colunas (lista de vocações à esquerda e campos de atributos base/crescimento à direita).
  - **Simulação de Lvl 100:** Adicionado um painel de visualização que recalcula os atributos simulados para o Nível 100 em tempo real à medida que o usuário ajusta os campos de atributo base ou crescimento por nível, fornecendo feedback de balanceamento instantâneo.
  - **Dropdowns Dinâmicos:** Removidas as opções estáticas em HTML nos dropdowns do Studio e no assistente de criação de novos personagens (`create.ts`), que agora preenchem os elementos dinamicamente a partir das vocações configuradas, possibilitando a criação imediata de novas classes e jogabilidade personalizada.

### 31.2 Correções de alta prioridade (2026-06-06)
- **Arquivos:** `src/game-data/vocationUi.ts`, `src/editor/vocationEditorModal.ts`, `src/editor/spriteSheetEditor.ts`, `src/characters/create.ts`, `shared/types/character.ts`, `studio.html`, `server/src/studio/studioService.ts`
- **Mudança:**
  1. **`VocationId` → `string`:** novas vocações deixam de depender de `as any` no TS gerado.
  2. **Simulação Lvl 100:** usa `calculateStatsForLevel` (mesma fórmula do combate); exibe Dist., Mág., Atk Spd e Def Atk.
  3. **Rename de ID:** ao salvar com ID diferente, remove a chave antiga do JSON (evita duplicatas).
  4. **Dropdowns após save:** evento `game:vocations-updated` atualiza selects do Studio e da criação de personagem sem F5.
  5. **Modal permanece aberto** após salvar/excluir para edição contínua.

---

## 32. Fluxo de XP e combate básico no Play (2026-06-06)

### 32.1 Progressão de experiência
- **Arquivos:** `src/game/experience.ts`, `src/engine/character/calculateStats.ts` (fórmulas existentes)
- **Mudança:** `applyExperienceGain()` aplica XP acumulado e recalcula nível via `getLevelFromExp` (`floor(sqrt(exp/100))+1`). Barra de XP no painel Play usa `getExpProgress()`.

### 32.2 Combate melee no Play (Espaço)
- **Arquivos:** `src/game/playCombat.ts`, `src/game/playApp.ts`, `src/character/entity.ts`, `src/character/respawnEntities.ts`, `src/game/creatureCombatStats.ts`
- **Mudança:** Espaço ataca monstro adjacente (Manhattan = 1); dano melee via `calculateMeleeDamage`; criatura morta concede XP; mortos não bloqueiam tile, não movem e não desenham.

### 32.3 Stats de criaturas
- **Arquivos:** `src/editor/creaturePresets.ts`, `public/creature_presets.json`
- **Campos opcionais:** `xpReward`, `maxHealth`, `defense` (defaults por `visualSize`: tiny→boss).

### 32.4 Persistência
- **API:** `PATCH /api/characters/:id/progress` `{ level, experience }`
- **Arquivos:** `server/src/db/repositories/characters.repo.ts`, `src/shared/characterStore.ts`, `src/shared/mockAuth.ts`
- **Play:** autosave com debounce 2 s; save imediato em level-up; flush no `beforeunload`.

### 32.5 UI Play
- **Arquivos:** `play.html`, `src/game/ui/characterStatsUi.ts`
- **Mudança:** linha Experiência + barra de progresso; flash dourado no nível ao subir; `characterSpeed.level` sincronizado (bônus de velocidade por nível).

### Checklist manual
- [ ] Matar monstro adjacente com Espaço concede XP e atualiza barra
- [ ] Level-up recalcula stats no painel e velocidade de movimento
- [ ] Recarregar personagem mantém level/exp (mock ou API)
- [ ] Criatura morta some do mapa e libera o tile

---

## 33. Editor Mobs Stats (2026-06-06)

### 33.1 Menu e modal
- **Arquivos:** `studio.html`, `src/editor/mobStatsEditorModal.ts`, `src/main.ts`
- **Menu:** Criar → **👾 Mobs Stats**
- **Modal:** lista presets de `creature_presets.json`; edita combate por mob.

### 33.2 Campos de combate
- **Arquivo:** `src/game-data/mobPresetTypes.ts`
- **Campos:** `maxHealth`, `defense`, `attack`, `attackSpeed`, `xpReward`, `race`
- **Defaults:** por `visualSize` quando campo omitido no JSON
- **Raças:** humanoid, beast, undead, demon, dragon, elemental, plant, construct, aquatic, other

### 33.3 Loot (persistido; gameplay pendente)
- **Campo:** `loot: [{ itemId, chance }]` — chance 0–100%
- **Regra:** `itemId` **deve existir** em `public/item_catalog.json` (validado no Studio e no servidor)
- Drop no Play **não** implementado ainda

### 33.4 Catálogo de itens (2026-06-06)
- **Arquivo:** `public/item_catalog.json`
- **Menu:** Criar → **📦 Itens (Catálogo)**
- **APIs:** `GET/POST /api/get-item-catalog`, `/api/save-item-catalog`
- **Campos:** id, name, category (`loot` | `equipment`), slot, speedBonus, description, `implemented`
- **Mob Stats:** loot só lista itens do catálogo; referências inválidas bloqueiam save com mensagem clara
- **`itemDefinitions.ts`:** passa a ler do catálogo (não mais hardcoded)

### 33.5 APIs Studio (mobs)
- `GET /api/get-creature-presets`
- `POST /api/save-creature-presets` `{ presets: [...] }`
- `upsert-creature-preset` preserva stats ao salvar sprite via merge

### Checklist manual
- [ ] Menu Criar → Mobs Stats abre modal
- [ ] Menu Criar → Itens (Catálogo) cria item e salva em `item_catalog.json`
- [ ] Loot de mob só aceita itens cadastrados; IDs fantasmas são rejeitados
- [ ] Editar Magao Bruto e salvar persiste em `public/creature_presets.json`
- [ ] Play usa HP/defesa/XP/ataque do preset após reload
- [ ] Loot salvo no JSON (drop in-game ainda N/A)

---

## 34. Correção arquitetural — vocações runtime + XP em produção (2026-06-06)

### 34.1 Registry de vocações
- **Arquivo:** `src/game-data/vocationRegistry.ts`
- **Leitura:** `GET /vocations.json` (público; proxy Vite em dev)
- **Fallback:** bundle `default/vocations.ts` se fetch falhar
- **API:** `loadRuntimeVocations()`, `getVocationById()`, `applyRuntimeVocations()`
- **Consumidores:** `playCombat.ts`, `characterStatsUi.ts`, `create.ts`, `spriteSheetEditor.ts`, Studio (`vocationEditorModal` + evento `game:vocations-updated`)

### 34.2 Vocações no Volume Railway
- **`paths.ts`:** com `DATA_ROOT`, `vocationsJsonPath` → `/data/vocations.json`
- **Seed:** copia `src/game-data/default/vocations.json` na primeira subida do volume
- **`save-vocations`:** grava JSON no volume; `vocations.ts` permanece legado dev/HMR

### 34.3 XP/level em produção (WS ticket)
- **`playApp.ts`:** `scheduleProgressSave` **não** bloqueia mais quando `isServerWsTicketEnabled()`
- Posição continua autoritativa via WS; progresso salva via `PATCH /api/characters/:id/progress`

### Checklist manual
- [ ] Criar vocação custom no Studio → Play com personagem dessa vocação usa stats corretos (não knight)
- [ ] `create.html` lista vocações após reload (fetch `/vocations.json`)
- [ ] Railway: editar vocações sobrevive redeploy (volume)
- [ ] Produção: matar mob → XP persiste após sair e reentrar no Play

---

## 35. Mobs compartilhados multiplayer (Fase 1–2)

### 35.1 Servidor autoritativo
- **`MapCollisionStore`:** carrega `spawns` do JSON do mapa
- **`RoomCreatureManager`:** estado por sala `mapId@instanceId`; IA chase (shared `creatureChase.ts`); tick 100ms / passo 360ms
- **`GameRoom`:** `welcome.creatures` + `creature_sync` em troca de mapa; broadcast `creature_moved`

### 35.2 Protocolo (`shared/protocol.ts`)
- `CreatureSnapshot`, `creature_sync`, `creature_moved`
- `welcome.creatures[]` opcional

### 35.3 Cliente Play
- **`ServerCreatureSync`:** substitui mobs locais quando WS conectado
- **`playApp.ts`:** sem `respawn` de monsters locais online; `NpcAI` só NPCs; combate/draw usam entidades do servidor
- **`gameNetClient`:** callbacks `onCreatureSync` / `onCreatureMoved`

### Checklist manual
- [ ] 2 abas Play mesmo mapa — cada aba vê **2** mobs (não 4); posições iguais
- [ ] Mobs perseguem jogador mais próximo na sala
- [ ] Offline (sem WS): mobs locais como antes
- [ ] Troca de mapa online: `creature_sync` repovoa sala nova

### Backlog (Fase 4+)
- Loot autoritativo no servidor
- Respawn configurável por spawn

---

## 37. Combate autoritativo multiplayer (2026-06-06)

### 37.1 Protocolo
- **C→S:** `attack` `{ creatureId, mapId, instanceId? }`
- **S→C:** `creature_damaged`, `creature_died`, `creature_respawned`, `player_progress`

### 37.2 Servidor
- `RoomCreatureManager.processAttack` — valida adjacência, cooldown, calcula dano via `server/combat/combat.ts`
- HP/XP dos mobs via `CreaturePresetStore` (`creature_presets.json`)
- Vocações via `VocationStore` (`vocations.json`)
- XP persistido no PostgreSQL via `ProgressPersistence` (ticket join traz level/exp)
- Respawn de mob morto após 45s no spawn

### 37.3 Cliente
- `isServerAuthoritativeCombat(wsConnected)` — online envia intenção; offline mantém combate local
- `gameNetClient.sendAttack` + handlers em `serverCreatureSync`
- XP/level só aplicados via `player_progress` do servidor quando online

### Checklist manual
- [ ] 2 abas: dano e morte do mob sincronizados
- [ ] XP sobe só após `player_progress` (não localmente quando WS ativo)
- [ ] Mob morto reaparece no spawn após ~45s em ambas as abas
- [ ] Offline (sem WS): combate local continua funcionando

---

## 36. Autoridade explícita + reserva de tile (2026-06-06)

### 36.1 Flags (`src/game/serverAuthority.ts`)
- `isServerAuthoritativePosition()` — posição via WS/ticket (prod)
- `isServerAuthoritativeCreatures(wsConnected)` — mobs do GameRoom
- `isServerAuthoritativeCombat(wsConnected)` — combate via servidor quando WS conectado

### 36.2 Reserva de tile durante deslize
- **Cliente:** `isPlayerOccupyingTile()` reserva `gridMovement.destTileX/Y` em `isEntityAtTile`
- **Cliente:** `canCommitStepToTile` — cancela passo se destino ficou bloqueado ao terminar animação
- **Protocolo:** `move.steppingDestTileX/Y` — reserva no servidor sem mover tile autoritativo
- **Servidor:** `RoomCreatureManager` trata tile reservado como ocupado pelo jogador

### Checklist manual
- [ ] Mob online não entra no tile para onde o player está deslizando
- [ ] Player não “aterriza” em tile com mob se este entrou durante o passo

---

## 38. Movimento remoto mais responsivo online (2026-06-06)

### 38.1 Tuning (`src/net/remotePlayerSprites.ts`)
- `REMOTE_STEP_DURATION_MS` 180, `MIN_REMOTE_STEP_MS` 120, `MAX_REMOTE_STEP_MS` 260
- `REMOTE_SMOOTHING_EXTRA_MS` 20, `REMOTE_IDLE_GRACE_MS` 80, diagonal max 300ms

### 38.2 Broadcast no início do passo (`server/src/GameRoom.ts`)
- Em `isSteppingReserveOnly`, após validar destino, `broadcastToRoom` com `player_moved` (tile destino + `stepDurationMs`)
- Confirmação no fim do passo reutiliza o mesmo evento; remoto não reinicia interpolação se destino igual

### Checklist manual
- [ ] 2 abas Railway: remoto começa a andar quase junto (alvo ~120–250ms, não 500ms+)
- [ ] Sem efeito “anda → trava → anda” em caminhada contínua
- [ ] Confirmação do passo não reinicia o deslize visual

---

## 39. FX combat no volume DATA_ROOT — target_ring (2026-06-06)

### 39.1 Sintoma
- Play em Railway (`DATA_ROOT=/data`): anel de alvo amarelo tracejado (fallback procedural) em vez do sprite dourado.
- Localhost `:5173`: Vite serve `tiles/` do repo; `/tiles/effects/combat/target_ring.png` responde 200.

### 39.2 Causa
- `combatTargetRing.ts` carrega FX via `fetch('/tiles/effects/combat/...')` — **fora** do tile registry.
- Com volume persistente, `seedDataRoot()` só copiava `tiles/` inteiro se `/data/tiles` estivesse vazio; volumes antigos não recebiam subpastas novas (`effects/combat/`).

### 39.3 Correção
- **`server/src/config/paths.ts`:** merge incremental de `tiles/effects/` do repo para o volume a cada boot (`copyDirRecursive`, sem sobrescrever).
- **`server/src/app.ts`:** fallback read-only — se arquivo ausente em `paths.tilesDir`, servir de `paths.repoTilesDir` (cópia do deploy).

### Checklist manual
- [ ] Railway: `GET /tiles/effects/combat/target_ring.png` → 200
- [ ] Play online: selecionar mob → anel dourado animado (3 frames)
- [ ] Console sem `[combatTargetRing] PNG não encontrado`
- [ ] `node scripts/verify-tiles-fallback.mjs` após `npm run build`

---

## 40. Revisão análise GPT — reserva de passo, XP e mapas (2026-06-06)

### 40.1 TTL reserva de movimento (tile fantasma)
- **`shared/steppingDestReserve.ts`:** `computeSteppingDestExpiresAtMs`, `expireStaleSteppingDest`, `clearSteppingDest`
- **`server/src/GameRoom.ts`:** `steppingDestExpiresAtMs` na reserva (`stepDurationMs + 80ms`); expiração em `playersInRoomAsRefs()` antes de refs para mobs

### 40.2 Hardening progress_sync
- **`server/src/config/env.ts`:** `ALLOW_CLIENT_PROGRESS_SYNC` (default false)
- **`shared/progressSyncPolicy.ts`:** produção nunca aceita; dev exige opt-in + sem ticket WS
- **`GameRoom.handleProgressSync`:** usa política acima; boot avisa se prod sem `requireWsTicket` ou JWT dev

### 40.3 Registry dinâmico de mapas no servidor
- **`server/src/mapRegistry.ts`:** builtins + scan de `paths.mapsDir` (`*.json`); `initServerMapRegistry()` no boot
- **`MapCollisionStore.loadAll()`:** carrega todos os mapas registrados (não só 3 hardcoded)

### Checklist manual
- [ ] 2 clientes: cancelar passo no meio — mob não trava tile para sempre
- [ ] Produção: `progress_sync` ignorado (XP só via kill servidor)
- [ ] Mapa novo em `public/maps/` ou volume → colisão WS após redeploy sem editar código
- [ ] `npm test` inclui `shared/steppingDestReserve.test.ts`

---

## 41. Page Visibility no Play — resync ao voltar foco (2026-06-06)

### 41.1 Problema
- Aba em background: browser pausa `requestAnimationFrame` — render/input param (normal).
- Servidor continua (`RoomCreatureManager` tick 50ms no Node).
- Ao voltar foco, visual podia ficar desatualizado sem snapshot forte.

### 41.2 Cliente
- **`src/game/pageVisibility.ts`:** `setupPageVisibilityHandlers`
- **`playApp.ts`:** `hidden` limpa teclas/stepping; `visible` snap visual + `requestRoomResync()`
- **`serverCreatureSync`:** `resetFrameClock`, `snapAllToAuthoritativeTiles`
- **`remotePlayerSprites`:** `snapAllToAuthoritativeTiles`

### 41.3 Protocolo WS
- **`resync_request`** (C→S) — rate limit 2s no `GameRoom`
- Resposta: `state_sync` + `creature_sync` + `position_correction` (tile local) + `player_progress` (HUD)

### 41.4 Hardening alt-tab no meio do passo (pós-revisão GPT)
- **`onHidden`:** `syncPositionIfChanged()` antes de limpar `stepping`; depois snap visual com `syncGridPlayerVisual`
- **`handleResyncRequest`:** inclui `position_correction` para alinhar jogador local ao tile autoritativo

### Checklist manual
- [ ] Railway: mob continua ativo com aba em background
- [ ] Ao voltar foco: mobs/jogadores remotos alinhados ao servidor
- [ ] WASD pressionado antes de alt-tab não move player sozinho ao voltar
- [ ] `npm test` inclui `shared/protocolClientMessage.test.ts`

---

## 42. Suporte Multiplataforma (Electron + Capacitor) (2026-06-06)

### 42.1 Estado Autoritativo e Ciclo de Vida
- **Arquivos:** `src/net/serverStateStore.ts`, `src/net/resyncController.ts`, `src/game/runtime/*`
- **Mudança:** O estado do servidor (jogadores, criaturas, pings) é gravado no `serverStateStore` antes de despachar eventos para o loop do jogo. Isso evita que minimizar a janela do Electron (ou aba em background) "congele" o estado se o `requestAnimationFrame` for throttlado. O `resyncController` coordena o snap visual ao voltar de background com rate-limit local.
- **Ciclos de Vida:** `appLifecycle.ts` unifica eventos de visibility e focus, com implementações específicas para Web (`webLifecycle.ts`), Electron (`electronLifecycle.ts`) e Android/Capacitor (`capacitorLifecycle.ts`).

### 42.2 Electron (Windows)
- **Arquivos:** `desktop/electron/main.ts`, `desktop/electron/preload.ts`, `package.json`, `electron-builder.yml`
- **Mudança:** Cliente desktop que não pausa quando minimizado. Configurado com `backgroundThrottling: false` e `disable-renderer-backgrounding` para contornar problemas de rede e tick da engine durante combate em background.

### 42.3 Capacitor (Android)
- **Arquivos:** `capacitor.config.ts`, script `mobile:build`
- **Mudança:** Inicialização e configuração do Capacitor para portabilidade mobile, delegando o gerenciamento do WebSocket e background para plugins nativos, exigindo sync explícito no `resume` (`capacitorLifecycle.ts`).

### 42.4 Diagnóstico (F3) e Protocolo
- **Arquivos:** `src/game/debug/clientDiagnostics.ts`, `shared/protocol.ts`, `server/src/GameRoom.ts`
- **Mudança:** Inclusão dos campos `platform` e `clientBuildVersion` no handshake WS (`join`). Painel de debug local no cliente (`F3`) mostra ping, visibilidade, RTT e última vez que ocorreu state/creature/progress sync.
- **Snapshots periódicos:** O `GameRoom.ts` envia snapshots periódicos completos quando há clientes, evitando a perda total de contexto em caso de lag no front.

---

## 43. Desync visual de morte de mobs online (2026-06-06)

### 43.1 Problema
- `creature_died` não trazia `tileX/tileY/z`; `applyDied` iniciava animação de morte em `worldX/worldY` do deslize (tile lógico já adiantado via `creature_moved`).
- Corpo/efeito apareciam no SQM errado quando o mob morria durante perseguição.

### 43.2 Protocolo e servidor
- **`CreatureDiedMessage`:** campos `tileX`, `tileY`, `z` (tile autoritativo no kill).
- **`RoomCreatureManager.processAttack`:** preenche posição da criatura no `creature_died`.

### 43.3 Cliente
- **`ServerCreatureSync.applyDied`:** snap ao tile do servidor antes de `beginCreatureDeath`.
- **`beginCreatureDeath`:** `syncWorldToTile(TILE_SIZE)` defensivo.
- **`applyMoved`:** ignorado se `combatHealth <= 0` (entre `creature_damaged` fatal e `creature_died`).
- **Movimento online:** meta em `serverTiles`; **1 passo cardinal / ~320 ms** via lerp. Pacotes durante deslize só atualizam meta (`deferred: true`); próximo passo só após chegar no SQM (`tryBeginNextStep`). Sem retarget no meio do deslize (evita burst de pacotes WS).
- **Debug:** `localStorage debug.creature.sync=1` → logs throttle em `creatureSyncDebug.ts` (`creature_moved`, `creature_damaged`, `creature_died`, `applyDied_snap`).
- **F3:** linha “Creature desync max” quando `|world − tile×32| > 0.5px`.

### 43.4 Testes
- `src/net/serverCreatureSync.death.test.ts` — snap mid-slide + bloqueio de move pós-dano fatal.

### Checklist manual
- [ ] Matar mob parado adjacente — corpo no SQM do ataque; `desyncPx ≈ 0` com debug ligado.
- [ ] Matar mob perseguindo — corpo no tile autoritativo (não no meio do deslize visual).
- [ ] Andar 1 SQM após kill — corpo não “pula” para tile errado.
- [ ] Perseguir mob andando — movimento contínuo tile a tile (sem saltos entre SQMs).
- [ ] `npm test` — `serverCreatureSync.death.test.ts` passa.
