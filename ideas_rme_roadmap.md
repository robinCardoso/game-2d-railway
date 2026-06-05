# 🗺️ Roadmap de Ideias: Inspirações do Remere's Map Editor (RME)

Este documento centraliza e cataloga as melhores mecânicas de mapeamento inspiradas no **Remere's Map Editor (RME)** adaptadas para o nosso motor 2D Web. Ele está ordenado do mais **Importante ao Menos Importante**, e subdividido por **Complexidade (Fácil ao Difícil)**.

---

## 🟥 Nível 1: Altamente Importante (Core do Editor)

### 🟢 Fácil
1. **Atalhos Rápidos de Seleção de Ferramenta** *(Já implementado! P, B, E, I, U, L)*
2. **Minimap Tracker** *(Já implementado! Atualiza dinamicamente enquanto o jogador edita)*
3. **Filtro Avançado de Busca na Paleta de Tiles:**
   - Adicionar uma barra de texto acima da grade de tiles para que o usuário possa digitar "grass" ou "wall" e filtrar instantaneamente os tiles exibidos.-- IMPLEMENTADO --

### 🟡 Médio
4. **Sistema de "Action ID" e "Unique ID" para Itens/Portas:**
   - Permitir que, ao clicar com o botão direito em um item colocado no mapa, possamos atribuir um `ActionID` (para portas de quest, baús, alavancas) ou `UniqueID`.-- IMPLEMENTADO --
5. **Preenchimento Inteligente de Bordas Automáticas (Auto-Border):** *(removido do escopo — reimplementar depois)*
   - O segredo do RME. Ao pintar grama perto de água, ou terra perto de grama, o sistema decide e posiciona automaticamente os tiles de borda adequados para que o desenvolvedor não precise pintar cantinho por cantinho manualmente.
   - Implementação legada removida (2026-05); motor e UI não estão no source atual. Tratar como feature nova no futuro.

### 🔴 Difícil
6. **Ferramenta de Seleção de Área (Copy / Paste / Move):**
   - Habilidade de arrastar um retângulo no mapa, selecionar múltiplos tiles com suas decorações, e copiá-los (`Ctrl+C`), colá-los (`Ctrl+V`) ou deletá-los em lote.

---

## 🟨 Nível 2: Importância Média (Riqueza de Detalhes)

### 🟢 Fácil
1. **Configuração de Spawn do Player (Spawnpoint visual no Mapa):**
   - Renderizar uma bandeira ou ícone visual do "Templo/Spawn" nas coordenadas exatas de `mapSpawn` (X, Y, Z), permitindo arrastar ou mudar esse spawn com um clique.

### 🟡 Médio
2. **Configuração de Propriedades de Zonas (Zonas Non-PvP / No-Logout / Protection Zone):**
   - Adicionar uma ferramenta para "Pintar Zonas". Zonas de Proteção (PZ) impedem batalhas e logout rápido, idêntico ao Tibia.-- IMPLEMENTADO --

### 🔴 Difícil
3. **Editor e Posicionador de Spawns de Criaturas (Monstros/NPCs):**
   - Criar uma paleta de criaturas e NPCs para colocá-los estaticamente no mapa. Salvar esses spawns no JSON para que o motor crie as entidades ao carregar o mundo.

4. **Dungeons instanciadas + multiplayer (documentação e Fase 1):**
   - Ver guia completo: [`docs/instanced-maps-and-multiplayer.md`](docs/instanced-maps-and-multiplayer.md)
   - Fase 1 implementada: `orc_cave` com clone em RAM (`src/engine/mapInstance.ts`). -- IMPLEMENTADO --

---

## 🟦 Nível 3: Opcional / Avançado (Polimento Profissional)

### 🟢 Fácil
1. **Historico de Posições Rápidas ("Go to position..."):**
   - Um botão ou atalho rápido que abre uma caixinha para digitar `X, Y, Z` e teletransporta a câmera instantaneamente para lá. -- IMPLEMENTADO ---

### 🟡 Médio
2. **Sistema de Casas (House Brush):**
   - Definir áreas de tiles como "Propriedades/Casas" compráveis e associar uma porta de entrada para aquela casa.--IMPLEMENTADO--

### 🔴 Difícil
3. **Visualização de Sombras e Iluminação em Tempo Real:**
   - Renderizar fontes de luz (tochas, lâmpadas) calculando um gradiente de escuridão/luminosidade dinâmico sobre os tiles, dando uma atmosfera sombria retrô.

---

## 🛠️ Onde Documentar no Nosso Projeto?

Este arquivo foi criado e documentado na raiz do projeto como `ideas_rme_roadmap.md`. Ele serve como o nosso **farol de planejamento**. À medida que formos decidindo implementar novas ferramentas, podemos abrir este roadmap, escolher o próximo item do checklist e colocá-lo em prática!

---

**Jornada do jogador (landing, login, personagens, /play):** ver [docs/player-journey.md](docs/player-journey.md).
