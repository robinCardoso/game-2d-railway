# Roadmap de Publicação: Steam & Google Play Store

Este documento detalha o planejamento, ferramentas necessárias e modificações arquiteturais necessárias para empacotar e publicar o **2D World** (Studio/Engine estilo Tibia) nas plataformas Steam (PC/Mac/Linux) e Google Play Store (Android).

---

## 1. Viabilidade Técnica Geral

Como o frontend do jogo é baseado em **HTML5 Canvas (2D)**, **TypeScript** e **Vite**, o projeto é extremamente compatível com contêineres nativos (*wrappers*) que renderizam aplicações web em ambientes locais ou móveis. A comunicação de rede via WebSockets (`GameNetClient`) é suportada de forma nativa por todas as soluções sugeridas.

---

## 2. Planejamento para a Steam (Desktop)

Para lançar na Steam, o foco é empacotar a aplicação web para desktop e integrar as APIs nativas do ecossistema Steamworks.

### 2.1. Ferramenta de Empacotamento
* **Tauri (v2)** (Recomendado):
  * **Vantagens**: Executável final muito leve (~10-15MB), excelente consumo de memória e segurança aprimorada. Utiliza a WebView nativa do sistema operacional (Webkit/WebView2).
  * **Integração Steam**: Utiliza o crate Rust `steamworks-rs` para se comunicar diretamente com as APIs de C++ da Steamworks.
* **Electron**:
  * **Vantagens**: Acesso completo a APIs Node.js diretamente no JavaScript do frontend. Integração fácil via biblioteca `steamworks.js` no npm.
  * **Desvantagens**: Executável pesado (100MB+) e alto consumo de memória RAM.

### 2.2. Adaptações Arquiteturais Necessárias
1. **Autenticação Direta via Steam**:
   * Substituir ou adicionar uma alternativa ao login manual (e-mail/senha) na tela de início.
   * Chamar a API da Steamworks no cliente para obter o ticket de sessão do jogador (`GetAuthSessionTicket`).
   * Enviar esse ticket ao servidor Express (Railway), que validará a sessão com a Web API da Steam e criará/carregará a conta do jogador automaticamente.
2. **Integração com a SDK Steamworks**:
   * **Conquistas (Achievements)**: Mapear ações do jogo (ex: matar monstros, completar dungeons instanciadas) para disparar chamadas de conquista da Steam.
   * **Nuvem (Steam Cloud)**: Sincronizar preferências locais (como configurações de zoom, configurações de teclas e layouts salvos no `localStorage`).
   * **Overlay da Steam**: Garantir que o overlay padrão (Shift+Tab) funcione perfeitamente sem congelar o loop de renderização do Canvas.
3. **Opções de Resolução e Modo de Janela**:
   * Adicionar no menu de configurações do jogo a opção de Tela Cheia (Fullscreen exclusiva ou borderless) e alternador de resoluções, controlados pelas APIs nativas do Tauri/Electron.
4. **Decisão sobre Servidor Local (Singleplayer)**:
   * **Online Only (Atual)**: O cliente empacotado simplesmente se conecta via WebSocket seguro (`wss://`) ao servidor Railway hospedado.
   * **Offline/Singleplayer**: Exigiria embutir um banco de dados leve local (como SQLite ou arquivos JSON locais) e rodar uma instância simplificada do servidor NodeJS em segundo plano dentro do Tauri/Electron.

---

## 3. Planejamento para a Google Play Store (Android)

A publicação no Android exige adaptações focadas em responsividade, usabilidade em telas de toque (touch) e gerenciamento de rede móvel instável.

### 3.1. Ferramenta de Empacotamento
* **Capacitor (Ionic)**:
  * Cria uma ponte extremamente eficiente entre a build estática do Vite (`dist/`) e as APIs nativas do Android (Java/Kotlin). Muito estável e amplamente adotada na indústria para jogos web 2D.
* **Tauri Mobile (v2)**:
  * Permite compilar a mesma base de código do Tauri de PC para Android e iOS.

### 3.2. Adaptações Arquiteturais Necessárias
1. **Controles Virtuais na Tela (On-Screen UI)**:
   * **Joystick/D-Pad Virtual**: Mapear toques analógicos para simular os estados de tecla no objeto de controle `keys` lido pelo [PlayerMovement](file:///c:/Users/Robson/source/game-2d-railway/src/game/playApp.ts).
   * **Hotkeys de Ação**: Criar botões flutuantes na lateral direita para acesso rápido a poções, magias, ataques e seleção de alvos (Target Lock).
2. **Ajustes de Layout Responsivo (Mobile UX)**:
   * Redesenhar janelas flutuantes (inventário, status do personagem, chats) para preencher a tela inteira quando abertas ou usar modais adequados para telas pequenas.
   * Ajustar o escalonamento do Canvas baseado no zoom do dispositivo para manter os tiles de 32px visíveis e nítidos.
3. **Tratamento de Ciclo de Vida do Aplicativo**:
   * Salvar o estado do personagem imediatamente (`flushCharacterLocationSave`) quando o aplicativo for suspenso (evento `pause` do Capacitor/Android).
   * Fechar a conexão WebSocket ao ir para segundo plano para não consumir bateria e recursos desnecessários do servidor.
4. **Gerenciamento de Rede Oscilante**:
   * Implementar uma camada de reconexão automática e silenciosa em caso de quedas rápidas de conexão celular (mudança de 4G para Wi-Fi, túneis, etc.), restaurando a posição e o estado do jogador de forma imperceptível (seamless).
5. **Integração com Google Play Services**:
   * Login social do Google Play Games para autenticação instantânea.
   * Faturamento do Google Play (In-App Purchases - IAP) para monetização, caso necessário.
   * Mapeamento do botão físico "Voltar" (Back Button) do Android para fechar menus abertos ou abrir a tela de confirmação de saída (evitando fechar o app diretamente).

---

## 4. Checklist de Implementação Recomendado

### Fase 1: Preparação do Core (Multiplataforma)
- [ ] Centralizar e abstrair o controle de inputs de teclado em um gerenciador unificado (`inputManager.ts`), facilitando a injeção posterior de eventos de toque no celular ou controles físicos de videogame na Steam.
- [ ] Tornar a interface (chat, menus de itens e status) móvel e responsiva usando CSS flexível (Viewport units, Flexbox/Grid).

### Fase 2: Adaptação Desktop (Steam/Tauri)
- [ ] Configurar o setup inicial do Tauri no projeto (`npm run tauri init`).
- [ ] Adicionar suporte a Fullscreen e configurações de tela no menu de jogo.
- [ ] Configurar o SDK Steamworks na build nativa do Tauri.
- [ ] Implementar autenticação via Steam Ticket.

### Fase 3: Adaptação Mobile (Play Store/Capacitor)
- [ ] Inicializar o Capacitor no projeto (`npx cap init`).
- [ ] Implementar o D-Pad virtual flutuante na UI e botões de atalho tátil.
- [ ] Tratar eventos nativos de ciclo de vida (`appRestoredResult`, `pause`, `resume`).
- [ ] Ajustar o tratamento de escala do Canvas baseado na densidade de pixels do dispositivo.
