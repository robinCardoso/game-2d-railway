# 🗺️ Planejamento: Calibrador Visual Avançado (Com Zoom e Painel Completo)

Este plano descreve a evolução do nosso modal de calibração para se tornar um estúdio de animação completo. O Administrador terá tudo que precisa em uma única tela: visualização inteira da spritesheet, controles de zoom interativo e todas as configurações de personagem organizadas em painéis no próprio modal.

---

## 🎨 1. Nova Interface de Usuário (UI Layout Duas Colunas)

O Modal será redesenhado com um layout moderno de duas colunas (estilo Adobe/Unity):

```
+-------------------------------------------------------------------------+
| 🔍 Estúdio Visual de Calibragem & Animação                          [X] |
| ----------------------------------------------------------------------- |
|  [ COLUNA DA ESQUERDA: CANVAS E ZOOM ]    | [ COLUNA DA DIREITA: PAINEL ]|
|  +--------------------------------------+ | 🎛️ GRADE DE FATIAMENTO      |
|  |                                      | | Largura: [ 176 ] Altura: [ 192 ]|
|  |      (Canvas da Spritesheet)         | | Margem X: [ 33 ] Margem Y: [ 39 ]|
|  |                                      | | Gaps X: [ 0 ]   Gaps Y: [ 0 ]   |
|  +--------------------------------------+ | ----------------------------|
|  🔍 Zoom: ---[ 100% ]--- [x2] [x4]      | | ⚓ AJUSTE DE PIVOT/ÂNCORA   |
|                                         | | Âncora X: [ 0 ]  Âncora Y: [ 0 ] |
|                                         | | ----------------------------|
|                                         | | 🏃‍♂️ CONFIGURAÇÃO DE ANIMAÇÕES|
|                                         | | Estado: [ Walk  v ] Dir: [ Down]|
|                                         | | Frame Inicial: [ 0 ]            |
|                                         | | Qtd Frames: [ 8 ] FPS: [ 8 ]    |
| ----------------------------------------------------------------------- |
| [ Cancelar ]                                                [ Confirmar ]|
+-------------------------------------------------------------------------+
```

### 🎯 Benefícios para a Praticidade do ADM:
1.  **Zoom Interativo (Visualização Sem Barreiras):** O ADM pode dar zoom-out para ver a imagem inteira (bom para sheets gigantes) ou zoom-in de até 300% para posicionar a grade vermelha com precisão cirúrgica de 1 pixel.
2.  **Centralização Única de Ações (Tudo em Um):** O ADM não precisa ficar abrindo e fechando o modal. Ele pode alterar o tamanho do frame, ajustar a âncora, definir os frames da animação de ataque/caminhada e testar tudo na mesma tela.

---

## 🏗️ 2. Arquivos e Modificações

*   `[MODIFY]` [characterCalibratorModal.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/editor/characterCalibratorModal.ts):
    *   Suportar a escala visual de `zoom` (ajustando a largura/altura CSS do Canvas).
    *   Sincronizar em tempo real as inputs do painel lateral com o renderizador de grade vermelha.
*   `[MODIFY]` [index.html](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/index.html):
    *   Redesenhar o modal HTML do Calibrador com a estrutura de duas colunas, inserindo todos os inputs organizados por categorias/submenus.
*   `[MODIFY]` [style.css](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/style.css):
    *   Estilizar o layout de duas colunas do modal com responsividade e estética moderna (flexbox, inputs organizados).
*   `[MODIFY]` [characterEditor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/editor/characterEditor.ts):
    *   Enviar todas as configurações adicionais (estados, frames, âncoras) para o modal de calibração ao ser inicializado.
