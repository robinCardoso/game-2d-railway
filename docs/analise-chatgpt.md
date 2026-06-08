Sim. Agora a página de selecionar personagem precisa ser feita com muito cuidado, porque ela já tem uma lógica importante: ela não mostra uma imagem fixa qualquer. Ela carrega os personagens reais da conta, pega o outfitConfig.spriteSheetUrl salvo no personagem e desenha o preview no canvas usando o JSON real da sprite. Isso precisa ser preservado. O arquivo atual src/characters/roster.ts já usa requireAuth, listCharacters, markCharacterPlayed, softDeleteCharacter, getProfile, enforceDesktopVersionGate e drawCharacterPreview para renderizar o personagem e entrar no play.html?characterId=....

A implementação ideal aqui é: trocar o layout e o CSS, mas preservar o fluxo de dados e entrada no jogo.

1. O que não pode mudar

Esses pontos são sensíveis e eu não mexeria:

requireAuth()
listCharacters(session.userId)
markCharacterPlayed(selectedId, session.userId)
sessionStorage.setItem('activeCharacterId', selectedId)
location.href = `play.html?characterId=${encodeURIComponent(selectedId)}`
softDeleteCharacter(selectedId, session.userId)
getProfile() para esconder/mostrar GM Studio
enforceDesktopVersionGate() antes de entrar no mundo
drawCharacterPreview()

O tipo CharacterRow também já carrega dados importantes para essa tela: id, name, outfitConfig, spawnMapId, lastPlayedAt, vocation, level, experience, gender, appearance, gameId, mapId, position e direction. Então a tela nova deve usar esses campos, não inventar uma estrutura paralela.

Principalmente este trecho conceitual precisa continuar existindo:

c.outfitConfig?.spriteSheetUrl ||
`tiles/characters/vocations/${c.gender || 'male'}/${c.vocation || 'knight'}.png`

Porque isso garante que o sistema use o outfit real salvo no personagem, mas ainda tenha fallback caso algum personagem antigo não tenha outfitConfig completo.

2. O que vamos mudar

Vamos mudar:

visual da página
HTML de characters.html
CSS próprio da página
cards dos personagens
preview grande do personagem selecionado
estado vazio
estado loading
estado erro
botões no padrão RPG

Mas vamos preservar:

IDs usados pelo roster.ts
funções de autenticação
carregamento real dos personagens
desenho real da sprite
entrada no mundo
exclusão
logout
GM Studio
3. Assets necessários

Eu criaria estes arquivos:

public/assets/characters/bg-roster.webp
public/assets/ui/panel-corner-gold.svg
public/assets/ui/icon-play.svg
public/assets/ui/icon-plus.svg
public/assets/ui/icon-trash.svg
public/assets/ui/icon-logout.svg
public/assets/ui/icon-user.svg
public/assets/brand/elarion-logo.png

Você já tem o padrão de borda/canto das páginas de login e registro, então deve reaproveitar o mesmo panel-corner-gold.svg se ele já existe. Não gere tudo de novo se o asset já está bom.

A imagem de fundo da seleção deve ser algo como:

salão medieval escuro
paredes de pedra
tochas
banners azuis/dourados
área central vazia para o painel
sem texto
sem logo
sem botão

Nome sugerido:

public/assets/characters/bg-roster.webp
4. Estrutura final da página

Visualmente, a tela deve ficar assim:

┌─────────────────────────────────────────────────────────┐
│ Logo Elarion Online                 Conta | Studio | Sair │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Selecione seu personagem                               │
│  Escolha um herói para entrar no mundo de Elarion.       │
│                                                         │
│  ┌──────────────────────────┐ ┌───────────────────────┐ │
│  │ Lista de personagens     │ │ Preview selecionado   │ │
│  │                          │ │                       │ │
│  │ [sprite] Arthan          │ │      [canvas grande]  │ │
│  │ Knight · Level 12        │ │                       │ │
│  │ Último acesso: Hoje      │ │ Nome: Arthan          │ │
│  │                          │ │ Vocação: Knight       │ │
│  │ [sprite] Lyra            │ │ Level: 8              │ │
│  │ Mage · Level 8           │ │ Localização: mapa     │ │
│  │                          │ │                       │ │
│  │ + Criar personagem       │ │ [Entrar no Mundo]     │ │
│  └──────────────────────────┘ │ [Excluir]             │ │
│                               └───────────────────────┘ │
└─────────────────────────────────────────────────────────┘

No mobile, vira:

Logo
Selecione seu personagem

[Card personagem]
[Card personagem]
[Card criar novo]

[Preview selecionado]
[Entrar no Mundo]
5. IDs que precisam existir no HTML

O roster.ts atual procura elementos por ID. Então o novo characters.html precisa manter estes IDs:

rosterError
charGrid
emptyState
enterWorldBtn
deleteCharBtn
accountEmail
studioLink
logoutBtn

Eu recomendo adicionar novos IDs para melhorar o preview sem quebrar nada:

selectedName
selectedVocation
selectedLevel
selectedGender
selectedMap
selectedLastPlayed
selectedPreviewCanvas
selectedDetails
noSelectionState
rosterLoading

Esses novos IDs são opcionais, mas ajudam muito a deixar a página profissional.

6. Novo characters.html

Substitua o HTML atual por algo nessa linha:

<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Selecionar personagem — Elarion Online</title>
    <meta
      name="description"
      content="Selecione seu personagem e entre no mundo de Elarion Online."
    />
  </head>

  <body class="roster-page">
    <main class="roster-shell">
      <header class="roster-topbar">
        <a class="roster-brand" href="index.html" aria-label="Elarion Online">
          <img
            src="assets/brand/elarion-logo.png"
            alt="Elarion Online"
            class="roster-brand__logo"
          />
        </a>

        <div class="roster-account">
          <span class="roster-account__email" id="accountEmail"></span>

          <a id="studioLink" class="roster-toplink" href="studio.html">
            GM Studio
          </a>

          <button id="logoutBtn" class="roster-toplink roster-toplink--button" type="button">
            Sair
          </button>
        </div>
      </header>

      <section class="roster-panel">
        <span class="panel-corner panel-corner--tl"></span>
        <span class="panel-corner panel-corner--tr"></span>
        <span class="panel-corner panel-corner--br"></span>
        <span class="panel-corner panel-corner--bl"></span>

        <div class="roster-heading">
          <p class="roster-kicker">Elarion Online</p>
          <h1>Selecione seu personagem</h1>
          <p>Escolha um herói para entrar no mundo de Elarion.</p>
        </div>

        <p id="rosterError" class="roster-error" hidden></p>

        <div id="rosterLoading" class="roster-loading">
          Carregando seus personagens...
        </div>

        <div class="roster-layout">
          <section class="roster-list-panel" aria-label="Lista de personagens">
            <div class="roster-list-header">
              <div>
                <strong>Personagens</strong>
                <span>Selecione um personagem</span>
              </div>

              <a class="roster-create-small" href="characters-new.html">
                + Novo
              </a>
            </div>

            <div id="emptyState" class="roster-empty" hidden>
              <h2>Sua jornada ainda não começou.</h2>
              <p>
                Crie seu primeiro personagem e descubra os reinos de Elarion.
              </p>
              <a class="game-button" href="characters-new.html">
                Criar personagem
              </a>
            </div>

            <div id="charGrid" class="roster-character-list"></div>
          </section>

          <aside class="roster-preview-panel" aria-label="Personagem selecionado">
            <div id="noSelectionState" class="roster-no-selection">
              <h2>Nenhum personagem selecionado</h2>
              <p>Escolha um personagem na lista para visualizar detalhes.</p>
            </div>

            <div id="selectedDetails" class="roster-selected" hidden>
              <div class="roster-preview-frame">
                <canvas
                  id="selectedPreviewCanvas"
                  class="roster-preview-canvas"
                  width="160"
                  height="160"
                ></canvas>
              </div>

              <h2 id="selectedName">-</h2>

              <div class="roster-info-grid">
                <div>
                  <span>Vocação</span>
                  <strong id="selectedVocation">-</strong>
                </div>

                <div>
                  <span>Level</span>
                  <strong id="selectedLevel">-</strong>
                </div>

                <div>
                  <span>Gênero</span>
                  <strong id="selectedGender">-</strong>
                </div>

                <div>
                  <span>Mapa</span>
                  <strong id="selectedMap">-</strong>
                </div>

                <div class="roster-info-grid__wide">
                  <span>Último acesso</span>
                  <strong id="selectedLastPlayed">-</strong>
                </div>
              </div>

              <div class="roster-actions">
                <button id="enterWorldBtn" class="game-button" type="button" disabled>
                  Entrar no mundo
                </button>

                <button
                  id="deleteCharBtn"
                  class="game-button game-button--danger"
                  type="button"
                  disabled
                >
                  Excluir
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>

    <script type="module" src="/src/characters/roster.ts"></script>
  </body>
</html>

Observação importante: eu mantive o script atual:

<script type="module" src="/src/characters/roster.ts"></script>

Se no Electron algum asset não carregar, você pode trocar imagens para caminho relativo, como já fez nas outras telas:

src="assets/brand/elarion-logo.png"
7. Criar CSS próprio da tela

Crie:

src/characters/roster.css

E no topo do roster.ts, troque:

import '../shared/shell.css';

por:

import './roster.css';

Se quiser manter alguma base global, no CSS você pode importar o estilo compartilhado:

@import '../style.css';

Eu não importaria shell.css aqui, porque ele ainda tem estilos simples de .shell-page, .shell-card, .char-card etc. Melhor a seleção de personagem ter seu próprio CSS, igual fizemos com login/registro.

8. src/characters/roster.css

Use algo assim como base:

@import '../style.css';

:root {
  --eo-bg: #05070c;
  --eo-panel: rgba(8, 12, 20, 0.9);
  --eo-panel-soft: rgba(12, 18, 30, 0.78);
  --eo-border: rgba(216, 170, 79, 0.38);
  --eo-border-strong: rgba(245, 209, 125, 0.7);
  --eo-gold: #d8aa4f;
  --eo-gold-light: #f5d17d;
  --eo-blue: #35c8ff;
  --eo-red: #b83a3a;
  --eo-text: #f8efd8;
  --eo-muted: #a9b1c3;
}

* {
  box-sizing: border-box;
}

body.roster-page {
  margin: 0;
  min-height: 100vh;
  color: var(--eo-text);
  background:
    radial-gradient(circle at 50% 35%, rgba(53, 200, 255, 0.08), transparent 32%),
    linear-gradient(90deg, rgba(2, 4, 9, 0.86), rgba(2, 4, 9, 0.42), rgba(2, 4, 9, 0.88)),
    url("/assets/characters/bg-roster.webp");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.roster-shell {
  min-height: 100vh;
  padding: 24px clamp(16px, 4vw, 56px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.roster-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
}

.roster-brand {
  display: inline-flex;
  align-items: center;
}

.roster-brand__logo {
  width: min(220px, 48vw);
  max-height: 82px;
  object-fit: contain;
  filter: drop-shadow(0 0 18px rgba(216, 170, 79, 0.28));
}

.roster-account {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(248, 239, 216, 0.76);
  font-size: 0.9rem;
}

.roster-account__email {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roster-toplink {
  color: #8edcff;
  text-decoration: none;
  font-size: 0.86rem;
}

.roster-toplink:hover {
  color: var(--eo-gold-light);
}

.roster-toplink--button {
  border: 1px solid rgba(216, 170, 79, 0.28);
  border-radius: 8px;
  background: rgba(7, 10, 16, 0.56);
  padding: 8px 12px;
  cursor: pointer;
}

.roster-panel {
  position: relative;
  width: min(1180px, 100%);
  margin: auto;
  padding: clamp(22px, 4vw, 42px);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
    var(--eo-panel);
  border: 1px solid var(--eo-border);
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 0 0 1px rgba(0, 0, 0, 0.6),
    0 28px 80px rgba(0, 0, 0, 0.62);
}

.roster-panel::before,
.roster-panel::after {
  content: "";
  position: absolute;
  left: 28px;
  right: 28px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(245, 209, 125, 0.72),
    transparent
  );
  pointer-events: none;
}

.roster-panel::before {
  top: 14px;
}

.roster-panel::after {
  bottom: 14px;
}

.panel-corner {
  position: absolute;
  width: 46px;
  height: 46px;
  background-image: url("/assets/ui/panel-corner-gold.svg");
  background-size: contain;
  background-repeat: no-repeat;
  pointer-events: none;
  opacity: 0.92;
}

.panel-corner--tl {
  top: -2px;
  left: -2px;
}

.panel-corner--tr {
  top: -2px;
  right: -2px;
  transform: rotate(90deg);
}

.panel-corner--br {
  right: -2px;
  bottom: -2px;
  transform: rotate(180deg);
}

.panel-corner--bl {
  left: -2px;
  bottom: -2px;
  transform: rotate(270deg);
}

.roster-heading {
  text-align: center;
  margin-bottom: 26px;
}

.roster-kicker {
  margin: 0 0 8px;
  color: var(--eo-gold-light);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.roster-heading h1 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 4vw, 3.3rem);
  line-height: 1.05;
  text-transform: uppercase;
}

.roster-heading p {
  margin: 10px 0 0;
  color: var(--eo-muted);
}

.roster-error {
  margin: 0 auto 18px;
  width: min(720px, 100%);
  padding: 12px 14px;
  border: 1px solid rgba(255, 107, 107, 0.42);
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.24);
  color: #fecaca;
  font-size: 0.9rem;
}

.roster-loading {
  margin: 20px auto;
  width: min(420px, 100%);
  padding: 18px;
  text-align: center;
  color: var(--eo-muted);
  border: 1px solid rgba(216, 170, 79, 0.22);
  border-radius: 12px;
  background: rgba(7, 10, 16, 0.5);
}

.roster-layout {
  display: grid;
  grid-template-columns: minmax(320px, 0.95fr) minmax(360px, 1.05fr);
  gap: 22px;
}

.roster-list-panel,
.roster-preview-panel {
  min-height: 520px;
  padding: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent),
    var(--eo-panel-soft);
  border: 1px solid rgba(216, 170, 79, 0.24);
  border-radius: 14px;
  box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.36);
}

.roster-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}

.roster-list-header strong {
  display: block;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.25rem;
}

.roster-list-header span {
  display: block;
  margin-top: 3px;
  color: var(--eo-muted);
  font-size: 0.82rem;
}

.roster-create-small {
  padding: 8px 12px;
  border: 1px solid rgba(216, 170, 79, 0.38);
  border-radius: 8px;
  color: var(--eo-gold-light);
  background: rgba(7, 10, 16, 0.58);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 800;
}

.roster-create-small:hover {
  border-color: var(--eo-border-strong);
}

.roster-empty {
  display: grid;
  place-items: center;
  min-height: 360px;
  padding: 24px;
  text-align: center;
  border: 1px dashed rgba(216, 170, 79, 0.32);
  border-radius: 12px;
  background: rgba(5, 8, 14, 0.48);
}

.roster-empty h2 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
}

.roster-empty p {
  margin: 10px 0 20px;
  color: var(--eo-muted);
  line-height: 1.6;
}

.roster-character-list {
  display: grid;
  gap: 12px;
}

.roster-char-card {
  display: grid;
  grid-template-columns: 76px 1fr;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(216, 170, 79, 0.22);
  border-radius: 12px;
  background:
    linear-gradient(90deg, rgba(216, 170, 79, 0.08), transparent),
    rgba(5, 8, 14, 0.68);
  color: var(--eo-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    transform 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease;
}

.roster-char-card:hover,
.roster-char-card.is-selected {
  transform: translateY(-1px);
  border-color: var(--eo-border-strong);
  background:
    linear-gradient(90deg, rgba(216, 170, 79, 0.16), transparent),
    rgba(5, 8, 14, 0.84);
  box-shadow: 0 0 26px rgba(216, 170, 79, 0.16);
}

.roster-char-card__canvas-wrap {
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(53, 200, 255, 0.22);
  border-radius: 10px;
  background:
    radial-gradient(circle, rgba(53, 200, 255, 0.12), transparent 62%),
    rgba(1, 5, 12, 0.78);
}

.roster-char-card canvas {
  width: 64px;
  height: 64px;
  image-rendering: pixelated;
}

.roster-char-card h3 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.15rem;
}

.roster-char-card p {
  margin: 4px 0 0;
  color: var(--eo-muted);
  font-size: 0.82rem;
}

.roster-char-card small {
  display: block;
  margin-top: 4px;
  color: rgba(248, 239, 216, 0.56);
}

.roster-preview-panel {
  display: grid;
}

.roster-no-selection {
  place-self: center;
  text-align: center;
  width: min(360px, 100%);
}

.roster-no-selection h2 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
}

.roster-no-selection p {
  margin: 10px 0 0;
  color: var(--eo-muted);
}

.roster-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.roster-preview-frame {
  width: 190px;
  height: 190px;
  display: grid;
  place-items: center;
  margin-bottom: 18px;
  border: 1px solid rgba(216, 170, 79, 0.34);
  border-radius: 18px;
  background:
    radial-gradient(circle, rgba(53, 200, 255, 0.14), transparent 56%),
    rgba(2, 6, 12, 0.72);
  box-shadow:
    inset 0 0 26px rgba(0, 0, 0, 0.46),
    0 0 30px rgba(53, 200, 255, 0.08);
}

.roster-preview-canvas {
  width: 160px;
  height: 160px;
  image-rendering: pixelated;
}

.roster-selected h2 {
  margin: 0 0 18px;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2rem;
}

.roster-info-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.roster-info-grid div {
  padding: 12px;
  border: 1px solid rgba(216, 170, 79, 0.18);
  border-radius: 10px;
  background: rgba(5, 8, 14, 0.52);
}

.roster-info-grid__wide {
  grid-column: 1 / -1;
}

.roster-info-grid span {
  display: block;
  margin-bottom: 5px;
  color: var(--eo-muted);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.roster-info-grid strong {
  color: var(--eo-text);
  font-size: 0.95rem;
}

.roster-actions {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  margin-top: 18px;
}

.game-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 24px;
  border: 1px solid rgba(255, 220, 130, 0.76);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 220, 126, 0.22), rgba(0, 0, 0, 0)),
    linear-gradient(180deg, #b97d2e 0%, #7a4b18 52%, #4a2a10 100%);
  color: #fff5d2;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 0 24px rgba(216, 170, 79, 0.18),
    0 8px 24px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  transition:
    transform 140ms ease,
    filter 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease;
}

.game-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.12);
}

.game-button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.game-button--danger {
  background:
    linear-gradient(180deg, rgba(255, 160, 160, 0.16), rgba(0, 0, 0, 0)),
    linear-gradient(180deg, #9f3434 0%, #6d2020 52%, #3c1111 100%);
  border-color: rgba(255, 160, 160, 0.46);
}

@media (max-width: 940px) {
  .roster-topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .roster-account {
    width: 100%;
    flex-wrap: wrap;
  }

  .roster-layout {
    grid-template-columns: 1fr;
  }

  .roster-list-panel,
  .roster-preview-panel {
    min-height: auto;
  }
}

@media (max-width: 560px) {
  body.roster-page {
    background-attachment: scroll;
  }

  .roster-shell {
    padding: 16px;
  }

  .roster-panel {
    padding: 22px 16px;
  }

  .roster-heading h1 {
    font-size: 2rem;
  }

  .roster-char-card {
    grid-template-columns: 64px 1fr;
    padding: 10px;
  }

  .roster-char-card__canvas-wrap {
    width: 58px;
    height: 58px;
  }

  .roster-char-card canvas {
    width: 54px;
    height: 54px;
  }

  .roster-actions {
    grid-template-columns: 1fr;
  }

  .roster-account__email {
    max-width: 100%;
  }
}
9. Ajustar roster.ts sem quebrar a lógica

Aqui é onde precisa mais atenção.

Hoje o roster.ts renderiza cards simples e desenha o canvas real. Vamos manter isso, mas trocar o HTML dos cards e adicionar preview grande.

9.1. Trocar import

No começo:

import './roster.css';

No lugar de:

import '../shared/shell.css';
9.2. Adicionar novos elementos

Depois dos elementos atuais:

const loadingEl = document.getElementById('rosterLoading') as HTMLElement | null;
const selectedDetailsEl = document.getElementById('selectedDetails') as HTMLElement | null;
const noSelectionStateEl = document.getElementById('noSelectionState') as HTMLElement | null;

const selectedNameEl = document.getElementById('selectedName') as HTMLElement | null;
const selectedVocationEl = document.getElementById('selectedVocation') as HTMLElement | null;
const selectedLevelEl = document.getElementById('selectedLevel') as HTMLElement | null;
const selectedGenderEl = document.getElementById('selectedGender') as HTMLElement | null;
const selectedMapEl = document.getElementById('selectedMap') as HTMLElement | null;
const selectedLastPlayedEl = document.getElementById('selectedLastPlayed') as HTMLElement | null;
const selectedPreviewCanvas = document.getElementById('selectedPreviewCanvas') as HTMLCanvasElement | null;
9.3. Criar helpers

Adicione estas funções:

function getCharacterSpriteUrl(c: CharacterRow): string {
  return (
    c.outfitConfig?.spriteSheetUrl ||
    c.appearance?.spriteSheetUrl ||
    `tiles/characters/vocations/${c.gender || 'male'}/${c.vocation || 'knight'}.png`
  );
}

function formatVocation(c: CharacterRow): string {
  const value = c.vocation || c.outfitConfig?.vocation || 'knight';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatGender(c: CharacterRow): string {
  const value = c.gender || c.appearance?.gender;

  if (value === 'female') return 'Feminino';
  if (value === 'male') return 'Masculino';

  return '-';
}

function formatLastPlayed(value: string | null): string {
  if (!value) return 'Nunca jogou';

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMap(c: CharacterRow): string {
  return c.mapId || c.spawnMapId || 'Elarion';
}

Importante: esse helper getCharacterSpriteUrl mantém o outfit real e adiciona appearance?.spriteSheetUrl como fallback extra, porque o tipo CharacterAppearance também possui spriteSheetUrl.

9.4. Melhorar loadRoster

Hoje ele carrega e renderiza. Só adicione loading:

async function loadRoster(): Promise<void> {
  try {
    errEl.hidden = true;
    if (loadingEl) loadingEl.hidden = false;

    characters = await listCharacters(session.userId);

    if (!selectedId && characters.length > 0) {
      selectedId = characters[0].id;
      enterBtn.disabled = false;
      deleteBtn.disabled = false;
    }

    renderGrid();
    renderSelectedCharacter();
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : 'Erro ao carregar personagens.';
    errEl.hidden = false;
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }
}

Eu recomendo selecionar automaticamente o primeiro personagem. Isso deixa a tela mais bonita e pronta para “Entrar no Mundo”.

9.5. Atualizar renderGrid

Troque a função renderGrid() por uma versão parecida com esta:

function renderGrid(): void {
  grid.innerHTML = '';

  const hasCharacters = characters.length > 0;
  empty.hidden = hasCharacters;

  if (!hasCharacters) {
    enterBtn.disabled = true;
    deleteBtn.disabled = true;
    renderSelectedCharacter();
    return;
  }

  for (const c of characters) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'roster-char-card' + (c.id === selectedId ? ' is-selected' : '');
    button.dataset.id = c.id;

    const vocation = formatVocation(c);
    const level = c.level ?? 1;
    const lastPlayed = c.lastPlayedAt
      ? `Último acesso: ${new Date(c.lastPlayedAt).toLocaleDateString('pt-BR')}`
      : 'Nunca jogou';

    button.innerHTML = `
      <span class="roster-char-card__canvas-wrap">
        <canvas class="char-card-canvas" width="64" height="64"></canvas>
      </span>

      <span>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(vocation)} · Level ${level}</p>
        <small>${escapeHtml(lastPlayed)}</small>
      </span>
    `;

    button.addEventListener('click', () => {
      selectedId = c.id;
      enterBtn.disabled = false;
      deleteBtn.disabled = false;
      renderGrid();
      renderSelectedCharacter();
    });

    grid.appendChild(button);

    const canvas = button.querySelector('.char-card-canvas') as HTMLCanvasElement | null;

    if (canvas) {
      void drawCharacterPreview(canvas, getCharacterSpriteUrl(c));
    }
  }
}

Aqui mantemos o mesmo preview real em canvas. Só mudamos o card para ficar mais bonito.

9.6. Criar renderSelectedCharacter

Adicione:

function getSelectedCharacter(): CharacterRow | null {
  if (!selectedId) return null;
  return characters.find((c) => c.id === selectedId) ?? null;
}

function renderSelectedCharacter(): void {
  const selected = getSelectedCharacter();

  const hasSelected = Boolean(selected);

  if (selectedDetailsEl) selectedDetailsEl.hidden = !hasSelected;
  if (noSelectionStateEl) noSelectionStateEl.hidden = hasSelected;

  if (!selected) {
    enterBtn.disabled = true;
    deleteBtn.disabled = true;
    return;
  }

  if (selectedNameEl) selectedNameEl.textContent = selected.name;
  if (selectedVocationEl) selectedVocationEl.textContent = formatVocation(selected);
  if (selectedLevelEl) selectedLevelEl.textContent = String(selected.level ?? 1);
  if (selectedGenderEl) selectedGenderEl.textContent = formatGender(selected);
  if (selectedMapEl) selectedMapEl.textContent = formatMap(selected);
  if (selectedLastPlayedEl) selectedLastPlayedEl.textContent = formatLastPlayed(selected.lastPlayedAt);

  if (selectedPreviewCanvas) {
    void drawCharacterPreview(selectedPreviewCanvas, getCharacterSpriteUrl(selected));
  }
}

Isso permite que a tela tenha o card pequeno e o preview grande usando o mesmo sistema de sprite real.

10. Cuidado com drawCharacterPreview

A função atual já faz coisas importantes:

carrega o JSON da sprite
resolve frameWidth/frameHeight
respeita offsetX/offsetY
respeita gapX/gapY
respeita sheetLayout
usa idle_down ou walk_down
usa resolveAnimationSourceRect
remove magenta quando chromaKey está ativo
desenha no canvas com imageSmoothingEnabled = false

Essa função é exatamente o que você precisa preservar, porque ela respeita a estrutura real das sprites do seu sistema. Ela usa resolveAnimationSourceRect e resolveApiUrl para montar o caminho correto da imagem/JSON.

Então a regra é:

Não troque canvas por <img>.
Não use imagem fixa da vocação.
Não desenhe sempre knight.png.
Não ignore outfitConfig.

O certo é:

usar drawCharacterPreview(canvas, getCharacterSpriteUrl(character))
11. Melhorar botão de entrar

Hoje o fluxo do botão está correto:

await enforceDesktopVersionGate();
await markCharacterPlayed(selectedId, session.userId);
sessionStorage.setItem('activeCharacterId', selectedId);
track('first_world_enter', { characterId: selectedId });
location.href = `play.html?characterId=${encodeURIComponent(selectedId)}`;

Eu só adicionaria loading visual:

enterBtn.addEventListener('click', async () => {
  if (!selectedId) return;

  const originalText = enterBtn.textContent ?? 'Entrar no mundo';

  try {
    enterBtn.disabled = true;
    enterBtn.textContent = 'Entrando...';

    const versionOk = await enforceDesktopVersionGate();
    if (!versionOk) return;

    await markCharacterPlayed(selectedId, session.userId);
    sessionStorage.setItem('activeCharacterId', selectedId);
    track('first_world_enter', { characterId: selectedId });

    location.href = `play.html?characterId=${encodeURIComponent(selectedId)}`;
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : 'Erro ao entrar.';
    errEl.hidden = false;
    enterBtn.disabled = false;
    enterBtn.textContent = originalText;
  }
});

Observação: se versionOk for falso, talvez você queira restaurar o botão antes do return:

if (!versionOk) {
  enterBtn.disabled = false;
  enterBtn.textContent = originalText;
  return;
}
12. Melhorar exclusão sem mudar backend

Hoje está com confirm(). Funciona, mas visualmente fica feio. Para este commit, eu faria assim:

Opção segura para agora

Manter confirm().

Motivo: é simples e não arrisca quebrar.

Opção melhor depois

Criar modal visual:

Tem certeza que deseja excluir Arthan?
Digite o nome do personagem para confirmar.

Para esta etapa, minha sugestão é:

não mexer na exclusão ainda
só mudar o botão visual

Porque seu foco agora é a seleção.

13. Ajuste completo do deleteBtn

Pode manter quase igual, mas remover logs excessivos:

deleteBtn.addEventListener('click', async () => {
  const selected = getSelectedCharacter();

  if (!selected) return;

  const confirmed = confirm(
    `Excluir o personagem "${selected.name}"? Esta ação não pode ser desfeita.`
  );

  if (!confirmed) return;

  try {
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Excluindo...';

    await softDeleteCharacter(selected.id, session.userId);

    selectedId = null;
    characters = characters.filter((c) => c.id !== selected.id);

    if (characters.length > 0) {
      selectedId = characters[0].id;
    }

    enterBtn.disabled = !selectedId;
    deleteBtn.disabled = !selectedId;
    deleteBtn.textContent = 'Excluir';

    renderGrid();
    renderSelectedCharacter();
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : 'Erro ao excluir.';
    errEl.hidden = false;

    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Excluir';
  }
});

Se quiser recarregar do servidor depois da exclusão, mantenha await loadRoster(). É mais confiável:

await softDeleteCharacter(selected.id, session.userId);
selectedId = null;
await loadRoster();
14. Arquivo final roster.ts: estrutura recomendada

Não precisa reescrever do zero. Organize assim:

import './roster.css';

imports atuais...

initDesktopClientShell();

const session = await requireAuth();

pegar elementos do DOM

emailEl.textContent = session.email;

profile / studioLink

let characters = [];
let selectedId = null;

helpers:
  getCharacterSpriteUrl
  formatVocation
  formatGender
  formatLastPlayed
  formatMap
  getSelectedCharacter
  escapeHtml

loadRoster
renderGrid
renderSelectedCharacter
drawCharacterPreview atual, preservada

event enter
event delete
event logout

void loadRoster()

O mais importante: não jogue fora drawCharacterPreview.

15. Testes obrigatórios depois da implementação

Depois de alterar, teste nesta ordem:

1. Conta sem personagem

Esperado:

mostra estado vazio
botão Criar personagem aparece
Entrar no mundo desabilitado
Excluir desabilitado
2. Conta com 1 personagem

Esperado:

seleciona automaticamente
mostra card selecionado
mostra preview grande
botão Entrar habilitado
botão Excluir habilitado
3. Conta com vários personagens

Esperado:

clicar no card muda seleção
preview muda
nome/vocação/level mudam
Entrar usa o characterId correto
4. Personagem com outfit real

Esperado:

canvas mostra sprite correta
chroma key funciona
não aparece fundo magenta
5. Personagem antigo sem outfitConfig

Esperado:

usa fallback:
tiles/characters/vocations/${gender}/${vocation}.png
6. Entrar no mundo

Esperado:

chama markCharacterPlayed
salva activeCharacterId no sessionStorage
navega para play.html?characterId=...
7. Excluir personagem

Esperado:

pede confirmação
chama softDeleteCharacter
recarrega lista
não quebra quando exclui o último personagem
8. GM Studio

Esperado:

conta sem permissão: link escondido
conta GM/admin: link visível

O roster.ts atual já faz essa checagem com getProfile() e profile?.canAccessStudio, então preserve isso.

16. Ordem exata de implementação

Faça assim:

1. Gerar/colocar imagem:
   public/assets/characters/bg-roster.webp

2. Confirmar assets existentes:
   public/assets/brand/elarion-logo.png
   public/assets/ui/panel-corner-gold.svg

3. Criar:
   src/characters/roster.css

4. Substituir:
   characters.html

5. Alterar:
   src/characters/roster.ts
   import './roster.css'

6. Adicionar novos IDs/elementos no TS:
   selectedName
   selectedVocation
   selectedLevel
   selectedGender
   selectedMap
   selectedLastPlayed
   selectedPreviewCanvas
   selectedDetails
   noSelectionState
   rosterLoading

7. Refatorar renderGrid sem trocar a origem dos dados

8. Criar renderSelectedCharacter

9. Testar:
   npm run dev

10. Testar build:
   npm run build
   npm run preview

11. Testar Electron:
   npm run electron:dev
17. O que eu deixaria para outro commit

Não coloque tudo agora. Eu deixaria para depois:

modal bonito de exclusão
animação contínua do preview selecionado
ranking/status do servidor
último mundo jogado em destaque
slots extras de personagem
botão renomear personagem
trocar mundo/servidor

Agora o objetivo é:

selecionar personagem bonito
mostrar outfit real
entrar no mundo sem quebrar
18. Minha recomendação final

Para esta etapa, o commit deve ser pequeno e seguro:

feat: redesign character roster page

Escopo do commit:

characters.html novo
src/characters/roster.css novo
src/characters/roster.ts ajustado visualmente
asset bg-roster.webp

Não mexa ainda em:

create.ts
characters-new.html
outfit_presets.json
vocations
backend
play.html

A tela de seleção deve ser só uma camada nova de UI em cima da lógica atual.

O ponto mais importante é este:

A página pode mudar 100% visualmente,
mas a origem do personagem continua sendo CharacterRow + outfitConfig real + drawCharacterPreview.

Isso mantém o sistema correto e evita o erro de mostrar um personagem bonito na tela de seleção, mas diferente do personagem que aparece dentro do jogo.