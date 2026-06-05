# 🗺️ Planejamento: Engine de Personagens Avançada

Este plano descreve o design técnico para expandir o sistema de personagens em uma engine completa e profissional, introduzindo o sistema de Outfits (multi-entidades/NPCs), novos estados de animação, eventos de frames e persistência física de sprites no servidor de desenvolvimento local.

## 🏗️ Proposta de Arquitetura

Para comportar essas melhorias sem poluir o `main.ts`, vamos modularizar as entidades em uma estrutura baseada em classes reutilizáveis.

---

## 🎨 1. Sistema de Outfits (Multi-entidades e NPCs)

Atualmente, a engine possui apenas um jogador fixo e um controlador global. Vamos criar a abstração de **Entidade de Jogo** (`GameEntity`).

### `[NEW]` [entity.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/character/entity.ts)
Classe base para qualquer criatura ou personagem renderizado na tela (inclusive o jogador).

```typescript
import { SpriteAnimationController, CharacterSpriteConfig } from './spriteAnimation';

export class GameEntity {
    id: string;
    name: string;
    tileX: number;
    tileY: number;
    worldX: number;
    worldY: number;
    worldZ: number;
    animController: SpriteAnimationController;

    constructor(id: string, name: string, config: CharacterSpriteConfig, tileX: number, tileY: number, z: number) {
        this.id = id;
        this.name = name;
        this.tileX = tileX;
        this.tileY = tileY;
        this.worldX = tileX * 64; // TILE_SIZE
        this.worldY = tileY * 64;
        this.worldZ = z;
        this.animController = new SpriteAnimationController(config);
    }

    update(nowMs: number, movementDurationMs?: number) {
        this.animController.update(nowMs, movementDurationMs);
    }

    draw(ctx: CanvasRenderingContext2D, camera: { x: number, y: number }, tileSize: number) {
        if (!this.animController.isLoaded || !this.animController.image) return;
        const rect = this.animController.getSourceRect();
        
        ctx.drawImage(
            this.animController.image,
            rect.sx, rect.sy, rect.sw, rect.sh,
            this.worldX - camera.x + rect.ax, this.worldY - camera.y + rect.ay,
            tileSize, tileSize
        );
    }
}
```

### `[MODIFY]` [main.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/main.ts)
* Adaptar o loop principal de desenho (`draw()`) para iterar e desenhar um array de NPCs (`npcs: GameEntity[]`).
* O jogador será instanciado como o `playerEntity = new GameEntity(...)`.

---

## 🏃‍♂️ 2. Novos Estados de Animação (Sentar, Morrer, Conjurar)

### `[MODIFY]` [spriteAnimation.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/character/spriteAnimation.ts)
* Expandir o tipo de estados suportados:
  ```typescript
  export type CharacterState = 'idle' | 'walk' | 'attack' | 'sit' | 'dead' | 'cast';
  ```

### `[MODIFY]` [index.html](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/index.html) e [characterEditor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/editor/characterEditor.ts)
* Adicionar opções nos selects de estado ativo para:
  * 🧎 Sentar (`sit`)
  * 💀 Morrer (`dead`)
  * 🧙‍♂️ Conjurar Habilidade (`cast`)

---

## 🔔 3. Eventos Vinculados aos Frames (Sons e Partículas)

Permite que uma ação (como tocar som de passos ou soltar poeira) seja disparada exatamente no frame certo.

### `[MODIFY]` [spriteAnimation.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/character/spriteAnimation.ts)
* Atualizar a interface `AnimationDef` para suportar triggers de eventos opcionais:
  ```typescript
  export interface AnimationEvent {
      frameIndex: number;
      action: 'sound' | 'effect';
      parameter: string; // Ex: 'footstep_grass'
  }
  ```
* No loop de update de frame, se o índice mudar e bater com um evento cadastrado, disparar um callback global:
  ```typescript
  onFrameTrigger?: (action: string, parameter: string) => void;
  ```

---

## 📁 4. Salvamento Físico de Imagens (Vite Local Saving Backend)

Como o projeto roda sobre um servidor de desenvolvimento Vite e não possui backend dedicado, criaremos um **Plugin do Vite personalizado** em segundo plano. Ele atuará como nosso backend local de gravação.

### `[NEW]` [vite.config.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/vite.config.ts)
Vite interceptará requisições e salvará os arquivos diretamente no seu disco!

```typescript
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'local-saving-backend',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/save-character' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const { name, spriteBase64, configJson } = JSON.parse(body);
                const filename = name.toLowerCase().replace(/ /g, '_');
                
                // 1. Salva a imagem PNG no disco
                const imageBuffer = Buffer.from(spriteBase64.replace(/^data:image\/png;base64,/, ""), 'base64');
                const imagePath = path.resolve(__dirname, `tiles/characters/${filename}.png`);
                fs.writeFileSync(imagePath, imageBuffer);
                
                // 2. Salva o arquivo JSON de configuração com o caminho físico
                configJson.spriteSheetUrl = `tiles/characters/${filename}.png`;
                const jsonPath = path.resolve(__dirname, `tiles/characters/${filename}.json`);
                fs.writeFileSync(jsonPath, JSON.stringify(configJson, null, 2));

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, spriteUrl: configJson.spriteSheetUrl }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ]
});
```

### `[MODIFY]` [characterEditor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/game-2d/src/editor/characterEditor.ts)
* Adicionar botão **"Salvar no Servidor"** ao painel.
* Ao clicar, envia os metadados e o PNG em Base64 para `/api/save-character`. 
* Uma vez recebido o sucesso, substitui o link em memória pela URL física, livrando o cache de arquivos gigantes no `localStorage`!

---

## 🙋 Perguntas em Aberto

> [!IMPORTANT]
> 1. **Deseja criar NPCs interativos no mapa com IA simples (andar aleatoriamente) para testarmos o sistema de Outfits/Multi-entidades?**
> 2. **Para a integração de sons nos frames de animação, já temos arquivos de áudio locais ou criamos um sintetizador de som básico (Web Audio API) para tocar sons retro sem depender de arquivos?**
