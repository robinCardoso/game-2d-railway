# AGENTS.md — guia para agentes IA

Este repositório é **Elarion Online** — MMORPG 2D estilo Tibia com **Elarion Studio** (editor + engine). Leia isto antes de alterar mapas, tiles ou sprites.

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
| [docs/asset-taxonomy.md](docs/asset-taxonomy.md) | Pastas de tiles, metadados, paredes/montanhas, anti-regressão |
| [docs/sprite-exporter-walkthrough.md](docs/sprite-exporter-walkthrough.md) | Calibrador, export, exclusão |
| [docs/architecture.md](docs/architecture.md) | Camadas engine / editor |
| [docs/ui-menus.md](docs/ui-menus.md) | IDs de UI estáveis |
| [docs/hosting.md](docs/hosting.md) | Deploy Railway (migração concluída), PostgreSQL, APIs unificadas |
| [docs/multiplayer-remote-players.md](docs/multiplayer-remote-players.md) | Jogadores remotos (estado atual + roadmap escala) |
| [docs/playstore-steam-roadmap.md](docs/playstore-steam-roadmap.md) | Planejamento, empacotamento e adaptações para Steam e Play Store |


## Invariantes críticas (resumo)

1. `ENGINE_CONFIG.TILE_SIZE = 32`
2. `buildTileRegistryAsync()` antes de carregar mapas
3. `ref` estável no JSON; `tileRefResolver.ts` no load — **obrigatório em mapas salvos**
4. PNGs em `tiles/effects/**` e `tiles/characters/**` **não** entram no tile registry
5. Random (`🎲`) **só** em `resolvePaintTileId` — nunca no `draw()`
6. Strips `*_variants` inferem `variantGroup` se ausente
7. Exclusão de sprite: `sprite-usage` → `delete-map-sprite` (dev only)
8. **Save mapa:** `formatMapDocumentJson` inclui `layers.grass` / `layers.border` quando não vazios; `validateMapDocument` bloqueia brush 9000+
9. **Auto-borda:** grama no overlay; filete na célula de chão vizinha; `collectBorderDrawTileIdsCached` no draw (não recalcular vizinhos todo frame)
10. **Performance Studio:** viewport culling em `draw()`; cache invalida em load/undo/recalc; Play sempre 60 FPS
11. **Calibração personagem:** sidecar `{nome}.calibration.json` — fonte de verdade; `fetchCharacterConfigMerged` no load; `save-character` grava ambos
12. **Testes:** `npm test` — ref priority, exclusão effects/, anti double-remap, `characterCalibration`

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
npm test            # vitest — tile ref / registry
```

Reiniciar `npm run dev` após mudanças em `server/src/studio/` ou rotas `/api/*`.
