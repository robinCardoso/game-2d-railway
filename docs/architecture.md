# Arquitetura — Tibia Web Engine

## Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  EDITOR (ADM) — index.html + src/editor/* (futuro)          │
│  Pintar mapa, undo, tileset, dev tools, export              │
└───────────────────────────┬─────────────────────────────────┘
                            │ usa API pública
┌───────────────────────────▼─────────────────────────────────┐
│  ENGINE — src/engine/ + src/movement/ + src/character/        │
│  Mapa, tiles, colisão, escadas, grid, speed, terreno          │
└───────────────────────────┬─────────────────────────────────┘
                            │ lê dados
┌───────────────────────────▼─────────────────────────────────┐
│  DADOS — JSON de mapa, itemDefinitions, assets/tiles/         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CLIENTE JOGADOR (futuro) — conta IndexedDB, char, cidade   │
│  Não misturar com editor; consome a mesma ENGINE            │
└─────────────────────────────────────────────────────────────┘
```

## Pastas

| Pasta | Responsabilidade |
|-------|------------------|
| `src/engine/` | Mundo, mapa, colisão, registro de tiles |
| `src/movement/` | Grid, passos, tween, escadas (chama engine) |
| `src/character/` | Speed, equip, buffs, terreno no passo |
| `src/functions/` | tileConfig, roles, history (editor + regras) |
| `src/main.ts` | **Shell do editor ADM** (enquanto não há `src/editor/`) |

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
- Cliente futuro carrega o mesmo JSON (fetch ou IndexedDB de mapas publicados)

## O que NÃO vai na engine

- UI de conta / personagem / cidade
- IndexedDB de usuário
- Painel de tileset e ferramentas de pintura

## Andares (Z)

- Configurado em `engine/config.ts`: **MIN_FLOOR_Z = -7**, **MAX_FLOOR_Z = +7**
- UI: `#floorSelector` gerado por `editor/floorSelector.ts` (grade 5 colunas, scroll)
- Mapas importados recebem `ensureAllFloors()` — andares ausentes viram vazio (`-1`)

## Roadmap engine (antes do cliente jogador)

1. ✅ `worldMap` + `MapDocument` v1 (esparso + legado)
2. ✅ Colisão e escadas em `engine/collision.ts`
3. ✅ Andares -7 … +7
3. ⬜ `facing` (N/S/E/O) no grid — ver `docs/character-sprite-engine.md`
4. ⬜ `CharacterRenderer` + Character Studio (sprites separados dos tiles)
5. ⬜ `GameLoop` tipado (update/draw injetável)
6. ⬜ Publicar mapa (arquivo estático ou API)
