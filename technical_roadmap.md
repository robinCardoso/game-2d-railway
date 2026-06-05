# 🗺️ Tibia Web Engine - Technical Roadmap & Architecture

Este documento descreve a visão técnica para a evolução do motor de jogo 2D, saindo de um protótipo estático para uma engine de produção escalável.

## 1. Stack Tecnológica Recomendada

Para suportar um mundo aberto massivo e interações complexas, a transição para frameworks modernos é necessária:

- **Core Engine:** Vanilla JavaScript/TypeScript com HTML5 Canvas (pela alta performance).
- **Frontend Framework:** **React** ou **Vite**. Ideal para gerenciar a UI (Inventário, Chat, Stats) de forma reativa.
- **Backend (Multiplayer):** **Node.js** com **Socket.io**. Necessário para sincronizar jogadores e persistir mudanças no mapa em tempo real.
- **Banco de Dados:** **PostgreSQL (Supabase)** para dados de jogadores e metadados de tiles.

## 2. Refatoração de Dados (Stack System)

Atualmente, o mapa é uma matriz de números simples (`worldMap[y][x] = id`). Para permitir que itens sejam colocados sobre o chão, a estrutura deve evoluir para:

```typescript
// Estrutura de cada Tile no mapa
interface MapTile {
  ground: number;       // ID do piso (Grama, Pedra)
  items: number[];      // Array de IDs de itens (Cadeiras, Baús, Lixo)
  creature?: string;    // ID de Player ou NPC ocupando o tile
  lighting?: number;    // Nível de luz específico (0-255)
}
```

## 3. Funcionalidades de Longo Prazo

### A. Iluminação Dinâmica (Atmosphere)
- Implementação de um "Light Map" (Canvas secundário em modo `multiply`).
- Tochas e Magias emitem raios de luz baseados no sistema de cores HSL.
- **Subsolo (-1):** Escuridão total por padrão, exigindo tochas.

### B. Map Editor Profissional (User Driven)
- O editor deve salvar as alterações em um **Buffer Binário**.
- **Exportação:** Gerar arquivos `.json` ou arquivos binários customizados (ex: `.otbm`) que o servidor carrega ao iniciar.
- **Brush Tools:** Ferramentas de preenchimento (bucket), seleção de área e pintura de andares automáticos.

### C. Objetos Móveis e Física
- Itens com propriedade `isPushable: true`.
- Lógica de bloqueio: Se um tile tem um item com `walkable: false`, o jogador não pode entrar, mas pode "empurrar" o item para o tile vizinho se estiver livre.

## 4. Persistência e Segurança

- **Níveis de Acesso:** O sistema de pintura (Editor) só será ativado se o usuário autenticado tiver a flag `isAdmin: true`.
- **Validação no Servidor:** No jogo real, o cliente (navegador) apenas pede para mover. O servidor verifica se o tile é caminhável e autoriza o movimento.

---

> [!NOTE]
> O próximo passo natural para este projeto é a criação de um sistema de "Save/Load" via LocalStorage ou Download de Arquivo para que o trabalho do editor não seja perdido ao atualizar a página.
