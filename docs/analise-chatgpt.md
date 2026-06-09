Agora vamos planejar a versão desktop real do Play, respeitando o sistema atual.

Pelo que analisei no repositório, hoje o play.html ainda tem a estrutura antiga: botão Atributos, status de coordenada/Z, links de trocar personagem/sair, controle de zoom e um painel de atributos fixo com vocação, level, XP, melee, distância, magia, defesa, vida e mana.
O bootstrap.ts já inicializa initPlayMobileHud() antes de iniciar o jogo, então já existe uma camada inicial de HUD mobile/bottom sheet; a nova UI desktop deve evoluir junto, sem quebrar esse fluxo.
O playMobileHud.ts hoje só controla abrir/fechar o painel de atributos em telas pequenas, usando .is-stats-open, backdrop e botão de fechar.
E o play-mobile.css confirma que a intenção atual foi reorganizar o layout em mobile sem alterar canvas nem lógica da engine. Isso é importante: a nova UI também deve ser camada visual sobre o canvas, não mexer na engine.

Objetivo da versão desktop

A versão desktop deve ficar parecida com a imagem que você escolheu:

Topo fixo premium
Canvas grande ocupando quase tudo
Sem painel lateral fixo
Botões principais no topo direito
Mini status do mapa no canto inferior esquerdo
Zoom no canto inferior direito
Painéis abrindo por cima do jogo

A tela principal deve mostrar só o necessário para jogar:

Personagem
Level
HP
MP
XP resumido
Botões: Personagem, Inventário, Mapa, Configurações, Chat
Mapa atual / coordenada / ping
Zoom

O painel lateral de atributos deve virar janela modal, aberta pelo botão Personagem.

Estrutura visual desktop
1. Container principal

A tela do Play deve ser organizada assim:

.play-layout
  .play-hud-top
  .play-viewport
    canvas#gameCanvas
    .play-map-status
    .play-zoom-controls
  .play-panel-layer

Visualmente:

┌────────────────────────────────────────────────────────────┐
│ Avatar Nome Lv.9 | HP MP XP             Personagem Inv ⚙  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                                                            │
│                     CANVAS DO JOGO                         │
│                                                            │
│                                                            │
│ [Rookgaard 39,47 Z0 ping]                    [- 150% +]    │
└────────────────────────────────────────────────────────────┘

Essa estrutura substitui o layout atual com sidebar fixa.

2. Onde cada informação deve ficar
Topo esquerdo — identidade do jogador

Na imagem, o canto superior esquerdo ficou muito bom.

Deve conter:

Avatar circular
Nome do personagem
Vocação + Level

Exemplo:

[Avatar] Meucarinha
         Knight · Level 9

No código, o nome já é atualizado via playCharNameEl, porque o playApp.ts busca o elemento playCharName.
Então você não deve trocar a lógica, só reposicionar o elemento no novo HUD.

HTML sugerido
<div class="play-hud-player">
  <div class="play-hud-avatar">
    <img id="playCharAvatar" src="/ui/avatar-knight.png" alt="" />
  </div>

  <div class="play-hud-player-text">
    <strong id="playCharName">Meucarinha</strong>
    <span>
      <span id="playCharVocation">Knight</span>
      · Level <span id="playHudLevel">9</span>
    </span>
  </div>
</div>

Importante: o avatar pode começar com imagem fixa/fallback. Depois você liga com outfit real.

Topo centro — HP, MP e XP

Hoje HP/MP do jogador não aparecem de forma premium na HUD; os atributos ficam dentro da sidebar. O characterStatsUi.ts já atualiza vocação, level, melee, distance, magic, defense, health, mana, XP e barra de XP através dos IDs statVocation, statLevel, statHealth, statMana, statExp e statExpBarFill.

Você pode reaproveitar essa mesma função depois, mas o ideal é separar:

HUD resumida
Painel completo de personagem

A HUD mostra:

HP 380 / 380
MP 70 / 70
XP 600 / 1700

O painel de personagem mostra os atributos completos.

HTML sugerido
<div class="play-hud-bars">
  <div class="hud-bar-row hud-bar-row--hp">
    <span>HP</span>
    <div class="hud-bar">
      <div id="playHudHpFill" class="hud-bar-fill"></div>
    </div>
    <strong id="playHudHpText">380 / 380</strong>
  </div>

  <div class="hud-bar-row hud-bar-row--mp">
    <span>MP</span>
    <div class="hud-bar">
      <div id="playHudMpFill" class="hud-bar-fill"></div>
    </div>
    <strong id="playHudMpText">70 / 70</strong>
  </div>

  <div class="hud-xp-row">
    <span id="playHudXpText">600 / 1700</span>
  </div>
</div>

No primeiro commit, pode atualizar esses valores junto com updateCharacterStatsUi. Depois você cria uma função separada:

src/game/ui/playHudStatusUi.ts
Topo direito — botões principais

Na imagem escolhida, esses botões estão corretos:

Personagem
Inventário
Mapa
Config.
Chat

Eu manteria exatamente essa ordem:

1. Personagem
2. Inventário
3. Mapa
4. Configurações
5. Chat

Porque é a ordem mental do jogador:

Quem sou eu?
O que tenho?
Onde estou?
Como configuro?
Como falo?
HTML sugerido
<nav class="play-hud-actions" aria-label="Ações do jogo">
  <button class="play-hud-action" data-panel="character">
    <span class="play-hud-action-icon">🧙</span>
    <span>Personagem</span>
  </button>

  <button class="play-hud-action" data-panel="inventory">
    <span class="play-hud-action-icon">🎒</span>
    <span>Inventário</span>
  </button>

  <button class="play-hud-action" data-panel="map">
    <span class="play-hud-action-icon">🗺</span>
    <span>Mapa</span>
  </button>

  <button class="play-hud-action" data-panel="settings">
    <span class="play-hud-action-icon">⚙</span>
    <span>Config.</span>
  </button>

  <button class="play-hud-action" data-panel="chat">
    <span class="play-hud-action-icon">💬</span>
    <span>Chat</span>
  </button>
</nav>

No começo, os botões Mapa e Chat podem abrir painel “em breve”. Mas visualmente eles já ficam no lugar certo.

3. Área do jogo / canvas

O canvas deve ocupar todo o espaço restante abaixo do topo.

.play-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #05070c;
}

#gameCanvas {
  display: block;
  width: 100%;
  height: 100%;
}

Atenção: você precisa cuidar para não distorcer o canvas. Se hoje o playApp.ts controla tamanho interno do canvas, o CSS não pode brigar com isso. Primeiro ajuste visual, depois testar se o resize continua correto.

4. Canto inferior esquerdo — status do mapa

Na imagem escolhida, o status no canto inferior esquerdo ficou bom:

Rookgaard
39, 47, Z0     34ms

Hoje o sistema já usa elementos de status:

statusPos
statusZ
statusMapName

O playApp.ts busca statusPosEl, statusZEl e statusMapNameEl, então você deve manter esses IDs.

HTML sugerido
<div class="play-map-status">
  <strong id="statusMapName">Rookgaard</strong>

  <div class="play-map-status-row">
    <span>
      <span id="statusPos">39, 47</span>,
      <span id="statusZ">Z 0</span>
    </span>

    <span class="play-ping">
      <span class="play-ping-dot"></span>
      <span id="playPingText">34 ms</span>
    </span>
  </div>
</div>

O ping pode começar como mock/oculto se ainda não tiver medição real. Mas o espaço já fica preparado.

Importante: coordenada deve ter opção de esconder futuramente em configurações. Para jogador comum, pode ser útil, mas não precisa ser obrigatório.

5. Canto inferior direito — zoom

O zoom atual já existe no play.html como:

− 100% +

E o play-mobile.css já estiliza .play-zoom-controls em mobile.

Então aqui a regra é: não recriar a lógica, só reposicionar e melhorar visual.

HTML sugerido
<div class="play-zoom-controls">
  <button id="zoomOutBtn" type="button">−</button>
  <span id="playZoomLabel">150%</span>
  <button id="zoomInBtn" type="button">+</button>
</div>

Se os IDs atuais forem outros, mantenha os atuais. Não vale quebrar o TypeScript só para trocar nome.

6. Painel de personagem / atributos

Esse painel substitui a sidebar lateral atual.

Deve abrir ao clicar em Personagem.

Desktop: modal flutuante à direita ou centro-direita.
Mobile: bottom sheet, aproveitando a lógica atual de playMobileHud.ts.

Conteúdo:

Avatar
Nome
Vocação · Level
HP
MP
XP
Melee
Distância
Magia
Defesa
Vida máxima
Mana máxima

Os IDs antigos precisam continuar existindo ou serem mapeados:

statVocation
statLevel
statExp
statExpBarFill
statMelee
statDistance
statMagic
statDefense
statHealth
statMana

Porque characterStatsUi.ts atualiza exatamente esses IDs.

HTML sugerido
<section
  id="characterPanel"
  class="play-panel play-panel--character"
  data-panel-name="character"
  hidden
>
  <header class="play-panel-header">
    <h2>Personagem / Atributos</h2>
    <button class="play-panel-close" data-close-panel>×</button>
  </header>

  <div class="character-panel-summary">
    <div class="character-panel-avatar">
      <img src="/ui/avatar-knight.png" alt="" />
    </div>

    <div>
      <strong id="characterPanelName">Meucarinha</strong>
      <span>
        <span id="statVocation">KNIGHT</span>
        · Level <span id="statLevel">9</span>
      </span>
    </div>
  </div>

  <div class="character-panel-bars">
    <div>HP <strong id="statHealth">380</strong></div>
    <div>MP <strong id="statMana">70</strong></div>
    <div>
      XP <strong id="statExp">600 / 1700 XP</strong>
      <div class="stat-exp-bar">
        <div id="statExpBarFill"></div>
      </div>
    </div>
  </div>

  <div class="character-stat-list">
    <div><span>Melee</span><strong id="statMelee">34</strong></div>
    <div><span>Distância</span><strong id="statDistance">6</strong></div>
    <div><span>Magia</span><strong id="statMagic">34</strong></div>
    <div><span>Defesa</span><strong id="statDefense">26</strong></div>
  </div>
</section>
7. Painel de inventário

O inventário ainda pode começar visual, mesmo que o sistema completo de itens venha depois.

Desktop: painel à direita.
Mobile: bottom sheet/tela cheia.

Estrutura:

Inventário
  Equipamento
  Bolsa
  Moedas / Capacidade
Slots de equipamento
Capacete
Amuleto
Armadura
Mão esquerda
Mão direita
Anel
Calça
Bota
Mochila
Bolsa

Desktop:

6 colunas

Mobile:

4 colunas
HTML estrutural
<section
  id="inventoryPanel"
  class="play-panel play-panel--inventory"
  data-panel-name="inventory"
  hidden
>
  <header class="play-panel-header">
    <h2>Inventário</h2>
    <button class="play-panel-close" data-close-panel>×</button>
  </header>

  <h3>Equipamento</h3>
  <div class="equipment-grid">
    <button class="equipment-slot" data-slot="helmet"></button>
    <button class="equipment-slot" data-slot="armor"></button>
    <button class="equipment-slot" data-slot="amulet"></button>
    <button class="equipment-slot" data-slot="left-hand"></button>
    <button class="equipment-slot" data-slot="right-hand"></button>
    <button class="equipment-slot" data-slot="legs"></button>
    <button class="equipment-slot" data-slot="boots"></button>
    <button class="equipment-slot" data-slot="backpack"></button>
  </div>

  <h3>Bolsa</h3>
  <div class="bag-grid">
    <button class="bag-slot"></button>
    <button class="bag-slot"></button>
    <button class="bag-slot"></button>
    <button class="bag-slot"></button>
  </div>

  <footer class="inventory-footer">
    <span>🪙 12,450</span>
    <span>156 / 300</span>
  </footer>
</section>

No primeiro momento, os slots podem ficar vazios. Não precisa inventar item fake com lógica.

8. Painel de configurações

O botão Config. deve abrir um painel grande.

A estrutura deve ser por abas:

Jogo
Controles
Vídeo
Áudio
Conta

No desktop, painel central/direita.
No mobile, bottom sheet.

Opções iniciais

Comece com opções locais em localStorage:

Mostrar nomes dos jogadores
Mostrar nomes dos monstros
Mostrar barras de vida
Mostrar dano flutuante
Mostrar coordenadas
Auto atacar ao clicar no alvo
Confirmar antes de sair
Zoom padrão
Qualidade de efeitos
Mostrar FPS / Ping

Não precisa ir para banco agora.

HTML estrutural
<section
  id="settingsPanel"
  class="play-panel play-panel--settings"
  data-panel-name="settings"
  hidden
>
  <header class="play-panel-header">
    <h2>Configurações</h2>
    <button class="play-panel-close" data-close-panel>×</button>
  </header>

  <div class="settings-tabs">
    <button data-settings-tab="game" aria-selected="true">Jogo</button>
    <button data-settings-tab="controls">Controles</button>
    <button data-settings-tab="video">Vídeo</button>
    <button data-settings-tab="audio">Áudio</button>
    <button data-settings-tab="account">Conta</button>
  </div>

  <div class="settings-section" data-settings-section="game">
    <label>
      <span>Mostrar nomes dos jogadores</span>
      <input type="checkbox" data-setting="showPlayerNames" checked />
    </label>

    <label>
      <span>Mostrar nomes dos monstros</span>
      <input type="checkbox" data-setting="showMonsterNames" checked />
    </label>

    <label>
      <span>Mostrar coordenadas</span>
      <input type="checkbox" data-setting="showCoordinates" />
    </label>
  </div>
</section>
9. Painel de mapa

O botão Mapa pode começar simples.

Conteúdo inicial:

Mapa atual: Rookgaard
Coordenadas
Z
Instância, se existir
Botão centralizar jogador

Futuramente vira minimap real.

Primeira versão
<section
  id="mapPanel"
  class="play-panel play-panel--map"
  data-panel-name="map"
  hidden
>
  <header class="play-panel-header">
    <h2>Mapa</h2>
    <button class="play-panel-close" data-close-panel>×</button>
  </header>

  <div class="map-panel-placeholder">
    <strong id="mapPanelName">Rookgaard</strong>
    <span id="mapPanelCoords">39, 47, Z 0</span>
    <button type="button">Centralizar jogador</button>
  </div>
</section>
10. Painel de chat

Não precisa implementar chat completo agora.

Mas o botão deve existir para manter o layout final.

Primeira versão:

Chat em breve

Depois você adiciona:

Local
Global
Guild
Party
Privado
Log de combate
11. Arquivos que eu criaria

Respeitando a estrutura atual, eu faria dentro de src/game.

src/game/ui/playHud.ts
src/game/ui/playHudPanels.ts
src/game/ui/playHudSettings.ts
src/game/ui/playHudInventory.ts
src/game/ui/playHudStatusUi.ts

CSS:

src/game/play-desktop-hud.css
src/game/play-panels.css
src/game/play-inventory.css
src/game/play-settings.css

E manteria:

src/game/play-mobile.css
src/game/playMobileHud.ts

Mas depois você pode renomear playMobileHud.ts, porque ele não vai cuidar só de atributos. Por enquanto, para não quebrar, eu manteria.

12. Alteração no play.html

Hoje o play.html é muito enxuto e contém a sidebar de atributos.
A nova estrutura deveria ficar mais ou menos assim:

<body>
  <div class="play-layout">
    <header class="play-hud-top">
      <div class="play-hud-player">
        ...
      </div>

      <div class="play-hud-bars">
        ...
      </div>

      <nav class="play-hud-actions">
        ...
      </nav>
    </header>

    <main class="play-viewport">
      <canvas id="gameCanvas"></canvas>

      <div class="play-map-status">
        ...
      </div>

      <div class="play-zoom-controls">
        ...
      </div>
    </main>

    <div id="playPanelBackdrop" class="play-panel-backdrop" hidden></div>

    <div class="play-panel-layer">
      <section id="characterPanel">...</section>
      <section id="inventoryPanel">...</section>
      <section id="settingsPanel">...</section>
      <section id="mapPanel">...</section>
      <section id="chatPanel">...</section>
    </div>

    <div id="loadingOverlay">Carregando mundo…</div>
  </div>

  <script type="module" src="/src/game/bootstrap.ts"></script>
</body>
13. CSS base da versão desktop
.play-layout {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #070a11;
  color: #f8fafc;
  overflow: hidden;
}

.play-hud-top {
  height: 72px;
  flex: 0 0 72px;
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(360px, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 10px 18px;
  background:
    linear-gradient(180deg, rgba(19, 23, 34, 0.96), rgba(10, 13, 20, 0.94));
  border-bottom: 1px solid rgba(255, 214, 89, 0.22);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  z-index: 20;
}

.play-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #05070c;
}

.play-hud-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.play-hud-action {
  width: 72px;
  height: 54px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(18, 22, 31, 0.88);
  color: #e5e7eb;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}

.play-hud-action:hover {
  border-color: rgba(255, 214, 89, 0.55);
  background: rgba(31, 37, 52, 0.95);
}

.play-map-status {
  position: absolute;
  left: 18px;
  bottom: 18px;
  min-width: 180px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(8, 10, 15, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
}

.play-zoom-controls {
  position: absolute;
  right: 18px;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(8, 10, 15, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
14. Sistema de painéis

Eu criaria um controlador genérico:

src/game/ui/playHudPanels.ts

Responsabilidade:

Abrir painel
Fechar painel
Fechar ao clicar fora
Fechar com ESC
Garantir só um painel aberto por vez
Marcar botão ativo
Código conceitual
type PlayPanelName = 'character' | 'inventory' | 'settings' | 'map' | 'chat';

export function initPlayHudPanels(): void {
  const buttons = document.querySelectorAll<HTMLElement>('[data-panel]');
  const panels = document.querySelectorAll<HTMLElement>('[data-panel-name]');
  const backdrop = document.getElementById('playPanelBackdrop');

  function closePanels(): void {
    panels.forEach((panel) => {
      panel.hidden = true;
      panel.classList.remove('is-open');
    });

    buttons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-expanded', 'false');
    });

    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('play-panel-open');
  }

  function openPanel(name: string): void {
    closePanels();

    const panel = document.querySelector<HTMLElement>(`[data-panel-name="${name}"]`);
    const button = document.querySelector<HTMLElement>(`[data-panel="${name}"]`);

    if (!panel) return;

    panel.hidden = false;
    panel.classList.add('is-open');

    button?.classList.add('is-active');
    button?.setAttribute('aria-expanded', 'true');

    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('play-panel-open');
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.panel;
      if (!name) return;

      const panel = document.querySelector<HTMLElement>(`[data-panel-name="${name}"]`);
      if (panel && !panel.hidden) {
        closePanels();
      } else {
        openPanel(name);
      }
    });
  });

  document.querySelectorAll('[data-close-panel]').forEach((button) => {
    button.addEventListener('click', closePanels);
  });

  backdrop?.addEventListener('click', closePanels);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanels();
  });
}

Depois, no bootstrap.ts, adicionar:

import { initPlayHudPanels } from './ui/playHudPanels';

initPlayMobileHud();
initPlayHudPanels();

Cuidado: como bootstrap.ts está minificado em uma linha no raw, vale formatar antes para facilitar manutenção.

15. Responsividade sem quebrar mobile

A regra:

Desktop: painéis flutuantes
Mobile: painéis bottom sheet

Você já tem a ideia de bottom sheet em play-mobile.css, usando .sidebar fixa embaixo quando .is-stats-open está ativa.
A nova versão deve generalizar isso para todos os painéis.

Desktop:

@media (min-width: 769px) {
  .play-panel {
    position: fixed;
    top: 88px;
    right: 22px;
    width: min(420px, calc(100vw - 44px));
    max-height: calc(100vh - 110px);
    overflow: auto;
    z-index: 50;
    border-radius: 18px;
  }

  .play-panel--settings {
    width: min(620px, calc(100vw - 44px));
  }
}

Mobile:

@media (max-width: 768px) {
  .play-panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: min(78vh, 620px);
    overflow: auto;
    z-index: 60;
    border-radius: 18px 18px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
16. Etapas de implementação
Commit 1 — preparar estrutura visual do desktop

Alterar:

play.html
src/game/play-desktop-hud.css
src/game/bootstrap.ts

Objetivo:

Criar topo novo
Manter canvas funcionando
Manter zoom
Manter mapa/coordenada
Não mexer ainda em inventário/configurações

Resultado esperado:

Sidebar ainda pode existir escondida
HUD desktop nova visível
Jogo continua entrando normal
Commit 2 — transformar atributos em painel

Alterar:

play.html
src/game/ui/playHudPanels.ts
src/game/play-panels.css
src/game/ui/characterStatsUi.ts, se necessário

Objetivo:

Remover painel lateral fixo
Abrir atributos pelo botão Personagem
Manter IDs que updateCharacterStatsUi já usa

Teste:

Entrar no mundo
Clicar Personagem
Ver vocação, level, XP e atributos
Fechar com X
Fechar clicando fora
Fechar com ESC
Commit 3 — inventário visual

Alterar:

play.html
src/game/play-inventory.css
src/game/ui/playHudInventory.ts

Objetivo:

Criar painel visual de inventário
Slots de equipamento
Grid de bolsa
Estado vazio
Sem persistência ainda
Commit 4 — configurações locais

Alterar:

play.html
src/game/play-settings.css
src/game/ui/playHudSettings.ts

Objetivo:

Criar painel de configurações
Salvar preferências no localStorage
Controlar visibilidade de coordenadas, nomes, barras, FPS/Ping futuramente

Primeiras chaves:

elarion.play.showCoordinates
elarion.play.showPlayerNames
elarion.play.showMonsterNames
elarion.play.showHealthBars
elarion.play.showFloatingDamage
elarion.play.defaultZoom
Commit 5 — mapa/chat placeholder

Alterar:

play.html
src/game/ui/playHudPanels.ts
src/game/play-panels.css

Objetivo:

Botão Mapa abre painel simples
Botão Chat abre painel "em breve"
Commit 6 — polimento visual

Alterar:

src/game/play-desktop-hud.css
src/game/play-mobile.css
src/style.css, somente se necessário

Objetivo:

Sombras
Bordas
Hover
Animações leves
Safe-area
Breakpoints
17. O que não fazer agora

Não misture esse trabalho com:

Sistema real de inventário no banco
Drag and drop
Servidor de item/equipamento
Chat real via WebSocket
Minimap completo
Skills/magias
Marketplace

Agora é UI/estrutura. Se misturar com sistema real, o commit fica grande e perigoso.

18. Checklist de validação

Depois de implementar, testar:

Desktop 1366x768
Desktop 1600x900
Desktop 1920x1080
Electron window maximizada
Electron window reduzida
Chrome normal
Entrar no mundo
Trocar personagem
Sair
Zoom + e -
Abrir/fechar Personagem
Abrir/fechar Inventário
Abrir/fechar Configurações
ESC fecha painel
Clique fora fecha painel
Canvas não perde foco
Movimento continua funcionando
Combate continua funcionando
Loading continua aparecendo
Conclusão

O caminho estrutural certo é:

1. Tirar a sidebar fixa
2. Criar HUD desktop superior
3. Reaproveitar IDs atuais de status/atributos
4. Transformar atributos em painel
5. Adicionar inventário/configurações como painéis
6. Manter tudo como camada visual sobre o canvas

A versão desktop deve ficar assim:

Topo:
Avatar + Nome + Vocação/Level
HP/MP/XP
Personagem | Inventário | Mapa | Config. | Chat

Centro:
Canvas limpo

Inferior esquerdo:
Mapa, coordenada, ping

Inferior direito:
Zoom

Painéis:
Abrem sobre o jogo, nunca ocupam espaço fixo lateral

Esse plano respeita a estrutura atual do projeto e evita o erro de criar uma UI bonita, mas desconectada do que o playApp.ts, bootstrap.ts, characterStatsUi.ts e playMobileHud.ts já fazem hoje.