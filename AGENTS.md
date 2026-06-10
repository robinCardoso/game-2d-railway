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
| [docs/spell-system.md](docs/spell-system.md) | Magias, ícones PNG, VFX cast, Studio APIs |
| [docs/loot-system.md](docs/loot-system.md) | Autoloot, loot pessoal multi-jogador, elegibilidade AOI |
| [docs/game-rates.md](docs/game-rates.md) | `GAME_RATE_EXP` — multiplicador global de XP |
| [docs/recent-features-jun-2026.md](docs/recent-features-jun-2026.md) | **Índice** — features jun/2026 + mapa de docs |
| [docs/analise-chatgpt.md](docs/analise-chatgpt.md) | Escala OTC (AOI, cap aggro, viewport cull) |
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
13. **Magias:** ícones em `tiles/effects/spells/icons/` (PNG 32×32); VFX em `tiles/effects/spells/cast/`; catálogo `spell_catalog.json` — ver [docs/spell-system.md](docs/spell-system.md)
14. **XP rate:** servidor usa `GAME_RATE_EXP` (`.env`); offline usa `public/game_rates.json` — ver [docs/game-rates.md](docs/game-rates.md)
15. **Movimento WS:** `MOVEMENT_TOO_FAST` não envia `position_correction` (anti rubber-band em latência alta)
16. **Studio editor-only:** `editorOnly` no bootstrap — sem `NpcAI`/`PlayerMovement`/`respawnEntities`; câmera em `editorCamera.ts`; produção sem `studio.html` (editar local → deploy)
17. **Loot:** roll **só no servidor** (`rollMobLoot`); loot pessoal por participante elegível (AOI + 5% dano); política A — ver [docs/loot-system.md](docs/loot-system.md)

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
npm run generate:spell-icons           # placeholders PNG hotbar + paths no catálogo
npm run generate:spell-cast-sprites    # placeholders VFX conjuração
npm run migrate:character-calibration  # sidecar + JSON enxuto para outfits legados
```

Reiniciar `npm run dev` após mudanças em `server/src/studio/` ou rotas `/api/*`.
