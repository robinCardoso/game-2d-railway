Já achei um ponto importante: seu projeto já está como MPA no Vite, com index.html, login.html, register.html, characters.html, characters-new.html e play.html separados. Então o certo é melhorar a landing atual, não criar SPA/React nem mudar o fluxo.

Pensou por 59s

Sim. Analisando a estrutura atual do seu projeto, eu faria a página inicial do Elarion Online respeitando o que você já tem.

Seu projeto já está organizado como Multi-Page Application com Vite, onde cada tela é um HTML independente: /, /login.html, /register.html, /characters.html, /characters-new.html, /play.html, /studio.html, /terms.html e /privacy.html. O README também confirma o fluxo padrão: / → login → characters → [novo personagem] → play.html?characterId=....

Além disso, o vite.config.ts já inclui index.html, login.html, register.html, characters.html, characters-new.html, play.html, terms.html e privacy.html como entradas do build. Então não precisa mudar a arquitetura do Vite para fazer a página inicial.

1. O que deve ser feito agora

A primeira página deve virar uma landing page de MMORPG, não apenas uma tela simples com texto.

Hoje sua home já existe em index.html, mas está bem básica: tem logo, links de entrar/criar conta, título “Bem-vindo a Elarion”, texto sobre continentes/dungeons/multiplayer/personagem e links para termos/privacidade/GM.

Eu faria assim:

index.html
src/
  landing/
    landing.ts
    landing.css

public/
  assets/
    brand/
      elarion-logo.png

    landing/
      bg-home.webp
      hero-portal.webp
      feature-open-world.png
      feature-skills.png
      feature-dungeon.png
      feature-items.png

    ui/
      icon-world.svg
      icon-sword.svg
      icon-shield.svg
      icon-dungeon.svg
      icon-gem.svg
      divider-gold.svg

O mais importante: não coloque botão como imagem. Botão deve ser CSS. Imagem deve ser usada para fundo, logo, ícones e ilustrações.

2. Onde cada imagem deve ficar

Eu usaria esta estrutura:

public/
  assets/
    brand/
      elarion-logo.png
      elarion-logo-small.png
      elarion-symbol.png

    landing/
      bg-home.webp
      bg-home-mobile.webp
      hero-portal.webp
      screenshot-world.webp
      screenshot-dungeon.webp

    ui/
      icon-world.svg
      icon-skill.svg
      icon-dungeon.svg
      icon-equipment.svg
      icon-discord.svg
      icon-steam.svg
      icon-playstore.svg
      ornament-corner.svg
      divider-gold.svg
Arquivos principais
public/assets/brand/elarion-logo.png

Logo principal.

Uso:

<img src="assets/brand/elarion-logo.png" alt="Elarion Online">
public/assets/landing/bg-home.webp

Fundo principal da página inicial.

Seria aquela arte grande com:

cidade medieval
portal mágico azul
montanhas
céu dramático
ambiente RPG

Uso no CSS:

background-image: url("/assets/landing/bg-home.webp");

Mas, considerando que você teve problemas no Electron/build, eu prefiro usar caminho relativo:

background-image: url("../../public/assets/landing/bg-home.webp");

Só que isso não é ideal dentro de CSS importado pelo Vite.

Para evitar dor de cabeça, minha recomendação prática é:

background-image: url("/assets/landing/bg-home.webp");

E depois testar no:

npm run dev
npm run build
npm run preview
npm run electron:build

Como seu projeto já usa servidor/Express e Vite, provavelmente /assets/... funciona bem.

public/assets/landing/bg-home-mobile.webp

Versão mobile do fundo.

No CSS:

@media (max-width: 768px) {
  .landing-hero {
    background-image: url("/assets/landing/bg-home-mobile.webp");
  }
}

Isso evita carregar uma imagem gigante no celular.

Ícones

Eu criaria estes:

icon-world.svg
icon-skill.svg
icon-dungeon.svg
icon-equipment.svg

Eles aparecem nos 4 cards:

Mundo Aberto
Treino de Skills
Dungeons Automatizadas
Itens Evolutivos

Pode ser SVG simples ou PNG 128x128.

3. O que deve ser imagem e o que deve ser CSS
Deve ser imagem
Logo
Fundo da home
Portal/cidade/castelo
Ícones dos cards
Ornamentos decorativos
Screenshots
Deve ser HTML/CSS
Botões
Cards
Menus
Header
Textos
Inputs
Bordas dos painéis
Hover
Sombras
Gradientes

Botão como imagem parece bonito no começo, mas atrapalha depois. Com CSS você consegue:

trocar texto
traduzir
ajustar mobile
fazer hover
fazer disabled
fazer loading
usar no login/register/characters
4. Como deve ficar a home visualmente

Estrutura da página:

HEADER
  Logo
  Início
  Notícias
  Ranking
  Comunidade
  Entrar
  Jogar Agora

HERO
  Logo grande
  Título
  Subtítulo
  Botão Jogar Agora
  Botão Criar Conta
  Botão Assistir Trailer, opcional

FEATURES
  Mundo Aberto
  Treino de Skills
  Dungeons Automatizadas
  Itens Evolutivos

COMO FUNCIONA
  Mundo aberto = manual
  Dungeons = automatizadas

VOCAÇÕES
  Knight
  Mage
  Druid
  Archer

CTA FINAL
  Comece sua jornada em Elarion

FOOTER
  Termos
  Privacidade
  Suporte
  GM Studio, se quiser manter escondido/dev
5. Código recomendado
5.1. Novo index.html

Substituiria o index.html atual por algo assim:

<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Elarion Online — MMORPG 2D</title>
    <meta
      name="description"
      content="Elarion Online é um MMORPG 2D de mundo aberto com treino de skills, equipamentos evolutivos e dungeons automatizadas."
    />
  </head>

  <body class="landing-page">
    <header class="landing-header">
      <a class="landing-brand" href="index.html" aria-label="Elarion Online">
        <img
          src="/assets/brand/elarion-logo.png"
          alt="Elarion Online"
          class="landing-brand__logo"
        />
      </a>

      <nav class="landing-nav" aria-label="Navegação principal">
        <a href="#features">Recursos</a>
        <a href="#vocations">Vocações</a>
        <a href="#world">Mundo</a>
        <a href="login.html">Entrar</a>
      </nav>

      <a class="game-button game-button--small" href="register.html">
        Jogar Agora
      </a>
    </header>

    <main>
      <section class="landing-hero">
        <div class="landing-hero__overlay"></div>

        <div class="landing-hero__content">
          <img
            class="landing-hero__logo"
            src="/assets/brand/elarion-logo.png"
            alt="Elarion Online"
          />

          <p class="landing-hero__eyebrow">
            MMORPG 2D Online
          </p>

          <h1>
            Explore mundos abertos, treine suas skills e evolua seu personagem.
          </h1>

          <p class="landing-hero__description">
            Elarion Online combina a nostalgia dos MMORPGs clássicos 2D com
            progressão moderna, equipamentos evolutivos e dungeons automatizadas.
          </p>

          <div class="landing-hero__actions">
            <a class="game-button" href="register.html">
              Criar Conta
            </a>

            <a class="game-button game-button--secondary" href="login.html">
              Entrar
            </a>
          </div>

          <p class="landing-hero__note">
            Treine. Explore. Evolua.
          </p>
        </div>
      </section>

      <section id="features" class="landing-section landing-features">
        <div class="landing-section__heading">
          <p class="landing-kicker">Recursos principais</p>
          <h2>Um mundo vivo para evoluir do seu jeito</h2>
        </div>

        <div class="feature-grid">
          <article class="feature-card">
            <img src="/assets/ui/icon-world.svg" alt="" />
            <h3>Mundo Aberto</h3>
            <p>
              Explore cidades, florestas, cavernas, portais e áreas perigosas
              com outros jogadores em tempo real.
            </p>
          </article>

          <article class="feature-card">
            <img src="/assets/ui/icon-skill.svg" alt="" />
            <h3>Treino de Skills</h3>
            <p>
              Evolua habilidades como melee, defesa, distância e magia através
              do uso real do personagem.
            </p>
          </article>

          <article class="feature-card">
            <img src="/assets/ui/icon-dungeon.svg" alt="" />
            <h3>Dungeons Automatizadas</h3>
            <p>
              Entre em dungeons especiais para enfrentar desafios automatizados
              e progredir mesmo com menos tempo.
            </p>
          </article>

          <article class="feature-card">
            <img src="/assets/ui/icon-equipment.svg" alt="" />
            <h3>Itens Evolutivos</h3>
            <p>
              Armas, armaduras e acessórios acompanham sua jornada com
              progressão de nível e poder.
            </p>
          </article>
        </div>
      </section>

      <section id="world" class="landing-section landing-split">
        <div>
          <p class="landing-kicker">Como funciona</p>
          <h2>Mundo aberto manual. Dungeons com automação.</h2>
          <p>
            No mundo aberto, cada movimento, batalha e decisão é controlada pelo
            jogador. Nas dungeons, você pode usar sistemas automatizados para
            evoluir de forma mais estratégica.
          </p>
        </div>

        <div class="world-rules">
          <div class="world-rule">
            <strong>Mundo Aberto</strong>
            <span>Exploração, PvP, bosses, coleta e interação real.</span>
          </div>

          <div class="world-rule">
            <strong>Dungeons</strong>
            <span>Combate automatizado, recompensas e progressão controlada.</span>
          </div>
        </div>
      </section>

      <section id="vocations" class="landing-section landing-vocations">
        <div class="landing-section__heading">
          <p class="landing-kicker">Escolha seu caminho</p>
          <h2>Vocações iniciais</h2>
        </div>

        <div class="vocation-grid">
          <article class="vocation-card vocation-card--knight">
            <h3>Knight</h3>
            <p>Resistente, corpo a corpo e defesa alta.</p>
          </article>

          <article class="vocation-card vocation-card--mage">
            <h3>Mage</h3>
            <p>Dano mágico alto, controle e poder arcano.</p>
          </article>

          <article class="vocation-card vocation-card--druid">
            <h3>Druid</h3>
            <p>Cura, suporte e magia natural.</p>
          </article>

          <article class="vocation-card vocation-card--archer">
            <h3>Archer</h3>
            <p>Distância, velocidade e precisão.</p>
          </article>
        </div>
      </section>

      <section class="landing-cta">
        <h2>Sua jornada em Elarion começa agora.</h2>
        <p>Crie sua conta, escolha seu personagem e entre no mundo.</p>

        <div class="landing-cta__actions">
          <a class="game-button" href="register.html">
            Jogar Agora
          </a>

          <a class="game-button game-button--secondary" href="login.html">
            Já tenho conta
          </a>
        </div>
      </section>
    </main>

    <footer class="landing-footer">
      <span>© 2026 Elarion Online</span>

      <div>
        <a href="terms.html">Termos</a>
        <a href="privacy.html">Privacidade</a>
        <a href="studio.html">GM Studio</a>
      </div>
    </footer>

    <script type="module" src="/src/landing/landing.ts"></script>
  </body>
</html>
5.2. Criar src/landing/landing.ts

Esse arquivo pode ser simples no começo:

import './landing.css';

const header = document.querySelector('.landing-header');

function updateHeaderState(): void {
  if (!header) return;

  const isScrolled = window.scrollY > 24;
  header.classList.toggle('landing-header--scrolled', isScrolled);
}

window.addEventListener('scroll', updateHeaderState, { passive: true });
updateHeaderState();

Por enquanto ele só importa o CSS e adiciona uma classe no header quando rolar a página.

5.3. Criar src/landing/landing.css
:root {
  --eo-bg: #05070c;
  --eo-panel: rgba(9, 13, 22, 0.82);
  --eo-panel-solid: #0e1420;
  --eo-gold: #d8aa4f;
  --eo-gold-light: #f4d078;
  --eo-gold-dark: #7a4b18;
  --eo-blue: #2fc7ff;
  --eo-purple: #8b5cf6;
  --eo-text: #f7efe1;
  --eo-muted: #a7b0c1;
  --eo-border: rgba(216, 170, 79, 0.35);
  --eo-danger: #ef4444;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body.landing-page {
  margin: 0;
  min-height: 100vh;
  background: var(--eo-bg);
  color: var(--eo-text);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

.landing-header {
  position: fixed;
  z-index: 50;
  top: 0;
  left: 0;
  right: 0;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;

  min-height: 76px;
  padding: 14px clamp(18px, 4vw, 64px);

  background: linear-gradient(
    180deg,
    rgba(2, 5, 10, 0.92),
    rgba(2, 5, 10, 0.45)
  );
  border-bottom: 1px solid rgba(216, 170, 79, 0.18);
  backdrop-filter: blur(10px);
  transition:
    background 180ms ease,
    border-color 180ms ease,
    min-height 180ms ease;
}

.landing-header--scrolled {
  min-height: 64px;
  background: rgba(2, 5, 10, 0.94);
  border-bottom-color: rgba(216, 170, 79, 0.35);
}

.landing-brand {
  display: inline-flex;
  align-items: center;
  min-width: 160px;
}

.landing-brand__logo {
  display: block;
  width: 154px;
  max-height: 54px;
  object-fit: contain;
}

.landing-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 2vw, 28px);

  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(247, 239, 225, 0.78);
}

.landing-nav a {
  transition:
    color 160ms ease,
    text-shadow 160ms ease;
}

.landing-nav a:hover {
  color: var(--eo-gold-light);
  text-shadow: 0 0 18px rgba(216, 170, 79, 0.45);
}

.game-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  min-height: 48px;
  padding: 0 30px;

  border: 1px solid rgba(255, 220, 130, 0.76);
  border-radius: 6px;

  background:
    linear-gradient(180deg, rgba(255, 220, 126, 0.22), rgba(0, 0, 0, 0)),
    linear-gradient(180deg, #b97d2e 0%, #7a4b18 52%, #4a2a10 100%);

  color: #fff5d2;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 0 24px rgba(216, 170, 79, 0.18),
    0 8px 24px rgba(0, 0, 0, 0.35);

  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  transition:
    transform 140ms ease,
    filter 140ms ease,
    box-shadow 140ms ease;
}

.game-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 0 34px rgba(216, 170, 79, 0.34),
    0 12px 28px rgba(0, 0, 0, 0.42);
}

.game-button:active {
  transform: translateY(0);
}

.game-button--small {
  min-height: 40px;
  padding-inline: 20px;
  font-size: 0.74rem;
}

.game-button--secondary {
  background:
    linear-gradient(180deg, rgba(89, 166, 255, 0.12), rgba(0, 0, 0, 0)),
    rgba(7, 12, 22, 0.76);

  border-color: rgba(87, 178, 255, 0.48);
  color: #d8efff;
}

.landing-hero {
  position: relative;
  min-height: 100vh;

  display: grid;
  place-items: center;

  padding: 140px 22px 80px;

  background-image: url("/assets/landing/bg-home.webp");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  overflow: hidden;
}

.landing-hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 34%;
  background: linear-gradient(180deg, transparent, var(--eo-bg));
  pointer-events: none;
}

.landing-hero__overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 62% 48%, rgba(47, 199, 255, 0.18), transparent 28%),
    radial-gradient(circle at 50% 40%, rgba(216, 170, 79, 0.10), transparent 34%),
    linear-gradient(90deg, rgba(2, 5, 10, 0.84), rgba(2, 5, 10, 0.38), rgba(2, 5, 10, 0.78));
  pointer-events: none;
}

.landing-hero__content {
  position: relative;
  z-index: 2;

  width: min(920px, 100%);
  margin-inline: auto;
  text-align: center;
}

.landing-hero__logo {
  width: min(440px, 86vw);
  margin-bottom: 20px;
  filter: drop-shadow(0 0 28px rgba(216, 170, 79, 0.35));
}

.landing-hero__eyebrow,
.landing-kicker {
  margin: 0 0 12px;

  color: var(--eo-gold-light);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.landing-hero h1 {
  width: min(820px, 100%);
  margin: 0 auto;

  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2.2rem, 5vw, 5.3rem);
  line-height: 0.98;
  letter-spacing: -0.04em;

  text-shadow:
    0 4px 20px rgba(0, 0, 0, 0.65),
    0 0 30px rgba(47, 199, 255, 0.18);
}

.landing-hero__description {
  width: min(720px, 100%);
  margin: 24px auto 0;

  color: rgba(247, 239, 225, 0.84);
  font-size: clamp(1rem, 1.4vw, 1.2rem);
  line-height: 1.7;
}

.landing-hero__actions,
.landing-cta__actions {
  display: flex;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 34px;
}

.landing-hero__note {
  margin-top: 26px;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.05rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.landing-section {
  position: relative;
  width: min(1180px, calc(100% - 36px));
  margin: 0 auto;
  padding: 88px 0;
}

.landing-section__heading {
  width: min(760px, 100%);
  margin: 0 auto 36px;
  text-align: center;
}

.landing-section h2,
.landing-cta h2 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.5vw, 3.4rem);
  line-height: 1.05;
}

.feature-grid,
.vocation-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.feature-card,
.vocation-card,
.world-rule {
  position: relative;
  overflow: hidden;

  min-height: 220px;
  padding: 24px;

  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
    rgba(10, 16, 27, 0.76);

  border: 1px solid var(--eo-border);
  border-radius: 12px;

  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 18px 48px rgba(0, 0, 0, 0.24);
}

.feature-card::before,
.vocation-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top, rgba(216, 170, 79, 0.14), transparent 42%);
  opacity: 0;
  transition: opacity 160ms ease;
}

.feature-card:hover::before,
.vocation-card:hover::before {
  opacity: 1;
}

.feature-card img {
  width: 46px;
  height: 46px;
  margin-bottom: 20px;
  object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(216, 170, 79, 0.35));
}

.feature-card h3,
.vocation-card h3 {
  position: relative;
  margin: 0 0 10px;

  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.35rem;
}

.feature-card p,
.vocation-card p,
.landing-split p,
.world-rule span,
.landing-cta p {
  position: relative;
  margin: 0;
  color: var(--eo-muted);
  line-height: 1.65;
}

.landing-split {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 36px;
  align-items: center;
}

.world-rules {
  display: grid;
  gap: 16px;
}

.world-rule {
  min-height: auto;
}

.world-rule strong {
  display: block;
  margin-bottom: 8px;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.25rem;
}

.vocation-card {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;

  background-size: cover;
  background-position: center;
}

.vocation-card--knight {
  background-image:
    linear-gradient(180deg, transparent, rgba(3, 5, 10, 0.92)),
    url("/assets/landing/vocation-knight.webp");
}

.vocation-card--mage {
  background-image:
    linear-gradient(180deg, transparent, rgba(3, 5, 10, 0.92)),
    url("/assets/landing/vocation-mage.webp");
}

.vocation-card--druid {
  background-image:
    linear-gradient(180deg, transparent, rgba(3, 5, 10, 0.92)),
    url("/assets/landing/vocation-druid.webp");
}

.vocation-card--archer {
  background-image:
    linear-gradient(180deg, transparent, rgba(3, 5, 10, 0.92)),
    url("/assets/landing/vocation-archer.webp");
}

.landing-cta {
  width: min(980px, calc(100% - 36px));
  margin: 30px auto 90px;
  padding: 58px 24px;

  text-align: center;
  background:
    radial-gradient(circle at 50% 0%, rgba(47, 199, 255, 0.13), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
    rgba(10, 16, 27, 0.78);

  border: 1px solid var(--eo-border);
  border-radius: 18px;
}

.landing-cta p {
  margin-top: 14px;
}

.landing-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;

  padding: 24px clamp(18px, 4vw, 64px);

  color: rgba(247, 239, 225, 0.62);
  border-top: 1px solid rgba(216, 170, 79, 0.18);
  background: rgba(2, 5, 10, 0.86);
}

.landing-footer div {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.landing-footer a:hover {
  color: var(--eo-gold-light);
}

@media (max-width: 980px) {
  .landing-nav {
    display: none;
  }

  .feature-grid,
  .vocation-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .landing-split {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .landing-header {
    min-height: 64px;
  }

  .landing-brand__logo {
    width: 124px;
  }

  .landing-header > .game-button {
    display: none;
  }

  .landing-hero {
    min-height: 92vh;
    padding-top: 110px;
    background-image: url("/assets/landing/bg-home-mobile.webp");
  }

  .landing-hero__logo {
    width: min(310px, 88vw);
  }

  .feature-grid,
  .vocation-grid {
    grid-template-columns: 1fr;
  }

  .feature-card,
  .vocation-card {
    min-height: 190px;
  }

  .landing-footer {
    flex-direction: column;
    text-align: center;
  }
}
6. Imagens que você precisa gerar

Para a home, eu geraria primeiro só essas:

Obrigatórias
public/assets/brand/elarion-logo.png
public/assets/landing/bg-home.webp
public/assets/landing/bg-home-mobile.webp
public/assets/ui/icon-world.svg
public/assets/ui/icon-skill.svg
public/assets/ui/icon-dungeon.svg
public/assets/ui/icon-equipment.svg
Segunda fase
public/assets/landing/vocation-knight.webp
public/assets/landing/vocation-mage.webp
public/assets/landing/vocation-druid.webp
public/assets/landing/vocation-archer.webp
Terceira fase
public/assets/landing/screenshot-world.webp
public/assets/landing/screenshot-dungeon.webp
public/assets/landing/screenshot-city.webp
7. Prompts para gerar as imagens
bg-home.webp
Dark fantasy MMORPG 2D game landing page background, medieval city in the distance, ancient stone portal glowing blue on the right side, wide cinematic composition, dramatic sky, mountains, old road leading to the portal, premium fantasy game art, no text, no logo, no UI, 16:9, high detail, dark blue and gold atmosphere
bg-home-mobile.webp
Vertical dark fantasy MMORPG mobile landing background, ancient magical blue portal, medieval stone ruins, distant fantasy city, dramatic sky, centered composition, premium RPG game art, no text, no logo, no UI, 9:16
vocation-knight.webp
Fantasy RPG vocation card background, armored knight with sword and shield, dark medieval atmosphere, gold highlights, no text, no UI, vertical card composition
vocation-mage.webp
Fantasy RPG vocation card background, blue robed mage holding glowing staff, arcane magic energy, dark fantasy atmosphere, no text, no UI, vertical card composition
vocation-druid.webp
Fantasy RPG vocation card background, nature druid with green magic, forest ruins, healing energy, dark fantasy atmosphere, no text, no UI, vertical card composition
vocation-archer.webp
Fantasy RPG vocation card background, hooded archer with bow, forest and mountain atmosphere, sharp silhouette, no text, no UI, vertical card composition
8. Botões: não gerar como imagem

Crie os botões em CSS.

Você vai usar a classe:

<a class="game-button" href="register.html">Jogar Agora</a>

Ou:

<button class="game-button" type="submit">Entrar</button>

A vantagem é que o mesmo botão pode ser usado depois em:

index.html
login.html
register.html
characters.html
characters-new.html

Hoje suas páginas de login/registro/personagens já importam src/shared/shell.css, e esse CSS já define .shell-page, .shell-card, .shell-btn, .char-grid, .char-card etc. Depois eu transformaria esse shell.css em um tema mais RPG usando as mesmas ideias da landing.

9. Precisa alterar o vite.config.ts?

Para a página inicial, não precisa.

O vite.config.ts já tem:

main: path.resolve(__dirname, 'index.html')

e também já registra as outras páginas.

Só precisaria alterar se você criasse uma nova página, por exemplo:

news.html
ranking.html
download.html

Aí sim teria que adicionar no rollupOptions.input.

10. Cuidados por causa do Electron

Como você já teve problema com páginas no Electron, eu seguiria estas regras:

Evite links absolutos entre páginas

Prefira:

<a href="login.html">Entrar</a>
<a href="register.html">Criar Conta</a>
<a href="characters.html">Personagens</a>

Evite:

<a href="/login.html">Entrar</a>

Porque /login.html pode funcionar no browser, mas causar problema dependendo de como o Electron estiver servindo o build.

Para assets, teste bem

Você pode começar com:

<img src="/assets/brand/elarion-logo.png">

Se no Electron build não carregar, troque para:

<img src="assets/brand/elarion-logo.png">

Para CSS, se /assets/... falhar no Electron, podemos ajustar para variável CSS inline no HTML, mas primeiro eu testaria o padrão normal.

11. Como testar depois de implementar

Rodar:

npm run dev

Abrir:

http://localhost:5173/

Depois testar produção:

npm run build
npm run preview

Abrir:

http://localhost:4173/

Depois testar Electron:

npm run electron:dev

E depois:

npm run electron:build

O projeto já tem scripts para dev, build, preview, Electron dev e Electron build no package.json.

12. Ordem exata de implementação

Eu faria nesta ordem:

1. Criar pastas:
   public/assets/brand
   public/assets/landing
   public/assets/ui
   src/landing

2. Colocar logo:
   public/assets/brand/elarion-logo.png

3. Colocar fundo:
   public/assets/landing/bg-home.webp
   public/assets/landing/bg-home-mobile.webp

4. Criar:
   src/landing/landing.ts
   src/landing/landing.css

5. Substituir o conteúdo de index.html

6. Rodar:
   npm run dev

7. Ajustar responsivo

8. Rodar:
   npm run build
   npm run preview

9. Testar Electron
13. O que eu não faria agora

Eu não criaria ainda:

ranking real
notícias dinâmicas
status real do servidor
download launcher
login Steam
integração Play Store
trailer
loja

Para a primeira versão, a home precisa só fazer bem isto:

mostrar o jogo
dar identidade ao Elarion Online
explicar mundo aberto + dungeons idle
levar para criar conta/login