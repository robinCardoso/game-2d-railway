# Arquitetura — Tibia Web Engine

## Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  STUDIO (GM, local) — studio.html + src/editor/* + src/main.ts │
│  Editor de mapas puro: câmera livre, sem IA/combate; dev only  │
│  Publicação: git → deploy; Play consome /maps/ em produção     │
└───────────────────────────┬─────────────────────────────────┘
                            │ usa API pública
┌───────────────────────────▼─────────────────────────────────┐
│  ENGINE — src/engine/ + src/movement/ + src/character/        │
│  Mapa, tiles, colisão, escadas, grid, speed, Y-sort, combate  │
└───────────────────────────┬─────────────────────────────────┘
                            │ lê dados
┌───────────────────────────▼─────────────────────────────────┐
│  DADOS — maps/, tile_catalog, creature_presets, spell_catalog │
│  tiles/** (mapa, effects, characters)                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PLAY — play.html + src/playApp.ts + src/game/* + src/net/*   │
│  Auth JWT, WS multiplayer, HUD, magias, inventário, combate   │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket + REST
┌───────────────────────────▼─────────────────────────────────┐
│  SERVIDOR — server/ (Express + GameRoom WS)                   │
│  Auth, personagens, Studio APIs, movimento/combate autoritativo│
└─────────────────────────────────────────────────────────────┘
```

## Pastas

| Pasta | Responsabilidade |
|-------|------------------|
| `src/engine/` | Mundo, mapa, colisão, registro de tiles |
| `src/movement/` | Grid, passos, tween, escadas (chama engine) |
| `src/character/` | Speed, equip, buffs, terreno no passo |
| `src/functions/` | tileConfig, roles, history (editor + regras) |
| `src/main.ts` | Bootstrap do **Studio** (`studio.html`) — `editorOnly`, `editorCamera.ts` |
| `src/game/playApp.ts` | Bootstrap do **Play** (`play.html`) — loop 60 FPS, rede, combate |
| `src/net/` | Cliente WS (`gameNetClient.ts`), jogadores remotos, predição |
| `src/game/` | UI Play (HUD, magias, inventário), efeitos de spell cast |
| `server/` | Express, PostgreSQL, `GameRoom` WebSocket, APIs Studio |
| `shared/` | Protocolo WS, tile walkable, creature chase, game rates |

## Tiles

- Tamanho global: `ENGINE_CONFIG.TILE_SIZE` (**32** px) em `engine/config.ts`
- Assets PNG em `tiles/**`; variant strips = largura `N × TILE_SIZE`
- Colisão: hitbox proporcional via `collisionHitboxSize()`
- Catálogo para mapas/IA: `public/tile_catalog.json` (ver [map-format.md](./map-format.md))
- **Registry:** `buildTileRegistryAsync()` — ordem alfabética de path; strips expandem em `fileKey#N`
- **Resolução de mapa:** `tileRefResolver.ts` — `ref` estável no JSON, id numérico em runtime
- **Random 🎲:** só ao pintar (`resolvePaintTileId`); ver [studio-improvements-log.md](./studio-improvements-log.md)

## Pipeline de render (mapa)

1. **Passo 1 — chão:** base (`worldMap`) + grama + auto-borda; viewport culling; nunca entra no Y-sort.
2. **Passo 2 — Y-sort:** itens (`itemsOverlayMap`), NPCs, jogadores remotos e local na mesma fila; ordenação pelo pé do sprite (`src/engine/depthSortDraw.ts`).
3. **UI/editor:** zonas, portais, spawns e previews desenhados por cima do Y-sort.

Studio (`main.ts`) e Play (`playApp.ts`) compartilham o mesmo modelo.

## Formato de mapa (`MapDocument` v1)

Documentação completa: **[docs/map-format.md](./map-format.md)** (formato esparso, catálogo de tiles, guia para IA).

Resumo:

- **Formato preferido:** `game-2d/map-sparse-v1` — só células pintadas em `tiles[z]`, não grade densa
- **Artefatos:** `public/maps/*.json`, `public/maps/map.schema.json`, `public/tile_catalog.json`
- **Export/import:** `serializeMapDocument` / `loadMapFromJson` em `src/engine/worldMap.ts`
- **Legado:** `floors` (grade densa) e `sparseTiles` (`[x,y,z,id][]`) ainda carregam
- Play e Studio carregam o mesmo JSON via fetch (`/maps/` ou volume `DATA_ROOT`)

## O que NÃO vai na engine

- UI de conta / personagem / cidade
- IndexedDB de usuário
- Painel de tileset e ferramentas de pintura

## Andares (Z)

- Configurado em `engine/config.ts`: **MIN_FLOOR_Z = -7**, **MAX_FLOOR_Z = +7**
- UI: `#floorSelector` gerado por `editor/floorSelector.ts` (grade 5 colunas, scroll)
- Mapas importados recebem `ensureAllFloors()` — andares ausentes viram vazio (`-1`)

## Play e multiplayer

- Entrada: `play.html` → auth → personagem → `POST /api/ws-ticket` → WS `join`
- Movimento autoritativo no servidor; cliente prediz e corrige — ver [multiplayer-remote-players.md](./multiplayer-remote-players.md)
- Combate PvE/PvP, magias, XP: `server/src/combat/`, `grantKillExperience.ts`
- Magias: catálogo `spell_catalog.json`, ícones `tiles/effects/spells/icons/` — ver [spell-system.md](./spell-system.md)
- Rate XP: `GAME_RATE_EXP` — ver [game-rates.md](./game-rates.md)

Índice de features recentes: [recent-features-jun-2026.md](./recent-features-jun-2026.md).

## Roadmap engine (itens em aberto)

1. ✅ `worldMap` + `MapDocument` v1 (esparso + legado)
2. ✅ Colisão e escadas em `engine/collision.ts`
3. ✅ Andares -7 … +7
4. ✅ Play cliente + WS + combate básico
5. ⬜ `move_request` (intenção em vez de posição absoluta)
6. ⬜ Loot de mobs (campo já existe em presets)
7. ⬜ `stages.json` por level (substituir rate global de XP)
