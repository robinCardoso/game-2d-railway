# AGENTS.md — guia para agentes IA

Este repositório é um **Studio 2D estilo Tibia** (editor + engine). Leia isto antes de alterar mapas, tiles ou sprites.

## Regras Cursor (obrigatório)

| Regra | Escopo |
|-------|--------|
| [.cursor/rules/studio-map-sprites.mdc](.cursor/rules/studio-map-sprites.mdc) | **Sempre ativa** — invariantes de sprites, mapas, random, APIs |

## Documentação técnica

| Documento | Conteúdo |
|-----------|----------|
| [docs/studio-improvements-log.md](docs/studio-improvements-log.md) | Log de melhorias + checklist de regressão |
| [docs/auto-border.md](docs/auto-border.md) | Auto-borda grass_edges, camadas, performance |
| [docs/map-format.md](docs/map-format.md) | Formato `MapDocument`, `ref`, tileRefs, `layers` |
| [docs/sprite-exporter-walkthrough.md](docs/sprite-exporter-walkthrough.md) | Calibrador, export, exclusão |
| [docs/architecture.md](docs/architecture.md) | Camadas engine / editor |
| [docs/ui-menus.md](docs/ui-menus.md) | IDs de UI estáveis |
| [docs/hosting.md](docs/hosting.md) | Deploy Railway (migração concluída), PostgreSQL, APIs unificadas |
| [docs/multiplayer-remote-players.md](docs/multiplayer-remote-players.md) | Jogadores remotos (estado atual + roadmap escala) |

## Invariantes críticas (resumo)

1. `ENGINE_CONFIG.TILE_SIZE = 32`
2. `buildTileRegistryAsync()` antes de carregar mapas
3. `ref` estável no JSON; `tileRefResolver.ts` no load
4. Random (`🎲`) **só** em `resolvePaintTileId` — nunca no `draw()`
5. Strips `*_variants` inferem `variantGroup` se ausente
6. Exclusão de sprite: `sprite-usage` → `delete-map-sprite` (dev only)
7. **Save mapa:** `formatMapDocumentJson` inclui `layers.grass` / `layers.border` quando não vazios
8. **Auto-borda:** grama no overlay; filete na célula de chão vizinha; `collectBorderDrawTileIdsCached` no draw (não recalcular vizinhos todo frame)
9. **Performance Studio:** viewport culling em `draw()`; cache invalida em load/undo/recalc; Play sempre 60 FPS

## Ao implementar melhorias nesta área

1. Manter invariantes acima
2. Atualizar [docs/studio-improvements-log.md](docs/studio-improvements-log.md)
3. Ajustar [.cursor/rules/studio-map-sprites.mdc](.cursor/rules/studio-map-sprites.mdc) se novas regras surgirem
4. Rodar checklist manual da seção **8** do log de melhorias

## Comandos

```bash
npm run dev         # Vite :5173 + servidor :8787 (APIs unificadas via proxy)
npm run dev:web     # só frontend (sem APIs)
npm run dev:server  # só Express
```

Reiniciar `npm run dev` após mudanças em `server/src/studio/` ou rotas `/api/*`.
