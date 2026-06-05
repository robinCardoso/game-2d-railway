# Documentação Técnica — Fluxo de Calibração, Exportação e Exclusão de Sprites de Mapa

Este documento serve como referência técnica detalhada sobre as melhorias e novos fluxos de trabalho adicionados ao Studio do editor 2D, com foco na eficiência de UX (experiência do usuário), arquitetura do catálogo de tiles e prevenção de falhas de sincronismo.

---

## 🚀 1. Ciclo de Vida e Exportação no Calibrador

O fluxo de trabalho de calibração de spritesheets de mapa foi otimizado para eliminar passos redundantes e alinhar visualmente a intenção do desenvolvedor.

```
[Imagem Bruta] -> [Painel Lateral (CRIAR SPRITES)] -> [Calibrador (Grid e Multi-Select)] -> [Exportar Selecionados (Strip PNG)]
                                                                                                    |
                                                                                                    v
                                                                                           [Salva PNG no Disco]
                                                                                           [tile_properties.json]
                                                                                           [tile_catalog.json]
```

### ⚡ Pipeline de Exportação Direta (Bypass de Modal)
* **Antes**: Havia um modal intermediário redundante (`1 SPRITE - N VARIANTES`) que surgia após clicar em exportar, obrigando a redigitar o nome do sprite e configurações já preenchidas no painel de controle principal.
* **Agora**: O botão verde `✅ Exportar selecionados` executa um fluxo assíncrono direto. Ele renderiza uma tela rápida de confirmação em `popup.confirm` resumindo o nome do arquivo, caminho e número de frames selecionados, gravando-os diretamente.

### 🎯 Prevenção de Ambiguidade no Grid de Calibração
* **Ocultação de Badges em Novos Sprites**: Ao criar um sprite novo do zero, as marcas de frames `F1, F2...` do calibrador são completamente ocultadas para evitar confusão visual.
* **Seleção Limpa ao Toggle**: O switch `☑️ Seleção múltipla` inicia com seleção vazia em vez de selecionar automaticamente e silenciosamente a primeira célula (`c=0, r=0`).
* **Bloqueio do Botão Confirmar**: O botão azul `Confirmar` (que serve para sprites avulsos ou personagens) é desabilitado e recebe opacidade de `0.4` no modo de multi-seleção de mapas, direcionando o desenvolvedor à exportação.

---

## 🎲 2. Mecanismo de Auto-Agrupamento (Fail-Safe)

Ao exportar conjuntos de variações horizontais (ex: `meu-sprite_variants.png`), o editor cria uma estrutura chamada **Variant Brush** (pincel aleatório).

### ⚙️ Fallback de Grupo Inteligente (`tileRegistry.ts`)
* **Problema**: Se o desenvolvedor esquecesse de definir um nome no formulário lateral ou desmarcar a flag "Sem grupo", as variantes eram importadas como blocos avulsos que sobrecarregavam a paleta do editor.
* **Solução (Fail-Safe)**: Se um sprite horizontal (`_variants`) for exportado sem um grupo configurado, o registrador de tiles (`registerVariantStrip`) automaticamente atribui o prefixo do nome do arquivo como o seu `variantGroup` no motor de jogo.
* **Resultado**: O lote de variações é agrupado de forma autônoma como um pincel aleatório `🎲` na paleta de ferramentas.

---

## 🗑️ 3. Fluxo de Exclusão Segura de Sprites

Implementamos uma proteção de exclusão no Studio do Studio de forma que o desenvolvedor possa remover sprites e metadados obsoletos sem quebrar o mapa ou corromper os JSONs.

### 🌐 Endpoints de API (`server/src/routes/studio/`)

#### 1. Verificação de Dependências: `GET /api/sprite-usage`
Verifica se um sprite está sendo utilizado em algum mapa ativo ou configuração de grupo antes de permitir a sua exclusão física do disco.
* **Parâmetros**: `filename=<fileKey>`
* **Mapeamento**:
  * Escaneia todos os mapas em `public/maps/*.json` buscando por ocorrências diretas de `filename` ou de variações `filename#N`.
  * Verifica se o sprite está definido como `previewTileFileKey` em `public/tile_variant_groups.json`.
* **Retorno**:
  ```json
  {
    "filename": "grama_20_var_variants",
    "maps": [
      { "mapId": "mapa_exemplo", "mapFile": "mapa_exemplo.json", "cellCount": 14 }
    ],
    "totalCells": 14,
    "variantGroups": ["grass"],
    "isPreviewTile": true
  }
  ```

#### 2. Exclusão Física: `DELETE /api/delete-map-sprite`
Remove com segurança os metadados, arquivos físicos e gerencia referências cruzadas.
* **Parâmetros**: `filename=<fileKey>&category=<cat>&force=<true|false>`
* **Regras de Processamento**:
  1. Se `force = false` e houver uso detectado nos mapas, bloqueia com erro **409 Conflict**.
  2. Apaga o arquivo PNG correspondente em `tiles/maps/...` (fazendo busca recursiva automática se necessário).
  3. Deleta a entrada do sprite dentro de `tiles/tile_properties.json`.
  4. Atualiza `public/tile_variant_groups.json`: se o sprite excluído for a imagem de visualização (preview) do grupo, ele aponta automaticamente o preview para outro membro do mesmo grupo. Caso não haja mais membros, o grupo inteiro é excluído.

---

## 🐛 4. Caso Técnico Resolvido: Correção da Pedra Sumida

### Sintoma
Ao salvar as variantes de pedra (`ground-pedra_variants`), o pincel correspondente desapareceu e a quantidade de tiles no pincel de grama subiu de 20 para 24.

### Diagnóstico
No painel lateral do Studio, o campo `GRUPO DE VARIAÇÃO` da pedra estava configurado por acidente com `"grass"`. Como consequência, o catálogo uniu a pedra e a grama sob o mesmo grupo de pincel de variação.

### Correção Cirúrgica Aplicada
1. Ajustamos o `variantGroup` de `ground_pedra_variants` para `"stone"` em `tile_properties.json`.
2. Adicionamos a entrada do grupo `"stone"` em `public/tile_variant_groups.json` com o label `"Pedra"` e o preview setado no sprite correto.
3. Editamos `public/tile_catalog.json` para retirar os IDs de pedra (`27, 28, 29, 30`) da lista de membros de grama, criando o pincel de variação separado de ID `9001` (**`Pedra aleatório`**).

---

## 🛡️ 5. Melhores Práticas e Como Evitar Inconsistências

Para evitar problemas de fusão ou desconfiguração de sprites nos catálogos, siga estes princípios de design no Studio:

1. **Grupos de Variação Sem Conflito**:
   * Ao criar sprites de naturezas diferentes (pedras, terra, água, decorações), use nomes de grupos de variação únicos e descritivos no input lateral (ex: `stone`, `wood`, `water_deep`).
   * Para variações normais horizontais que devem rodar independentes, utilize a flag **`☑️ Sem grupo`** marcada; a automação fará o agrupamento seguro baseado no nome do arquivo.
2. **Ciclo Limpo de Correções**:
   * Se exportar um sprite com quantidade de frames errada ou nome incorreto, não tente re-exportar por cima com configurações concorrentes.
   * **Fluxo Recomendado**: Exclua o sprite usando o botão vermelho **`🗑️ Excluir Sprite`** (isso apagará de forma limpa todas as chaves e arquivos JSON), corrija o nome/arquivo original e re-exporte do zero.
3. **Consistência no Recarregamento**:
   * A engine recalcula dinamicamente os catálogos baseando-se em `tile_properties.json` e nos arquivos físicos de PNG toda vez que a página do Studio é recarregada. Caso note qualquer inconsistência de renderização visual, dê um refresh (`F5`) no Studio para recalcular o cache.
   * **Mapas salvos devem permanecer idênticos após F5** — se mudarem, verificar: (1) `loadMapFromJson` recebe `tileRegistry`, (2) células têm `ref`, (3) registry usa `buildTileRegistryAsync()` em ordem de path.

---

## 🗺️ 6. Carregamento Estável de Mapas (`tileRefResolver`)

### Sintoma corrigido
Mapa renderizava tiles diferentes a cada refresh (F5), como se houvesse random na renderização.

### Causa
- IDs numéricos atribuídos na ordem de carregamento assíncrono de imagens (não determinística).
- Loader ignorava `ref` / `tileRefs` e confiava só no `id` do JSON.

### Solução
| Componente | Papel |
|------------|--------|
| `buildTileRegistryAsync()` | Registra tiles em ordem alfabética de path |
| `tileRefResolver.ts` | Resolve `ref` da célula → id atual do registry |
| `loadMapFromJson(..., tileRegistry)` | Obrigatório passar registry após `tileRegistryReady` |
| `reloadTileRegistry()` | Remapeia mapa via snapshot serializado com refs |

### Regra de ouro
**Random (`Math.random`) só em `resolvePaintTileId()` ao pintar com pincel 🎲.** Mapas salvos guardam ids/refs fixos; o `draw()` nunca sorteia variantes.

---

## 🎛️ 7. Calibrador ao Editar Sprite Existente

### Sintoma corrigido
Ao reabrir calibrador de sprite salva, grade aparecia 1×1 ou frames 64×64 incorretos.

### Solução (`mapSpriteCalibration.ts`)
- `inferMapSpriteCalibration()` — infere cols/rows a partir de largura PNG ÷ 32 e `variantStripFrames` em `tile_properties.json`.
- `mapSpriteEditor.ts` sincroniza formulário ao selecionar sprite ou importar PNG.
- Calibrador recebe `initialGridCols` / `initialGridRows` e chama `applyGridDivision()` quando > 1.
- Calibração persistida no save (`frameWidth`, `gridCols`, `sheetLayout`, etc.).

### Multi-seleção (regressão evitada)
- Evento `click` dedicado no canvas do calibrador.
- Drag desativado com multi-select ativo.
- Checkbox resetado ao abrir modal; listeners com `AbortController`.

---

## 🖼️ 8. Paleta Tileset vs Seletor Criar Sprites

| UI | Fonte de dados | Escopo |
|----|----------------|--------|
| Paleta **Tileset** (`#tileSelector`) | Glob Vite `tiles/**/*.png` | Todos os tiles (mapas, escadas, etc.) |
| **Criar Sprites** (`#mapSpriteServerSelect`) | `GET /api/list-map-sprites` | Só `tiles/maps/**/*.png` |

Um PNG em `tiles/maps/grass/01_grama.png` pode aparecer nos dois lugares com rótulos diferentes. **Não é bug** — são listagens distintas.

Chave em `tile_properties.json` = **nome do arquivo sem `.png`** (ex. `01_grama`, não entradas órfãs como `01_grama_randon`).

---

## 🗑️ 9. UI de Exclusão (Criar Sprites)

- Botão **`🗑️ Excluir Sprite`** — `#deleteMapSpriteBtn` em `studio.html`.
- Implementação: `mapSpriteEditor.ts` → `GET /api/sprite-usage` → confirmação → `DELETE /api/delete-map-sprite`.
- Visível apenas quando há sprite selecionado na lista do painel.
- Após exclusão: `reloadTileRegistry()` + refresh da paleta.

> APIs em **`npm run dev`** (proxy Vite → Express) e **`npm run start`** (produção). Reiniciar após mudanças em `server/src/studio/`.

---

## 10. Movimentação Dinâmica de Categorias/Subpastas

O Studio agora suporta a reorganização de pastas diretamente pela interface de forma transparente.

* **Comportamento antigo:** Se você tentasse editar um sprite existente no editor e alterasse a subpasta no campo "Subpasta em tiles/maps", o sistema salvava o metadado no JSON mas a imagem `.png` ficava estagnada na pasta antiga. Isso porque a imagem era enviada como uma URL do servidor e a API exigia Base64.
* **Novo Comportamento (Automático):** A API `POST /api/save-map-sprite` detecta se a imagem enviada é uma URL do servidor contendo `/tiles/`. Se for detectada uma alteração de pasta física de destino, o backend:
  1. Cria recursivamente a nova subpasta se ela não existir.
  2. Copia o arquivo PNG físico para o novo local.
  3. Deleta o PNG na pasta antiga de forma limpa.

Isso elimina a necessidade de mover arquivos pelo sistema operacional ou ter de re-importar o arquivo localmente pelo navegador.

---

## 11. Documentação relacionada

- [studio-improvements-log.md](./studio-improvements-log.md) — log consolidado e checklist de regressão
- [map-format.md](./map-format.md) — formato esparso, resolução por `ref`
- Regra Cursor (agente): `.cursor/rules/studio-map-sprites.mdc`
