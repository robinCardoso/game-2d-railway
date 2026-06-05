# Plano de Implementação — Suporte a Sprites Grandes e Camada de Natureza (Sobreposição)

Este plano descreve as alterações necessárias para suportar a calibragem/exportação de sprites em tamanho original (como árvores e pedras grandes de 64x64) e a criação de uma camada de sobreposição (`items` / `nature`) para que elementos decorativos e natureza fiquem por cima do chão, sem apagá-lo.

## User Review Required

> [!IMPORTANT]
> - **Nova Camada no Mapa:** Para evitar substituir o chão (grama/pedra) por árvores, introduziremos uma camada de sobreposição chamada `items` dentro das `layers` do arquivo `.json` do mapa.
> - **Calibrador Visual:** Ao calibrar sprites com dimensões diferentes de 32x32, o sistema perguntará ao usuário se ele deseja "Manter o tamanho original" de renderização do frame ou redimensioná-lo para 32x32.
> - **Pintura e Eraser Inteligente:** Pintar um elemento das categorias `nature`, `items` ou `walls` o colocará na camada de sobreposição. O apagador (Eraser) removerá primeiro a decoração/natureza no local se houver, mantendo o chão intacto.

## Proposed Changes

### [Engine]

#### [MODIFY] [types.ts](file:///c:/Users/Robson/source/game-2d/src/engine/types.ts)
- Adicionar `items?: Record<string, MapTileEntry[]>` nas camadas (`layers`) do `MapDocument`.
- Adicionar `itemsOverlay?: LayerMap` no `CollisionQueryContext`.

#### [MODIFY] [mapPaintLayers.ts](file:///c:/Users/Robson/source/game-2d/src/engine/mapPaintLayers.ts)
- Atualizar `serializeLayerMaps` e `deserializeLayerMaps` para incluir suporte à camada `items` (conversão bidirecional entre grade densa e formato esparso de arquivo).

#### [MODIFY] [worldMap.ts](file:///c:/Users/Robson/source/game-2d/src/engine/worldMap.ts)
- Passar a camada de itens nas chamadas de serialização e desserialização (`serializeMapDocument` e `loadMapFromJson`).
- Adicionar suporte para a resolução de refs estáveis dos tiles da camada de itens no load/save.

#### [MODIFY] [tileDraw.ts](file:///c:/Users/Robson/source/game-2d/src/engine/tileDraw.ts)
- Atualizar `drawRegistryTile` para detectar o tamanho real do frame (`sourceRect.w/h` ou dimensões naturais da imagem/propriedades) em vez de forçar 32x32.
- Centralizar o sprite horizontalmente e alinhar a base com a parte inferior da célula de grade 32x32 (âncora bottom-center).

#### [MODIFY] [collision.ts](file:///c:/Users/Robson/source/game-2d/src/engine/collision.ts)
- Atualizar `queryWalkable` para verificar se existe um item ou decoração na célula atual e combinar a propriedade de colisão/velocidade com a do chão base.

---

### [Editor]

#### [MODIFY] [mapSpriteEditor.ts](file:///c:/Users/Robson/source/game-2d/src/editor/mapSpriteEditor.ts)
- No callback de calibragem de frame único, se o tamanho do frame for diferente de 32x32, perguntar via `popup.confirm` se o usuário quer manter o tamanho original ou redimensionar para 32x32.
- Se mantiver o tamanho, recortar a imagem com as dimensões calibradas e salvar as propriedades de tamanho no payload enviado ao servidor.

#### [MODIFY] [mapSpriteBatchExport.ts](file:///c:/Users/Robson/source/game-2d/src/editor/mapSpriteBatchExport.ts)
- No `exportSelectedVariantStrip`, se o tamanho calibrado for diferente de 32x32, perguntar se o usuário quer manter o tamanho original.
- Adaptar `buildVariantStripDataUrl` e `saveVariantStripSprite` para suportar larguras/alturas de frames customizadas.

#### [MODIFY] [main.ts](file:///c:/Users/Robson/source/game-2d/src/main.ts)
- Declarar e inicializar `itemsOverlayMap`.
- Adicionar suporte a `itemsOverlay` no histórico (Undo/Redo), snapshot de pintura do mapa e no contexto de colisão.
- Atualizar a função `paint` / `placeTileAt` para:
  - Se for um tile das abas `NATUREZA`, `PAREDES` ou `ITENS` (`paletteCategory` de nature, walls ou items), pintá-lo na `itemsOverlayMap` em vez do chão base (`worldMap`).
  - Não apagar o chão base ao colocar uma árvore/natureza.
- Atualizar `eraseTileAt` para:
  - Se houver um item na camada de sobreposição, remover apenas o item (preservando o chão base).
  - Caso contrário, apagar o chão base.
- Renderizar `itemsOverlayMap` por cima do chão base, grama e bordas.

---

### [Cliente / Play Mode]

#### [MODIFY] [playApp.ts](file:///c:/Users/Robson/source/game-2d/src/game/playApp.ts)
- Declarar e inicializar `itemsOverlayMap`.
- Incluir `itemsOverlay` nas chamadas de carregamento de mapa e no contexto de colisão.
- Renderizar a camada `itemsOverlayMap` no loop principal de desenho do jogo.

---

### [History System]

#### [MODIFY] [history.ts](file:///c:/Users/Robson/source/game-2d/src/functions/history.ts)
- Incluir suporte a `items` na estrutura de snapshot de pintura do mapa `MapPaintSnapshot` e no histórico de Undo/Redo.

## Verification Plan

### Automated Tests
- Testar a gravação e carregamento de um mapa de teste com uma árvore contendo colisão.
- Verificar se a velocidade e a colisão do jogador respeitam a nova lógica combinada da camada de itens.

### Manual Verification
1. Importar um sprite de árvore de 64x64.
2. Confirmar no popup para manter o tamanho original de 64x64.
3. Pintar a árvore no mapa (aba NATUREZA). Ela deve renderizar em tamanho original 64x64, centralizada horizontalmente e alinhada à base do tile, sem apagar o gramado sob ela.
4. Passar com o personagem por cima e pelos lados. Se a árvore estiver marcada como não caminhável, o personagem deve colidir com o tile base correspondente.
5. Usar a Borracha (Eraser) na árvore. Ela deve sumir, mantendo o chão intacto.
6. Salvar o mapa e reiniciar a página para garantir a round-trip perfeita do JSON.
