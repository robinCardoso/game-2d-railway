# 🗺️ Planejamento: Sistema de Animação e Customização de Personagens (Estilo GameMaker)

Este plano descreve a arquitetura técnica, organização de arquivos e design de interface (UI) para um sistema completo de sprites, direções, animações e estados de personagens integrado ao nosso motor 2D.

---

## 🏗️ 1. Arquitetura do Sistema e Organização de Arquivos

Para implementar esse sistema de forma modular, usaremos a seguinte estrutura de arquivos dentro de `src/character/`:

### Novas Pastas e Arquivos

*   `[NEW]` [spriteAnimation.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/character/spriteAnimation.ts): Gerencia o estado atual da animação, contagem de frames (ticks), cálculo de velocidade de reprodução e mapeamento de frames da spritesheet.
*   `[NEW]` [characterSerializer.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/character/characterSerializer.ts): Responsável por importar/exportar as configurações do personagem em formato JSON e carregar assets de imagem.
*   `[NEW]` [characterEditor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/editor/characterEditor.ts): Arquivo contendo a interface de usuário (UI) e controle interativo para criar e editar as animações de spritesheets.

### Modificações no Core da Engine
*   `[MODIFY]` [main.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/main.ts): Integração do renderizador de spritesheets animadas no lugar do desenho estático do knight (`TILE_TYPES[6]`), além de acoplar os botões da nova aba da UI.

---

## 💾 2. Formato de Salvamento (JSON Schema)

Os personagens serão salvos como arquivos `.json` estruturados. Isso permite carregá-los dinamicamente tanto no editor quanto na própria engine de jogo.

**Caminho sugerido:** `public/characters/hero.json` (ou exportados localmente).

```json
{
  "name": "Player Knight",
  "spriteSheetUrl": "tiles/characters/knight_sheet.png",
  "frameWidth": 64,
  "frameHeight": 64,
  "defaultDirection": "down",
  "animations": {
    "idle_up":    { "row": 0, "frames": 1, "speedFps": 1,   "loop": true },
    "idle_down":  { "row": 1, "frames": 1, "speedFps": 1,   "loop": true },
    "idle_left":  { "row": 2, "frames": 1, "speedFps": 1,   "loop": true },
    "idle_right": { "row": 3, "frames": 1, "speedFps": 1,   "loop": true },
    
    "walk_up":    { "row": 4, "frames": 4, "speedFps": 8,   "loop": true },
    "walk_down":  { "row": 5, "frames": 4, "speedFps": 8,   "loop": true },
    "walk_left":  { "row": 6, "frames": 4, "speedFps": 8,   "loop": true },
    "walk_right": { "row": 7, "frames": 4, "speedFps": 8,   "loop": true },
    
    "attack_up":    { "row": 8, "frames": 6, "speedFps": 12, "loop": false },
    "attack_down":  { "row": 9, "frames": 6, "speedFps": 12, "loop": false },
    "attack_left":  { "row": 10, "frames": 6, "speedFps": 12, "loop": false },
    "attack_right": { "row": 11, "frames": 6, "speedFps": 12, "loop": false }
  }
}
```

---

## 🎨 3. Design da Interface de Usuário (UI do Editor)

Para configurar sprites com a facilidade do GameMaker, propomos uma **Aba de Editor de Personagens** integrada à UI existente com as seguintes sessões:

1.  **Painel de Importação & Configuração Geral:**
    *   Input para fazer upload ou selecionar o arquivo de imagem (Spritesheet PNG).
    *   Campos numéricos para definir `Largura do Frame` e `Altura do Frame` (ex: 32x32, 64x64).
    *   Um botão para Importar/Exportar o JSON do Personagem.
2.  **Painel de Visualização & Timeline:**
    *   Um mini-canvas mostrando o sprite selecionado em tempo real.
    *   Controles de reprodução: Play, Pause, e um slider de **Velocidade de Animação (FPS)**.
    *   Visualização da grade (Grid) da Spritesheet fatiada para ver se as dimensões estão certas.
3.  **Painel de Mapeamento de Estados/Direções:**
    *   Dropdown para escolher qual animação configurar (ex: `walk_down`).
    *   Definição de qual **Linha (Row)** da spritesheet essa animação pertence e **Quantidade de Frames**.

```
+------------------------------------------------------------+
|  [Mapa do Jogo]            |  PAINEL EDITOR DE PERSONAGEM   |
|                            | ------------------------------ |
|                            |  [ Carregar Spritesheet PNG ]  |
|                            |  Frame: [ 64 ] W x [ 64 ] H    |
|                            | ------------------------------ |
|                            |  ESTADO ATIVO:                 |
|                            |  [ Walk  v ]  Direção: [ Down] |
|                            |  Linha: [ 5 ]  Nº Frames: [ 4 ]|
|                            | ------------------------------ |
|                            |  PREVIEW DA ANIMAÇÃO:          |
|                            |        +------------+          |
|                            |        |   (🚶‍♂️...)  |          |
|                            |        +------------+          |
|                            |  Velocidade: ----[ 8 FPS ]--   |
|                            | ------------------------------ |
|                            |  [ Salvar Personagem (JSON) ]  |
+------------------------------------------------------------+
```

---

## 🛡️ 4. O Que Não Pode Faltar (Requisitos Críticos)

*   **Sincronização de Velocidade de Movimento com Animação:** A animação de caminhada (`walk`) deve se mover na velocidade proporcional ao `stepDurationMs` calculado na engine. Se o personagem está com o buff *Haste*, as pernas devem mover-se mais rapidamente!
*   **Tratamento de Transições de Estado:** Ao parar de andar, o estado do personagem deve transitar imediatamente para `idle` na mesma direção em que ele estava olhando. Ao iniciar um ataque, a movimentação é pausada ou integrada de forma suave.
*   **Prevenção de Glitches no Canvas:** Evitar renderizar imagens que ainda não foram totalmente carregadas (usar `.complete` ou controle de promises).
