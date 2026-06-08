Sim. A página Criar Personagem precisa ser feita com ainda mais cuidado que a seleção, porque ela é responsável por gravar exatamente os dados que depois aparecem na tela de seleção e dentro do jogo.

Hoje ela já tem uma estrutura funcional de wizard em 3 passos: Nome, Classe/Vocação + Gênero + Outfit, e Confirmar. O HTML atual já mostra “Passo 1 de 3 — Nome”, opções de vocação, gênero, visual/outfit, resumo “Nascerá em Rookgaard” e botão “Criar e voltar”.

O ponto mais importante: não podemos quebrar a forma como o sistema cria o personagem real.

1. Como funciona hoje

Hoje o arquivo principal é:

src/characters/create.ts

Ele já faz muita coisa importante:

requireAuth()
validateCharacterName()
createCharacter()
loadOutfitPresets()
filterOutfitsByVocationAndGender()
findOutfitPreset()
loadRuntimeVocations()
fillVocationSelect()
preview animado no canvas
chroma key do magenta
leitura do JSON real da sprite
resolveAnimationSourceRect()

O fluxo atual é este:

1. Usuário abre characters-new.html
2. requireAuth() garante que está logado
3. Carrega vocações runtime
4. Carrega outfit_presets.json
5. Preenche vocações
6. Filtra outfits por vocation + gender
7. Mostra preview animado no canvas
8. Passo 1 valida nome
9. Passo 2 salva vocation/gender/outfit
10. Passo 3 chama createCharacter()
11. Redireciona para characters.html

Esse fluxo está todo concentrado em create.ts. Ele importa createCharacter, validateCharacterName, loadOutfitPresets, filterOutfitsByVocationAndGender, findOutfitPreset, loadRuntimeVocations, fillVocationSelect, resolveAnimationSourceRect e resolveApiUrl.

2. O que não pode mudar

Esses pontos precisam ser preservados:

requireAuth()
validateCharacterName(name)
loadRuntimeVocations()
fillVocationSelect()
loadOutfitPresets()
filterOutfitsByVocationAndGender()
findOutfitPreset()
startAnimatedPreview()
createCharacter()
track('character_created')
location.href = 'characters.html'

Principalmente, não troque o preview por uma imagem fixa. O sistema atual carrega o spriteSheetUrl, procura o .json correspondente, usa frameWidth, frameHeight, offsetX, offsetY, gapX, gapY, sheetLayout, animations, aplica chroma key se necessário e desenha no canvas. Isso é correto e precisa continuar.

3. O que o createCharacter() salva hoje

O createCharacter() é muito importante. Ele recebe:

accountId
name
vocationId
gender
outfitId
spriteSheetUrl
spawnMapId

Depois, quando a API está ativa, ele:

verifica limite máximo de personagens
carrega o JSON da sprite
cria outfitConfig
grava name
grava spriteSheetUrl
grava vocation
grava level 1
grava experience 0
grava gender
grava appearance
grava gameId
grava mapId
grava posição inicial
grava direction inicial
envia POST /api/characters

Isso quer dizer que a tela de criação não pode simplesmente mandar nome/vocação. Ela precisa mandar também:

gender
outfitId
spriteSheetUrl

Porque é isso que garante que o personagem criado apareça corretamente depois no roster e no jogo.

A posição inicial vem de DEFAULT_GAME_CONFIG: mapId: rookgaard, posição { x: 50, y: 50, z: 0 }, direção inicial south, limite de 4 personagens e sem troca de gênero/vocação pelas regras padrão.

4. Atenção importante sobre vocações

Hoje o sistema não deve hardcodar visualmente todas as vocações direto no HTML.

O arquivo vocationRegistry.ts carrega vocações de /vocations.json, com fallback para vocações bundled.

E o fillVocationSelect() preenche o select baseado no mapa de vocações carregado.

Então a tela nova deve continuar obedecendo isso:

não hardcodar somente Knight/Mage/Archer no TS
não quebrar vocations.json
não ignorar vocações runtime
não criar cards fixos que não sincronizam com o select real

Você pode ter cards bonitos, mas eles devem ser gerados a partir das vocações carregadas.

Observação: no código base, as vocações default citadas são knight, mage e archer. Se você quiser druid, ele precisa existir em /vocations.json ou no bundle de vocações.

5. Arquivos que vamos mexer

Eu faria este commit com este escopo:

characters-new.html
src/characters/create.ts
src/characters/create-character.css
public/assets/characters/bg-create-character.webp

Opcional, se quiser organizar melhor:

src/characters/createCharacterUi.ts

Mas para não complicar agora, pode deixar tudo no create.ts e só criar o CSS.

6. Assets necessários

Crie esta estrutura:

public/
  assets/
    characters/
      bg-create-character.webp

    ui/
      panel-corner-gold.svg
      icon-sword.svg
      icon-staff.svg
      icon-bow.svg
      icon-user.svg
      icon-male.svg
      icon-female.svg

    brand/
      elarion-logo.png

Se panel-corner-gold.svg e elarion-logo.png já existem por causa do login/registro/seleção, reaproveite.

Imagem de fundo recomendada para criação de personagem:

arsenal medieval escuro
escudos
armas
banners
névoa leve
luz azul/dourada
sem texto
sem logo
sem botão
espaço central livre para painel

Nome:

public/assets/characters/bg-create-character.webp
7. Estrutura ideal da tela

A nova tela deve parecer um ritual de criação do herói.

Visual:

┌─────────────────────────────────────────────────────────────┐
│ Logo Elarion Online                         Voltar          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                Criar Personagem                             │
│           Escolha o início da sua jornada                    │
│                                                             │
│  Passos:  1 Nome  →  2 Vocação/Aparência  →  3 Confirmar    │
│                                                             │
│  ┌─────────────────────────────┐ ┌───────────────────────┐  │
│  │ Conteúdo do passo atual     │ │ Preview do personagem │  │
│  │                             │ │ [canvas animado]      │  │
│  │ Nome/Gênero/Vocação/Outfit  │ │ Nome                  │  │
│  │                             │ │ Vocação               │  │
│  │ [Voltar] [Próximo]          │ │ Outfit                │  │
│  └─────────────────────────────┘ └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

No mobile:

Logo
Criar personagem
Passos
Preview
Campos
Botões
8. IDs que precisam continuar existindo

O create.ts atual depende desses IDs. Então mantenha todos:

createError
wizardStep
preset
gender
outfit
presetPreviewCanvas
step1
step2
step3
next1
next2
confirmCreate
charName
summaryName

Você pode adicionar novos IDs, mas não remova esses.

IDs novos recomendados:

backToStep1
backToStep2
createLoading
previewName
previewVocation
previewGender
previewOutfit
vocationCards
genderCards
outfitCards
9. Novo characters-new.html

Use esta base:

<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Criar personagem — Elarion Online</title>
    <meta
      name="description"
      content="Crie seu personagem em Elarion Online."
    />
  </head>

  <body class="create-character-page">
    <main class="create-shell">
      <header class="create-topbar">
        <a href="index.html" class="create-brand" aria-label="Elarion Online">
          <img
            src="assets/brand/elarion-logo.png"
            alt="Elarion Online"
            class="create-brand__logo"
          />
        </a>

        <a href="characters.html" class="create-toplink">
          Cancelar
        </a>
      </header>

      <section class="create-panel">
        <span class="panel-corner panel-corner--tl"></span>
        <span class="panel-corner panel-corner--tr"></span>
        <span class="panel-corner panel-corner--br"></span>
        <span class="panel-corner panel-corner--bl"></span>

        <div class="create-heading">
          <p class="create-kicker">Elarion Online</p>
          <h1>Criar personagem</h1>
          <p>Escolha o início da sua jornada.</p>
        </div>

        <div class="create-stepper" aria-label="Etapas de criação">
          <span class="create-stepper__item is-active" data-step-indicator="1">
            <strong>1</strong>
            Nome
          </span>

          <span class="create-stepper__line"></span>

          <span class="create-stepper__item" data-step-indicator="2">
            <strong>2</strong>
            Vocação
          </span>

          <span class="create-stepper__line"></span>

          <span class="create-stepper__item" data-step-indicator="3">
            <strong>3</strong>
            Confirmar
          </span>
        </div>

        <p id="wizardStep" class="create-wizard-label">
          Passo 1 de 3 — Nome
        </p>

        <p id="createError" class="create-error" hidden></p>

        <div class="create-layout">
          <section class="create-form-panel">
            <section id="step1" class="create-step">
              <h2>Nome do personagem</h2>
              <p>
                Escolha o nome do seu herói. Ele será visto por outros jogadores.
              </p>

              <div class="create-field">
                <label for="charName">Nome</label>
                <input
                  id="charName"
                  name="charName"
                  type="text"
                  maxlength="20"
                  placeholder="Ex: Arthan"
                  autocomplete="off"
                  required
                />
                <small>Entre 3 e 20 caracteres. Letras, números e espaços.</small>
              </div>

              <div class="create-actions">
                <a class="game-button game-button--secondary" href="characters.html">
                  Voltar
                </a>

                <button id="next1" class="game-button" type="button">
                  Próximo
                </button>
              </div>
            </section>

            <section id="step2" class="create-step" hidden>
              <h2>Vocação e aparência</h2>
              <p>
                Escolha sua vocação, gênero e visual inicial.
              </p>

              <div class="create-field">
                <label for="preset">Vocação</label>
                <select id="preset" name="preset"></select>
              </div>

              <div id="vocationCards" class="create-option-grid"></div>

              <div class="create-field">
                <label for="gender">Gênero</label>
                <select id="gender" name="gender">
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </div>

              <div id="genderCards" class="create-choice-row">
                <button class="create-choice-card is-selected" type="button" data-gender-card="male">
                  Masculino
                </button>

                <button class="create-choice-card" type="button" data-gender-card="female">
                  Feminino
                </button>
              </div>

              <div class="create-field">
                <label for="outfit">Visual/Outfit</label>
                <select id="outfit" name="outfit"></select>
              </div>

              <div id="outfitCards" class="create-outfit-list"></div>

              <div class="create-actions">
                <button id="backToStep1" class="game-button game-button--secondary" type="button">
                  Voltar
                </button>

                <button id="next2" class="game-button" type="button">
                  Próximo
                </button>
              </div>
            </section>

            <section id="step3" class="create-step" hidden>
              <h2>Confirmar personagem</h2>
              <p>
                Confira os dados antes de iniciar sua jornada.
              </p>

              <div class="create-summary">
                <strong id="summaryName">-</strong>
                <span>Nascerá em Rookgaard.</span>
              </div>

              <div class="create-actions">
                <button id="backToStep2" class="game-button game-button--secondary" type="button">
                  Voltar
                </button>

                <button id="confirmCreate" class="game-button" type="button">
                  Criar e voltar
                </button>
              </div>
            </section>
          </section>

          <aside class="create-preview-panel">
            <div class="create-preview-frame">
              <canvas
                id="presetPreviewCanvas"
                class="create-preview-canvas"
                width="160"
                height="160"
              ></canvas>
            </div>

            <div class="create-preview-info">
              <h2 id="previewName">Novo herói</h2>

              <div>
                <span>Vocação</span>
                <strong id="previewVocation">-</strong>
              </div>

              <div>
                <span>Gênero</span>
                <strong id="previewGender">-</strong>
              </div>

              <div>
                <span>Visual</span>
                <strong id="previewOutfit">-</strong>
              </div>

              <div>
                <span>Mundo inicial</span>
                <strong>Rookgaard</strong>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>

    <script type="module" src="/src/characters/create.ts"></script>
  </body>
</html>

Ponto importante: os select continuam existindo. Mesmo que depois você use cards bonitos, os cards apenas sincronizam com os selects. Isso evita quebrar o fluxo atual.

10. Criar src/characters/create-character.css

No create.ts, troque:

import '../shared/shell.css';

por:

import './create-character.css';

CSS base:

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

body.create-character-page {
  margin: 0;
  min-height: 100vh;
  color: var(--eo-text);
  background:
    radial-gradient(circle at 50% 38%, rgba(53, 200, 255, 0.08), transparent 34%),
    linear-gradient(90deg, rgba(2, 4, 9, 0.88), rgba(2, 4, 9, 0.46), rgba(2, 4, 9, 0.9)),
    url("/assets/characters/bg-create-character.webp");
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

.create-shell {
  min-height: 100vh;
  padding: 24px clamp(16px, 4vw, 56px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.create-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
}

.create-brand__logo {
  width: min(220px, 48vw);
  max-height: 82px;
  object-fit: contain;
  filter: drop-shadow(0 0 18px rgba(216, 170, 79, 0.28));
}

.create-toplink {
  color: #8edcff;
  text-decoration: none;
  font-size: 0.9rem;
}

.create-toplink:hover {
  color: var(--eo-gold-light);
}

.create-panel {
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

.create-panel::before,
.create-panel::after {
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

.create-panel::before {
  top: 14px;
}

.create-panel::after {
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

.create-heading {
  text-align: center;
  margin-bottom: 22px;
}

.create-kicker {
  margin: 0 0 8px;
  color: var(--eo-gold-light);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.create-heading h1 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 4vw, 3.3rem);
  line-height: 1.05;
  text-transform: uppercase;
}

.create-heading p {
  margin: 10px 0 0;
  color: var(--eo-muted);
}

.create-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
}

.create-stepper__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(248, 239, 216, 0.55);
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.create-stepper__item strong {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(216, 170, 79, 0.28);
  border-radius: 999px;
  background: rgba(5, 8, 14, 0.7);
  color: var(--eo-muted);
}

.create-stepper__item.is-active {
  color: var(--eo-gold-light);
}

.create-stepper__item.is-active strong {
  border-color: var(--eo-border-strong);
  background: linear-gradient(180deg, #b97d2e, #6f4317);
  color: #fff5d2;
}

.create-stepper__line {
  width: min(90px, 8vw);
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(216, 170, 79, 0.15),
    rgba(216, 170, 79, 0.5),
    rgba(216, 170, 79, 0.15)
  );
}

.create-wizard-label {
  margin: 0 0 20px;
  color: var(--eo-muted);
  text-align: center;
  font-size: 0.9rem;
}

.create-error {
  margin: 0 auto 18px;
  width: min(720px, 100%);
  padding: 12px 14px;
  border: 1px solid rgba(255, 107, 107, 0.42);
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.24);
  color: #fecaca;
  font-size: 0.9rem;
}

.create-layout {
  display: grid;
  grid-template-columns: minmax(360px, 1.1fr) minmax(320px, 0.9fr);
  gap: 22px;
}

.create-form-panel,
.create-preview-panel {
  min-height: 500px;
  padding: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent),
    var(--eo-panel-soft);
  border: 1px solid rgba(216, 170, 79, 0.24);
  border-radius: 14px;
  box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.36);
}

.create-step h2,
.create-preview-info h2 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.55rem;
}

.create-step p {
  margin: 8px 0 20px;
  color: var(--eo-muted);
  line-height: 1.65;
}

.create-field {
  margin-bottom: 18px;
}

.create-field label {
  display: block;
  margin-bottom: 7px;
  color: var(--eo-gold-light);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.create-field input,
.create-field select {
  width: 100%;
  min-height: 46px;
  padding: 0 13px;
  border: 1px solid rgba(169, 177, 195, 0.28);
  border-radius: 8px;
  background: rgba(3, 6, 12, 0.78);
  color: var(--eo-text);
  outline: none;
  font-size: 0.95rem;
}

.create-field small {
  display: block;
  margin-top: 8px;
  color: rgba(169, 177, 195, 0.72);
  line-height: 1.45;
}

.create-field input:focus,
.create-field select:focus {
  border-color: rgba(53, 200, 255, 0.72);
  box-shadow: 0 0 0 3px rgba(53, 200, 255, 0.12);
}

.create-option-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: -4px 0 18px;
}

.create-choice-row,
.create-outfit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: -4px 0 18px;
}

.create-choice-card,
.create-vocation-card,
.create-outfit-card {
  border: 1px solid rgba(216, 170, 79, 0.24);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(216, 170, 79, 0.08), transparent),
    rgba(5, 8, 14, 0.68);
  color: var(--eo-text);
  cursor: pointer;
  transition:
    border-color 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
}

.create-choice-card {
  min-height: 42px;
  padding: 0 16px;
  font-weight: 800;
}

.create-vocation-card {
  min-height: 86px;
  padding: 12px;
  text-align: left;
}

.create-vocation-card strong,
.create-outfit-card strong {
  display: block;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
}

.create-vocation-card small,
.create-outfit-card small {
  display: block;
  margin-top: 4px;
  color: var(--eo-muted);
}

.create-outfit-card {
  padding: 10px 12px;
}

.create-choice-card.is-selected,
.create-vocation-card.is-selected,
.create-outfit-card.is-selected,
.create-choice-card:hover,
.create-vocation-card:hover,
.create-outfit-card:hover {
  transform: translateY(-1px);
  border-color: var(--eo-border-strong);
  box-shadow: 0 0 22px rgba(216, 170, 79, 0.16);
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.create-preview-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.create-preview-frame {
  width: 210px;
  height: 210px;
  display: grid;
  place-items: center;
  margin-bottom: 20px;
  border: 1px solid rgba(216, 170, 79, 0.34);
  border-radius: 18px;
  background:
    radial-gradient(circle, rgba(53, 200, 255, 0.14), transparent 56%),
    rgba(2, 6, 12, 0.72);
  box-shadow:
    inset 0 0 26px rgba(0, 0, 0, 0.46),
    0 0 30px rgba(53, 200, 255, 0.08);
}

.create-preview-canvas {
  width: 160px;
  height: 160px;
  image-rendering: pixelated;
}

.create-preview-info {
  width: 100%;
  display: grid;
  gap: 10px;
}

.create-preview-info h2 {
  text-align: center;
  margin-bottom: 8px;
}

.create-preview-info div {
  padding: 12px;
  border: 1px solid rgba(216, 170, 79, 0.18);
  border-radius: 10px;
  background: rgba(5, 8, 14, 0.52);
}

.create-preview-info span {
  display: block;
  margin-bottom: 5px;
  color: var(--eo-muted);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.create-preview-info strong {
  color: var(--eo-text);
}

.create-summary {
  display: grid;
  gap: 8px;
  padding: 18px;
  border: 1px solid rgba(216, 170, 79, 0.24);
  border-radius: 12px;
  background: rgba(5, 8, 14, 0.58);
}

.create-summary strong {
  color: var(--eo-gold-light);
  font-size: 1.15rem;
}

.create-summary span {
  color: var(--eo-muted);
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
}

.game-button:hover:not(:disabled) {
  filter: brightness(1.12);
  transform: translateY(-1px);
}

.game-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.game-button--secondary {
  background:
    linear-gradient(180deg, rgba(89, 166, 255, 0.12), rgba(0, 0, 0, 0)),
    rgba(7, 12, 22, 0.76);
  border-color: rgba(87, 178, 255, 0.48);
  color: #d8efff;
}

@media (max-width: 940px) {
  .create-layout {
    grid-template-columns: 1fr;
  }

  .create-form-panel,
  .create-preview-panel {
    min-height: auto;
  }
}

@media (max-width: 620px) {
  body.create-character-page {
    background-attachment: scroll;
  }

  .create-shell {
    padding: 16px;
  }

  .create-panel {
    padding: 22px 16px;
  }

  .create-stepper {
    gap: 6px;
  }

  .create-stepper__line {
    width: 22px;
  }

  .create-stepper__item {
    font-size: 0.7rem;
  }

  .create-option-grid {
    grid-template-columns: 1fr;
  }

  .create-actions {
    flex-direction: column-reverse;
  }

  .game-button {
    width: 100%;
  }
}
11. Ajustes no create.ts

Agora vem a parte sensível.

Não precisa reescrever tudo. Você vai preservar a lógica atual e adicionar:

CSS novo
cards visuais sincronizados com selects
preview lateral com textos
botões voltar
stepper ativo
loading no botão confirmar
mensagens melhores
11.1. Trocar import do CSS

No topo:

import './create-character.css';

No lugar de:

import '../shared/shell.css';
11.2. Pegar os novos elementos

Adicione após os elementos atuais:

const previewNameEl = document.getElementById('previewName') as HTMLElement | null;
const previewVocationEl = document.getElementById('previewVocation') as HTMLElement | null;
const previewGenderEl = document.getElementById('previewGender') as HTMLElement | null;
const previewOutfitEl = document.getElementById('previewOutfit') as HTMLElement | null;

const vocationCardsEl = document.getElementById('vocationCards') as HTMLElement | null;
const genderCardsEl = document.getElementById('genderCards') as HTMLElement | null;
const outfitCardsEl = document.getElementById('outfitCards') as HTMLElement | null;

const backToStep1Btn = document.getElementById('backToStep1') as HTMLButtonElement | null;
const backToStep2Btn = document.getElementById('backToStep2') as HTMLButtonElement | null;
const confirmCreateBtn = document.getElementById('confirmCreate') as HTMLButtonElement | null;
11.3. Criar helpers de UI

Adicione:

function setError(message: string | null): void {
  if (!errEl) return;

  if (!message) {
    errEl.textContent = '';
    errEl.hidden = true;
    return;
  }

  errEl.textContent = message;
  errEl.hidden = false;
}

function formatLabel(value: string | undefined | null): string {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatGenderLabel(value: Gender | string | undefined): string {
  if (value === 'female') return 'Feminino';
  if (value === 'male') return 'Masculino';
  return '-';
}

function setStepperActive(step: number): void {
  document.querySelectorAll<HTMLElement>('[data-step-indicator]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.stepIndicator === String(step));
  });
}

function updatePreviewInfo(): void {
  const currentName = (document.getElementById('charName') as HTMLInputElement | null)?.value.trim();

  const selectedVocationId = presetSelect?.value || selectedVocation;
  const selectedGenderValue = genderSelect?.value as Gender;
  const outfit = findOutfitPreset(outfitPresets, outfitSelect?.value || '');

  if (previewNameEl) previewNameEl.textContent = currentName || charName || 'Novo herói';
  if (previewVocationEl) previewVocationEl.textContent = formatLabel(selectedVocationId);
  if (previewGenderEl) previewGenderEl.textContent = formatGenderLabel(selectedGenderValue);
  if (previewOutfitEl) previewOutfitEl.textContent = outfit?.name ?? '-';
}
11.4. Melhorar showStep

Troque sua função showStep por:

function showStep(n: number): void {
  (document.getElementById('step1') as HTMLElement).hidden = n !== 1;
  (document.getElementById('step2') as HTMLElement).hidden = n !== 2;
  (document.getElementById('step3') as HTMLElement).hidden = n !== 3;

  stepLabel.textContent = `Passo ${n} de 3 — ${
    n === 1 ? 'Nome' : n === 2 ? 'Vocação e aparência' : 'Confirmar'
  }`;

  setStepperActive(n);
  updatePreviewInfo();
}
11.5. Atualizar nome no preview enquanto digita

Depois dos listeners:

document.getElementById('charName')?.addEventListener('input', () => {
  updatePreviewInfo();
});
11.6. Botões voltar

Adicione:

backToStep1Btn?.addEventListener('click', () => {
  setError(null);
  showStep(1);
});

backToStep2Btn?.addEventListener('click', () => {
  setError(null);
  showStep(2);
});
12. Cards de gênero sincronizados com select

O select gender continua sendo a fonte real. Os botões só mudam o valor do select.

Adicione:

function renderGenderCards(): void {
  if (!genderCardsEl || !genderSelect) return;

  genderCardsEl.querySelectorAll<HTMLButtonElement>('[data-gender-card]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.genderCard === genderSelect.value);
  });
}

genderCardsEl?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-gender-card]');
  if (!button || !genderSelect) return;

  genderSelect.value = button.dataset.genderCard as Gender;
  genderSelect.dispatchEvent(new Event('change'));
  renderGenderCards();
  updatePreviewInfo();
});

E dentro do listener atual de genderSelect:

genderSelect?.addEventListener('change', () => {
  renderOutfitOptions();
  renderGenderCards();
  updatePreviewInfo();
});

Se hoje já existe:

genderSelect?.addEventListener('change', renderOutfitOptions);

troque por essa versão acima.

13. Cards de vocação sincronizados com select

Depois que fillVocationSelect() preencher o select, crie os cards.

Adicione:

function renderVocationCards(): void {
  if (!vocationCardsEl || !presetSelect) return;

  vocationCardsEl.innerHTML = '';

  for (const option of Array.from(presetSelect.options)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'create-vocation-card';
    button.dataset.vocationCard = option.value;

    if (option.value === presetSelect.value) {
      button.classList.add('is-selected');
    }

    button.innerHTML = `
      <strong>${option.textContent ?? option.value}</strong>
      <small>Escolher vocação</small>
    `;

    vocationCardsEl.appendChild(button);
  }
}

function syncVocationCards(): void {
  if (!vocationCardsEl || !presetSelect) return;

  vocationCardsEl.querySelectorAll<HTMLButtonElement>('[data-vocation-card]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.vocationCard === presetSelect.value);
  });
}

vocationCardsEl?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-vocation-card]');
  if (!button || !presetSelect) return;

  presetSelect.value = button.dataset.vocationCard ?? presetSelect.value;
  presetSelect.dispatchEvent(new Event('change'));
  syncVocationCards();
  updatePreviewInfo();
});

Agora, toda vez que você preencher vocações, chame:

renderVocationCards();

Na função populateVocationPresetSelect, depois do fillVocationSelect:

function populateVocationPresetSelect(source?: VocationsMap): void {
  if (!presetSelect) return;

  fillVocationSelect(presetSelect, source ?? (getRuntimeVocations() as VocationsMap), {
    includeKeyInLabel: true,
  });

  renderVocationCards();
}
14. Cards de outfit sincronizados com select

Na função renderOutfitOptions(), depois de montar o select, chame:

renderOutfitCards(availableOutfits);

Crie:

function renderOutfitCards(availableOutfits: OutfitPreset[]): void {
  if (!outfitCardsEl || !outfitSelect) return;

  outfitCardsEl.innerHTML = '';

  for (const outfit of availableOutfits) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'create-outfit-card';
    button.dataset.outfitCard = outfit.id;

    if (outfit.id === outfitSelect.value) {
      button.classList.add('is-selected');
    }

    button.innerHTML = `
      <strong>${outfit.name}</strong>
      <small>${outfit.id}</small>
    `;

    outfitCardsEl.appendChild(button);
  }
}

function syncOutfitCards(): void {
  if (!outfitCardsEl || !outfitSelect) return;

  outfitCardsEl.querySelectorAll<HTMLButtonElement>('[data-outfit-card]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.outfitCard === outfitSelect.value);
  });
}

outfitCardsEl?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-outfit-card]');
  if (!button || !outfitSelect) return;

  outfitSelect.value = button.dataset.outfitCard ?? outfitSelect.value;
  outfitSelect.dispatchEvent(new Event('change'));
  syncOutfitCards();
  updatePreviewInfo();
});

E no listener do outfit:

outfitSelect?.addEventListener('change', () => {
  syncOutfitCards();
  updatePreviewInfo();
  void updatePreview();
});

Se hoje já existe:

outfitSelect?.addEventListener('change', () => void updatePreview());

troque pela versão acima.

15. Atualizar renderOutfitOptions

A função atual está correta. Só acrescente os cards e preview info:

function renderOutfitOptions() {
  if (!outfitSelect || !presetSelect || !genderSelect) return;

  const vocation = presetSelect.value as VocationId;
  const gender = genderSelect.value as Gender;

  const availableOutfits = filterOutfitsByVocationAndGender(outfitPresets, vocation, gender)
    .filter((outfit) => outfit.showInCreation !== false);

  outfitSelect.innerHTML = '';

  for (const outfit of availableOutfits) {
    const option = document.createElement('option');
    option.value = outfit.id;
    option.textContent = outfit.name;
    outfitSelect.appendChild(option);
  }

  renderOutfitCards(availableOutfits);
  syncVocationCards();
  renderGenderCards();

  updatePreviewInfo();
  void updatePreview();
}

Se não houver outfit disponível, mostre erro amigável:

if (availableOutfits.length === 0) {
  setError('Nenhum visual disponível para esta vocação e gênero.');
  stopPreview();
  updatePreviewInfo();
  return;
}

Mas cuidado: se mostrar erro sempre que troca vocação e depois carrega, pode incomodar. Eu deixaria esse erro só no next2.

16. Melhorar Step 1

Hoje ele já valida nome. Troque:

errEl.hidden = true;

por:

setError(null);

E use:

document.getElementById('next1')?.addEventListener('click', () => {
  setError(null);

  const name = (document.getElementById('charName') as HTMLInputElement).value;
  const err = validateCharacterName(name);

  if (err) {
    setError(err);
    return;
  }

  charName = name.trim();
  updatePreviewInfo();
  showStep(2);
});

O validateCharacterName() atual aceita 3 a 20 caracteres e letras, números e espaços.

17. Melhorar Step 2

Troque o listener do next2 por:

document.getElementById('next2')?.addEventListener('click', () => {
  setError(null);

  selectedVocation = presetSelect.value as VocationId;
  selectedGender = genderSelect.value as Gender;
  selectedOutfitId = outfitSelect.value;

  const outfit = findOutfitPreset(outfitPresets, selectedOutfitId);

  if (!outfit) {
    setError('Selecione um visual válido.');
    return;
  }

  selectedSpriteSheetUrl = outfit.spriteSheetUrl;

  const vocationLabel =
    presetSelect.options[presetSelect.selectedIndex]?.textContent ?? selectedVocation;

  const genderLabel = formatGenderLabel(selectedGender);
  const outfitLabel = outfit.name;

  const summaryEl = document.getElementById('summaryName') as HTMLElement | null;

  if (summaryEl) {
    summaryEl.textContent =
      `${charName} — ${vocationLabel}, ${genderLabel}, Visual: ${outfitLabel}`;
  }

  updatePreviewInfo();
  showStep(3);
});
18. Melhorar confirmação

O botão final precisa ter loading para evitar duplo clique.

Troque o listener do confirmCreate por:

document.getElementById('confirmCreate')?.addEventListener('click', async () => {
  setError(null);

  if (!confirmCreateBtn) return;

  const originalText = confirmCreateBtn.textContent ?? 'Criar e voltar';

  try {
    confirmCreateBtn.disabled = true;
    confirmCreateBtn.textContent = 'Criando...';

    await createCharacter(
      session.userId,
      charName,
      selectedVocation,
      selectedGender,
      selectedOutfitId,
      selectedSpriteSheetUrl
    );

    track('character_created', {
      preset: selectedOutfitId,
      gender: selectedGender,
      vocation: selectedVocation,
    });

    location.href = 'characters.html';
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Erro ao criar personagem.');
    confirmCreateBtn.disabled = false;
    confirmCreateBtn.textContent = originalText;
  }
});
19. Ajustar init()

No fim da função init, depois de renderOutfitOptions(), chame:

renderGenderCards();
renderVocationCards();
updatePreviewInfo();

Ficaria assim:

async function init() {
  await loadRuntimeVocations();
  populateVocationPresetSelect();

  window.addEventListener(VOCATIONS_UPDATED_EVENT, (event) => {
    const detail = (event as CustomEvent<{ vocations: VocationsMap }>).detail;

    if (detail?.vocations) {
      populateVocationPresetSelect(detail.vocations);
      renderOutfitOptions();
      updatePreviewInfo();
    }
  });

  try {
    outfitPresets = await loadOutfitPresets();
  } catch (e) {
    console.error('Falha ao carregar outfit presets:', e);
    setError('Não foi possível carregar os visuais disponíveis.');
  }

  presetSelect?.addEventListener('change', () => {
    renderOutfitOptions();
    syncVocationCards();
    updatePreviewInfo();
  });

  genderSelect?.addEventListener('change', () => {
    renderOutfitOptions();
    renderGenderCards();
    updatePreviewInfo();
  });

  outfitSelect?.addEventListener('change', () => {
    syncOutfitCards();
    updatePreviewInfo();
    void updatePreview();
  });

  renderOutfitOptions();
  renderGenderCards();
  renderVocationCards();
  updatePreviewInfo();
}
20. Sobre animação do preview

A função startAnimatedPreview() atual está boa e deve ser preservada. Ela já faz:

cancela animação anterior com previewAnimId
limpa canvas
carrega JSON do personagem
carrega imagem da spritesheet
usa walk_down ou idle_down
calcula escala no canvas
aplica chroma key
usa imageSmoothingEnabled = false
requestAnimationFrame

Essa parte é essencial para mostrar o personagem real. Não troque por <img>.

21. Ordem exata de implementação

Faça nessa ordem:

1. Salvar imagem:
   public/assets/characters/bg-create-character.webp

2. Criar:
   src/characters/create-character.css

3. Alterar:
   src/characters/create.ts
   import './create-character.css'

4. Substituir:
   characters-new.html

5. Adicionar no create.ts:
   novos elementos DOM
   setError()
   updatePreviewInfo()
   setStepperActive()
   renderGenderCards()
   renderVocationCards()
   renderOutfitCards()
   syncVocationCards()
   syncOutfitCards()

6. Ajustar:
   showStep()
   init()
   next1
   next2
   confirmCreate

7. Testar criação de personagem masculino/feminino

8. Testar vocações diferentes

9. Testar outfit_presets.json

10. Testar se personagem aparece corretamente em characters.html

11. Testar se entra no play.html com sprite correta
22. Testes obrigatórios
Conta sem personagem
Criar personagem deve funcionar
Depois deve voltar para characters.html
O personagem deve aparecer selecionável
Nome inválido

Testar:

ab
nome com símbolo @
nome vazio
nome com mais de 20 caracteres

Esperado:

não avança para passo 2
mostra erro amigável
Trocar gênero

Esperado:

outfits mudam conforme gender
preview muda
preview lateral muda
Trocar vocação

Esperado:

outfits filtram por vocação
preview muda
resumo muda
Outfit sem JSON

Esperado:

usa fallback conservador
não quebra a tela
Criar personagem

Esperado:

chama createCharacter()
salva outfitConfig
salva appearance
salva position inicial
volta para characters.html
Limite de personagem

O sistema já tem MAX_CHARACTERS_PER_ACCOUNT = 4. Se a conta tiver 4 personagens, createCharacter() deve retornar erro.

23. O que não fazer agora

Eu não faria neste commit:

alterar backend
alterar tabela de personagens
alterar estrutura de CharacterRow
mexer em play.html
mexer em roster.ts
criar sistema completo de customização de cabelo/cor
criar troca avançada de outfit
criar pagamento por slot
criar vocação nova sem revisar vocations.json

Agora é só:

redesign da criação
mantendo fluxo real
mantendo outfit real
mantendo preview animado
mantendo createCharacter()
24. Commit recomendado

Nome do commit:

feat: redesign character creation page

Escopo:

characters-new.html
src/characters/create.ts
src/characters/create-character.css
public/assets/characters/bg-create-character.webp
25. Resumo da implementação

A página nova deve ficar bonita, mas obedecer ao sistema atual:

Nome → validateCharacterName()
Vocação → runtime vocations
Gênero → filter outfits
Outfit → outfit_presets.json
Preview → spriteSheetUrl + JSON real
Criar → createCharacter()
Voltar → characters.html

Essa é a regra mais importante:

A tela pode mudar visualmente, mas a criação precisa continuar salvando vocationId, gender, outfitId, spriteSheetUrl e outfitConfig corretamente.

Assim o personagem criado aparece igual na tela de seleção e dentro do jogo.