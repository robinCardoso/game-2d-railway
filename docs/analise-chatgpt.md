Analisei o fluxo atual do repositório. Como você já concluiu a página inicial, o próximo passo correto é deixar criar conta e login com o mesmo padrão visual RPG, mas sem quebrar a autenticação que já funciona.

Hoje seu projeto já tem login.html e register.html como páginas separadas no Vite, e o build já registra essas páginas no vite.config.ts. Então não precisa criar SPA, React ou mudar rota. O certo é evoluir o visual dessas duas páginas mantendo os mesmos arquivos e IDs dos formulários.

1. Diagnóstico do sistema atual

Hoje o login.html é bem simples: logo, título “Entrar”, texto “Acesse sua conta para escolher um personagem”, campos de e-mail/senha e links para criar conta/voltar.

O register.html também está simples: logo, título “Criar conta”, texto “Grátis — comece sua aventura”, e-mail, senha, confirmar senha, aceite dos termos e botão registrar.

A parte boa: a lógica já está estruturada.

No login, o TypeScript já faz:

await redirectIfAuthenticated();
await signIn(email, password);
location.href = resolveAuthNextRedirect(next);

Ou seja, se o jogador já estiver logado, ele vai para characters.html; se veio de uma página protegida com ?next=, volta para o destino correto.

No registro, o TypeScript já valida se as senhas coincidem, chama signUp(email, password), dispara track('register_complete') e redireciona para characters.html.

A autenticação real já está preparada para API: o authClient.ts salva o token em localStorage com a chave game2d_auth_token, usa /api/auth/register, /api/auth/login, /api/auth/me e /api/auth/logout.

Então o foco agora deve ser:

melhorar visual
melhorar UX
melhorar mensagens
adicionar loading
adicionar botão mostrar senha
manter IDs e fluxo atual
não quebrar Electron
não quebrar characters.html
2. Regra principal

Eu não mexeria no sistema de autenticação agora.

Você já tem:

login.ts
register.ts
authGuard.ts
authClient.ts
authNavigation.ts

O que eu faria é melhorar:

login.html
register.html
src/auth/login.ts
src/auth/register.ts
src/auth/auth-pages.css
public/assets/auth/bg-login.webp
public/assets/auth/bg-register.webp
3. Estrutura de arquivos recomendada

Crie uma pasta específica para assets de autenticação:

public/
  assets/
    auth/
      bg-login.webp
      bg-register.webp

    brand/
      elarion-logo.png

src/
  auth/
    login.ts
    register.ts
    auth-pages.css

Como você já gerou as imagens:

bg-register.webp = imagem de criar conta
bg-login.webp = imagem de entrar no jogo

Eu colocaria assim:

public/assets/auth/bg-register.webp
public/assets/auth/bg-login.webp
4. Por que criar auth-pages.css

Hoje login.ts e register.ts importam ../shared/shell.css. Esse CSS também é usado em outras telas, como seleção/criação de personagem.

Então, para não estragar outras páginas, eu criaria:

src/auth/auth-pages.css

E nele importaria o shell atual:

@import '../shared/shell.css';

Depois adicionaria estilos específicos para login/registro.

Então você mudaria:

import '../shared/shell.css';

para:

import './auth-pages.css';

em:

src/auth/login.ts
src/auth/register.ts

Assim o visual RPG fica só no login/register.

5. Como deve ficar a página de criar conta
Objetivo da tela

A tela de criar conta precisa passar sensação de:

começo de jornada
entrada em um mundo novo
fantasia
conta criada rápido
sem formulário cansativo

Layout recomendado:

[Fundo fantasia escuro]

------------------------------------------------
| lado esquerdo: chamada emocional             |
|                                              |
| "Comece sua jornada em Elarion"              |
| "Crie sua conta e escolha seu primeiro herói"|
|                                              |
| lado direito: painel de cadastro             |
| Logo Elarion                                 |
| E-mail                                       |
| Senha                                        |
| Confirmar senha                              |
| Aceite dos termos                            |
| [Criar Conta]                                |
------------------------------------------------

No mobile:

Logo
Criar conta
Campos
Botão
Link para entrar
6. Como deve ficar a página de login
Objetivo da tela

A tela de login precisa parecer uma entrada no castelo/mundo:

voltar ao jogo
continuar jornada
entrar no mundo

Layout recomendado:

[Fundo castelo/corredor]

------------------------------------
| painel central                    |
| Logo Elarion                      |
| Entrar no Jogo                    |
| E-mail                            |
| Senha                             |
| lembrar de mim opcional           |
| [Entrar]                          |
| Esqueci senha | Criar conta       |
------------------------------------
7. Campos e IDs que precisam ser preservados

Muito importante: seus arquivos TS já buscam elementos por ID.

No login, preserve:

<form id="loginForm">
<input id="email">
<input id="password">
<p id="loginError">

Porque login.ts usa loginForm, loginError, email e password.

No registro, preserve:

<form id="registerForm">
<input id="email">
<input id="password">
<input id="password2">
<p id="registerError">

Porque register.ts usa registerForm, registerError, email, password e password2.

8. Novo register.html

Eu faria assim:

<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Criar conta — Elarion Online</title>
    <meta
      name="description"
      content="Crie sua conta no Elarion Online e comece sua jornada em um MMORPG 2D de mundo aberto."
    />
  </head>

  <body class="auth-page auth-page--register">
    <main class="auth-layout">
      <section class="auth-hero auth-hero--register" aria-label="Elarion Online">
        <div class="auth-hero__content">
          <a href="index.html" class="auth-back-link">← Voltar ao início</a>

          <p class="auth-kicker">Elarion Online</p>

          <h1>Comece sua jornada em Elarion.</h1>

          <p>
            Crie sua conta, escolha seu primeiro personagem e entre em um mundo
            aberto com treino de skills, equipamentos evolutivos e dungeons
            automatizadas.
          </p>

          <div class="auth-benefits">
            <span>Mundo aberto</span>
            <span>Treino de skills</span>
            <span>Dungeons idle</span>
          </div>
        </div>
      </section>

      <section class="auth-panel-wrap" aria-label="Criar conta">
        <form id="registerForm" class="auth-card" autocomplete="on">
          <div class="auth-logo">
            <img
              src="assets/brand/elarion-logo.png"
              alt="Elarion Online"
              class="auth-logo__img"
            />
          </div>

          <div class="auth-heading">
            <h2>Criar conta</h2>
            <p>Grátis — comece sua aventura agora.</p>
          </div>

          <p id="registerError" class="auth-error" hidden></p>

          <div class="auth-field">
            <label for="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              inputmode="email"
              placeholder="seuemail@exemplo.com"
              autocomplete="email"
              required
            />
          </div>

          <div class="auth-field">
            <label for="password">Senha</label>

            <div class="auth-password">
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                autocomplete="new-password"
                minlength="8"
                required
              />

              <button
                class="auth-password__toggle"
                type="button"
                data-toggle-password="password"
                aria-label="Mostrar senha"
              >
                👁
              </button>
            </div>
          </div>

          <div class="auth-field">
            <label for="password2">Confirmar senha</label>

            <div class="auth-password">
              <input
                id="password2"
                name="password2"
                type="password"
                placeholder="Repita sua senha"
                autocomplete="new-password"
                minlength="8"
                required
              />

              <button
                class="auth-password__toggle"
                type="button"
                data-toggle-password="password2"
                aria-label="Mostrar confirmação de senha"
              >
                👁
              </button>
            </div>
          </div>

          <label class="auth-check">
            <input id="terms" type="checkbox" required />
            <span>
              Aceito os
              <a href="terms.html">termos de uso</a>
              e a
              <a href="privacy.html">política de privacidade</a>.
            </span>
          </label>

          <button class="game-button auth-submit" type="submit">
            Criar conta
          </button>

          <div class="auth-links">
            <span>Já tem conta?</span>
            <a href="login.html">Entrar</a>
          </div>
        </form>
      </section>
    </main>

    <script type="module" src="/src/auth/register.ts"></script>
  </body>
</html>

Observação importante: eu usei caminhos relativos para imagens:

src="assets/brand/elarion-logo.png"

Isso tende a ser mais seguro no Electron, porque seu vite.config.ts está com base: './'.

9. Novo login.html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Entrar — Elarion Online</title>
    <meta
      name="description"
      content="Entre na sua conta do Elarion Online e continue sua jornada."
    />
  </head>

  <body class="auth-page auth-page--login">
    <main class="auth-layout auth-layout--center">
      <section class="auth-panel-wrap auth-panel-wrap--center" aria-label="Entrar">
        <form id="loginForm" class="auth-card" autocomplete="on">
          <a href="index.html" class="auth-back-link auth-back-link--inside">
            ← Voltar ao início
          </a>

          <div class="auth-logo">
            <img
              src="assets/brand/elarion-logo.png"
              alt="Elarion Online"
              class="auth-logo__img"
            />
          </div>

          <div class="auth-heading">
            <h1>Entrar no jogo</h1>
            <p>Acesse sua conta e continue sua jornada.</p>
          </div>

          <p id="loginError" class="auth-error" hidden></p>

          <div class="auth-field">
            <label for="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              inputmode="email"
              placeholder="seuemail@exemplo.com"
              autocomplete="email"
              required
            />
          </div>

          <div class="auth-field">
            <label for="password">Senha</label>

            <div class="auth-password">
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Digite sua senha"
                autocomplete="current-password"
                required
              />

              <button
                class="auth-password__toggle"
                type="button"
                data-toggle-password="password"
                aria-label="Mostrar senha"
              >
                👁
              </button>
            </div>
          </div>

          <div class="auth-row">
            <label class="auth-check auth-check--compact">
              <input id="remember" type="checkbox" checked />
              <span>Lembrar de mim</span>
            </label>

            <a class="auth-muted-link" href="#" aria-disabled="true">
              Esqueci minha senha
            </a>
          </div>

          <button class="game-button auth-submit" type="submit">
            Entrar
          </button>

          <div class="auth-links">
            <span>Ainda não tem conta?</span>
            <a href="register.html">Criar conta</a>
          </div>
        </form>
      </section>
    </main>

    <script type="module" src="/src/auth/login.ts"></script>
  </body>
</html>

Sobre “Esqueci minha senha”: como não vi endpoint de recuperação no fluxo atual, eu deixaria visualmente preparado, mas sem ativar ainda. O authClient.ts hoje mostra endpoints de registro, login, logout e me, mas não mostra fluxo de recuperação de senha.

10. Novo src/auth/auth-pages.css
@import '../shared/shell.css';

:root {
  --eo-bg: #05070c;
  --eo-panel: rgba(8, 12, 20, 0.88);
  --eo-panel-strong: rgba(7, 10, 16, 0.96);
  --eo-border: rgba(216, 170, 79, 0.36);
  --eo-gold: #d8aa4f;
  --eo-gold-light: #f5d17d;
  --eo-gold-dark: #6f4317;
  --eo-blue: #35c8ff;
  --eo-text: #f8efd8;
  --eo-muted: #a9b1c3;
  --eo-danger: #ff6b6b;
}

* {
  box-sizing: border-box;
}

body.auth-page {
  margin: 0;
  min-height: 100vh;
  color: var(--eo-text);
  background: var(--eo-bg);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body.auth-page--register {
  background:
    linear-gradient(90deg, rgba(2, 4, 9, 0.55), rgba(2, 4, 9, 0.88)),
    url("/assets/auth/bg-register.webp");
  background-size: cover;
  background-position: center;
}

body.auth-page--login {
  background:
    radial-gradient(circle at center, rgba(44, 180, 255, 0.08), transparent 32%),
    linear-gradient(90deg, rgba(2, 4, 9, 0.82), rgba(2, 4, 9, 0.42), rgba(2, 4, 9, 0.86)),
    url("/assets/auth/bg-login.webp");
  background-size: cover;
  background-position: center;
}

.auth-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 520px);
}

.auth-layout--center {
  display: grid;
  grid-template-columns: 1fr;
  place-items: center;
  padding: 28px;
}

.auth-hero {
  min-height: 100vh;
  display: flex;
  align-items: flex-end;
  padding: clamp(28px, 5vw, 72px);
}

.auth-hero__content {
  width: min(680px, 100%);
  padding-bottom: 40px;
}

.auth-back-link {
  display: inline-flex;
  margin-bottom: 28px;
  color: rgba(248, 239, 216, 0.72);
  font-size: 0.9rem;
  text-decoration: none;
  transition: color 160ms ease;
}

.auth-back-link:hover {
  color: var(--eo-gold-light);
}

.auth-back-link--inside {
  margin-bottom: 18px;
}

.auth-kicker {
  margin: 0 0 12px;
  color: var(--eo-gold-light);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.auth-hero h1 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2.6rem, 5vw, 5.6rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
  text-shadow: 0 8px 32px rgba(0, 0, 0, 0.72);
}

.auth-hero p {
  width: min(620px, 100%);
  margin: 24px 0 0;
  color: rgba(248, 239, 216, 0.78);
  font-size: 1.08rem;
  line-height: 1.7;
}

.auth-benefits {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}

.auth-benefits span {
  padding: 8px 12px;
  border: 1px solid rgba(216, 170, 79, 0.35);
  border-radius: 999px;
  background: rgba(7, 10, 16, 0.58);
  color: var(--eo-gold-light);
  font-size: 0.8rem;
  font-weight: 700;
}

.auth-panel-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
  background:
    linear-gradient(90deg, transparent, rgba(2, 4, 9, 0.72)),
    rgba(2, 4, 9, 0.22);
  backdrop-filter: blur(2px);
}

.auth-panel-wrap--center {
  min-height: auto;
  width: min(460px, 100%);
  padding: 0;
  background: transparent;
  backdrop-filter: none;
}

.auth-card {
  position: relative;
  width: min(460px, 100%);
  padding: clamp(24px, 4vw, 38px);

  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
    var(--eo-panel);

  border: 1px solid var(--eo-border);
  border-radius: 18px;

  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 0 0 1px rgba(0, 0, 0, 0.6),
    0 28px 80px rgba(0, 0, 0, 0.58);

  overflow: hidden;
}

.auth-card::before,
.auth-card::after {
  content: "";
  position: absolute;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(245, 209, 125, 0.7),
    transparent
  );
  pointer-events: none;
}

.auth-card::before {
  top: 12px;
}

.auth-card::after {
  bottom: 12px;
}

.auth-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.auth-logo__img {
  width: min(260px, 80%);
  max-height: 110px;
  object-fit: contain;
  filter: drop-shadow(0 0 18px rgba(216, 170, 79, 0.24));
}

.auth-heading {
  text-align: center;
  margin-bottom: 24px;
}

.auth-heading h1,
.auth-heading h2 {
  margin: 0;
  color: var(--eo-gold-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.auth-heading p {
  margin: 8px 0 0;
  color: var(--eo-muted);
  font-size: 0.92rem;
}

.auth-error {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 107, 107, 0.42);
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.22);
  color: #fecaca;
  font-size: 0.88rem;
  line-height: 1.45;
}

.auth-field {
  margin-bottom: 16px;
}

.auth-field label {
  display: block;
  margin-bottom: 7px;
  color: var(--eo-gold-light);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.auth-field input {
  width: 100%;
  min-height: 46px;
  padding: 0 13px;

  border: 1px solid rgba(169, 177, 195, 0.28);
  border-radius: 8px;

  background: rgba(3, 6, 12, 0.78);
  color: var(--eo-text);

  outline: none;
  font-size: 0.95rem;

  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.auth-field input::placeholder {
  color: rgba(169, 177, 195, 0.45);
}

.auth-field input:focus {
  border-color: rgba(53, 200, 255, 0.72);
  background: rgba(3, 6, 12, 0.9);
  box-shadow: 0 0 0 3px rgba(53, 200, 255, 0.12);
}

.auth-password {
  position: relative;
}

.auth-password input {
  padding-right: 46px;
}

.auth-password__toggle {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);

  width: 34px;
  height: 34px;

  border: 0;
  border-radius: 8px;

  background: transparent;
  color: rgba(248, 239, 216, 0.72);
  cursor: pointer;
}

.auth-password__toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--eo-gold-light);
}

.auth-check {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 10px 0 18px;
  color: var(--eo-muted);
  font-size: 0.86rem;
  line-height: 1.45;
}

.auth-check--compact {
  margin: 0;
}

.auth-check input {
  margin-top: 3px;
  accent-color: var(--eo-gold);
}

.auth-check a,
.auth-links a,
.auth-muted-link {
  color: #8edcff;
  text-decoration: none;
}

.auth-check a:hover,
.auth-links a:hover,
.auth-muted-link:hover {
  color: var(--eo-gold-light);
}

.auth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 4px 0 20px;
  font-size: 0.85rem;
}

.auth-muted-link[aria-disabled="true"] {
  opacity: 0.6;
  pointer-events: none;
}

.game-button.auth-submit {
  width: 100%;
  min-height: 50px;
  margin-top: 4px;
}

.game-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  min-height: 48px;
  padding: 0 28px;

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
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  transition:
    transform 140ms ease,
    filter 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease;
}

.game-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 0 34px rgba(216, 170, 79, 0.34),
    0 12px 28px rgba(0, 0, 0, 0.42);
}

.game-button:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.auth-links {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
  color: var(--eo-muted);
  font-size: 0.9rem;
}

@media (max-width: 920px) {
  .auth-layout {
    grid-template-columns: 1fr;
  }

  .auth-hero {
    display: none;
  }

  .auth-panel-wrap {
    background: rgba(2, 4, 9, 0.48);
  }

  body.auth-page--register {
    background-position: center;
  }
}

@media (max-width: 520px) {
  .auth-layout--center,
  .auth-panel-wrap {
    padding: 18px;
  }

  .auth-card {
    padding: 24px 20px;
    border-radius: 14px;
  }

  .auth-logo__img {
    width: min(220px, 86%);
  }

  .auth-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
11. Melhorias no login.ts

Seu login já funciona. Eu só melhoraria UX: loading, bloquear duplo clique, mensagem melhor e mostrar senha.

Atualize para algo assim:

import './auth-pages.css';

import { resolveAuthNextRedirect } from '../shared/authNavigation';
import { redirectIfAuthenticated, signIn } from '../shared/authGuard';
import { initDesktopClientShell } from '../ui/initDesktopClient';

initDesktopClientShell();

await redirectIfAuthenticated();

const form = document.getElementById('loginForm') as HTMLFormElement | null;
const errEl = document.getElementById('loginError') as HTMLElement | null;

if (!form || !errEl) {
  throw new Error('Formulário de login não encontrado.');
}

function showError(message: string): void {
  errEl.textContent = message;
  errEl.hidden = false;
}

function hideError(): void {
  errEl.textContent = '';
  errEl.hidden = true;
}

function setLoading(isLoading: boolean): void {
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!submit) return;

  submit.disabled = isLoading;
  submit.textContent = isLoading ? 'Entrando...' : 'Entrar';
}

document.querySelectorAll<HTMLButtonElement>('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const inputId = button.dataset.togglePassword;
    if (!inputId) return;

    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;

    const shouldShow = input.type === 'password';
    input.type = shouldShow ? 'text' : 'password';
    button.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  hideError();

  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;

  const email = emailInput?.value.trim() ?? '';
  const password = passwordInput?.value ?? '';

  if (!email || !password) {
    showError('Informe seu e-mail e senha para entrar.');
    return;
  }

  try {
    setLoading(true);

    await signIn(email, password);

    const next = new URLSearchParams(location.search).get('next');
    location.href = resolveAuthNextRedirect(next);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Não foi possível entrar na conta.');
  } finally {
    setLoading(false);
  }
});

Ponto importante: mantenha resolveAuthNextRedirect(next). Ele já protege o redirect para funcionar melhor com Electron e evitar URLs inválidas/absolutas.

12. Melhorias no register.ts

Aqui eu adicionaria:

trim no e-mail
mínimo de senha
checkbox termos
loading
mostrar senha
mensagens melhores

Código:

import './auth-pages.css';

import { redirectIfAuthenticated, signUp } from '../shared/authGuard';
import { track } from '../shared/analytics';
import { initDesktopClientShell } from '../ui/initDesktopClient';

initDesktopClientShell();

await redirectIfAuthenticated();

const form = document.getElementById('registerForm') as HTMLFormElement | null;
const errEl = document.getElementById('registerError') as HTMLElement | null;

if (!form || !errEl) {
  throw new Error('Formulário de registro não encontrado.');
}

function showError(message: string): void {
  errEl.textContent = message;
  errEl.hidden = false;
}

function hideError(): void {
  errEl.textContent = '';
  errEl.hidden = true;
}

function setLoading(isLoading: boolean): void {
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!submit) return;

  submit.disabled = isLoading;
  submit.textContent = isLoading ? 'Criando conta...' : 'Criar conta';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

document.querySelectorAll<HTMLButtonElement>('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const inputId = button.dataset.togglePassword;
    if (!inputId) return;

    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;

    const shouldShow = input.type === 'password';
    input.type = shouldShow ? 'text' : 'password';
    button.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  hideError();

  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;
  const password2Input = document.getElementById('password2') as HTMLInputElement | null;
  const termsInput = document.getElementById('terms') as HTMLInputElement | null;

  const email = emailInput?.value.trim().toLowerCase() ?? '';
  const password = passwordInput?.value ?? '';
  const password2 = password2Input?.value ?? '';

  if (!isValidEmail(email)) {
    showError('Informe um e-mail válido.');
    return;
  }

  if (password.length < 8) {
    showError('A senha precisa ter pelo menos 8 caracteres.');
    return;
  }

  if (password !== password2) {
    showError('As senhas não coincidem.');
    return;
  }

  if (!termsInput?.checked) {
    showError('Você precisa aceitar os termos para criar sua conta.');
    return;
  }

  try {
    setLoading(true);

    await signUp(email, password);

    const emailDomain = email.includes('@') ? email.split('@')[1] : 'unknown';
    track('register_complete', { email: emailDomain });

    location.href = 'characters.html';
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Não foi possível criar sua conta.');
  } finally {
    setLoading(false);
  }
});

O registro atual já redireciona para characters.html após criar conta, então eu manteria esse comportamento. É melhor experiência do que mandar o usuário criar conta e depois fazer login manual.

13. O que colocar visualmente em cada tela
Criar conta

Use a imagem que você gerou com:

mago/personagem à esquerda
montanhas
castelo
luz azul
noite

Arquivo:

public/assets/auth/bg-register.webp

Formulário do lado direito.

Texto do lado esquerdo:

Comece sua jornada em Elarion.

Crie sua conta, escolha seu primeiro herói e entre em um mundo aberto com treino de skills, equipamentos evolutivos e dungeons automatizadas.

Benefícios:

Mundo aberto
Treino de skills
Dungeons idle
Login

Use a imagem que você gerou com:

corredor medieval
tochas
porta grande
banners
clima de entrada no castelo

Arquivo:

public/assets/auth/bg-login.webp

Painel central.

Texto:

Entrar no jogo

Acesse sua conta e continue sua jornada.

Botão:

Entrar

Links:

Criar conta
Voltar ao início
14. Estados que as telas devem ter

As duas páginas precisam desses estados:

normal
erro
carregando
sucesso/redirecionando
Login

Estados:

Entrar
Entrando...
Erro: Informe seu e-mail e senha.
Erro: E-mail ou senha inválidos.
Erro: Não foi possível entrar na conta.
Criar conta

Estados:

Criar conta
Criando conta...
Erro: Informe um e-mail válido.
Erro: A senha precisa ter pelo menos 8 caracteres.
Erro: As senhas não coincidem.
Erro: Você precisa aceitar os termos.
Erro: Não foi possível criar sua conta.
15. Segurança e fluxo correto

Você já tem uma boa base:

token salvo no localStorage
/api/auth/register
/api/auth/login
/api/auth/me
/api/auth/logout
redirectIfAuthenticated
requireAuth
resolveAuthNextRedirect

Isso está em authClient.ts, authGuard.ts e authNavigation.ts.

O que eu não faria agora:

login com Google
login com Steam
recuperação de senha fake
captcha
2FA
perfil completo no cadastro
nome de personagem no cadastro

Conta deve ser simples. Personagem fica na próxima etapa.

16. Cuidado com modo mock

Hoje a página de login ainda mostra:

Modo mock: qualquer e-mail/senha. Use @gm.dev para acesso ao Studio.

Esse texto aparece no login.html atual.

Para produção, eu removeria da tela pública.

Se você quiser manter para desenvolvimento, deixe condicionado no TypeScript, não fixo no HTML.

Exemplo:

<p id="mockAuthHint" class="auth-dev-hint" hidden>
  Modo mock ativo: qualquer e-mail/senha. Use @gm.dev para acesso ao Studio.
</p>

E no TS:

if (import.meta.env.DEV && import.meta.env.VITE_AUTH_MOCK === 'true') {
  const hint = document.getElementById('mockAuthHint');
  if (hint) hint.hidden = false;
}
17. Responsivo/mobile

Para celular, eu faria assim:

Criar conta mobile
fundo ocupa tela inteira
painel central
sem texto lateral
logo no topo
campos grandes
botão grande
Login mobile
painel central
fundo escuro
logo menor
campo com 46px+ altura
botão grande

Isso é importante porque você comentou que futuramente pode pensar em Play Store/mobile.

18. Checklist de implementação

Faça nessa ordem:

1. Salvar imagens:
   public/assets/auth/bg-register.webp
   public/assets/auth/bg-login.webp

2. Confirmar logo:
   public/assets/brand/elarion-logo.png

3. Criar:
   src/auth/auth-pages.css

4. Alterar imports:
   src/auth/login.ts
   src/auth/register.ts

5. Substituir login.html

6. Substituir register.html

7. Rodar:
   npm run dev

8. Testar:
   /register.html
   /login.html

9. Testar produção:
   npm run build
   npm run preview

10. Testar Electron:
   npm run electron:dev

Seu package.json já tem scripts para dev, build, preview e electron:dev.

19. Decisão final de arquitetura

Eu recomendo isto:

index.html
  usa landing própria

login.html
  usa src/auth/login.ts
  usa src/auth/auth-pages.css
  fundo bg-login.webp

register.html
  usa src/auth/register.ts
  usa src/auth/auth-pages.css
  fundo bg-register.webp

characters.html
  continua usando estrutura própria/shell atual

Assim você cria uma identidade visual forte sem arriscar quebrar seleção de personagem, play, studio ou Electron.

20. Próximo passo depois disso

Depois que login e criar conta estiverem prontos, o próximo ponto mais importante será a tela:

characters.html

Ela precisa virar o lobby do Elarion Online:

lista de personagens
preview grande
botão entrar no mundo
botão criar novo personagem
status do servidor
último login

Mas eu não mexeria nela antes de finalizar login/register, porque login/register são a entrada emocional do jogador.