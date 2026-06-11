# Features recentes (jun/2026) — índice de documentação

Documento de **auditoria**: o que foi implementado na sessão jun/2026, onde está no código e qual doc cobre cada parte.

Última revisão: **2026-06-10**

---

## Como usar este arquivo

| Público | Ação |
|---------|------|
| **Humano** | Leia as seções abaixo antes de deploy ou teste em produção |
| **Agente IA** | Consulte este índice + doc específico antes de alterar combate, magias, movimento ou rates |
| **Regressão** | Rode `npm test` (230 testes) + checklist da seção 8 em [studio-improvements-log.md](./studio-improvements-log.md) |

---

## 1. Sistema de magias (completo)

| Item | Status | Código | Documentação |
|------|--------|--------|--------------|
| Catálogo + Studio editor | ✅ | `public/spell_catalog.json`, `src/editor/spellEditor.ts` | [spell-system.md](./spell-system.md) |
| Barra slots 1–3 + modal | ✅ | `playCombatHub.ts`, `playSpellBar.ts`, `playSpellModal.ts` | [spell-system.md](./spell-system.md) |
| Cast autoritativo (WS) | ✅ | `server/src/combat/spellCast.ts`, `spellHandlers.ts` | [spell-system.md](./spell-system.md) |
| **Ícones hotbar PNG 32×32** | ✅ | `tiles/effects/spells/icons/{id}.png` | [spell-system.md](./spell-system.md) § Ícones |
| Upload ícone Studio | ✅ | `POST /api/save-spell-icon` → volume `DATA_ROOT` | [spell-system.md](./spell-system.md) |
| Placeholders no git | ✅ | `npm run generate:spell-icons` | [spell-system.md](./spell-system.md) |
| **VFX conjuração (cast)** | ✅ | `tiles/effects/spells/cast/` + JSON | [spell-system.md](./spell-system.md) § castEffect |
| Gerar VFX placeholder | ✅ | `npm run generate:spell-cast-sprites` | [spell-system.md](./spell-system.md) |
| Fallback canvas se PNG falhar | ✅ | `spellCastEffects.ts` | — |

**Produção Railway:** magias criadas só no Studio ficam no **volume** (`spell_catalog.json` + PNGs uploadados). Ícones do repo entram via seed de `tiles/effects/**` no deploy.

---

## 2. Rate global de XP (`rateExp`)

| Item | Status | Código | Documentação |
|------|--------|--------|--------------|
| Multiplicador servidor | ✅ | `GAME_RATE_EXP` → `grantKillExperience.ts` | [game-rates.md](./game-rates.md) |
| API pública | ✅ | `GET /api/game-rates` | [game-rates.md](./game-rates.md) |
| Offline / JSON local | ✅ | `public/game_rates.json` | [game-rates.md](./game-rates.md) |
| Banner HUD `EXP ×N` | ✅ | `playExpRateUi.ts`, `welcome.rateExp` | [game-rates.md](./game-rates.md) |
| Anti-cheat progress | ✅ | `progressSyncPolicy.ts` | [game-rates.md](./game-rates.md) |

**Importante:** em multiplayer o `.env` / Railway Variables manda — **não** basta editar só `game_rates.json`.

---

## 3. Escala multiplayer (analise OTC)

| Item | Status | Código | Documentação |
|------|--------|--------|--------------|
| AOI PvP (`player_damaged` etc.) | ✅ | `attackHandlers.ts` + `creatureSpectatorRange.ts` | [analise-chatgpt.md](./analise-chatgpt.md) |
| Cap aggro (10 chasers/alvo) | ✅ | `shared/creatureChase.ts`, `RoomCreatureManager`, `npcAI.ts` | [analise-chatgpt.md](./analise-chatgpt.md) |
| Viewport cull NPC/remotos | ✅ | `depthSortDraw.ts`, `playApp.ts` | [multiplayer-remote-players.md](./multiplayer-remote-players.md) |
| IA chase só no aware range 25×20 | ✅ | `creatureHasPlayerInAwareRange()` | [analise-chatgpt.md](./analise-chatgpt.md) |

---

## 4. Movimento e rede

| Item | Status | Código | Documentação |
|------|--------|--------|--------------|
| Diagonal WS (`canAdjacentStep`) | ✅ | `shared/tileWalkable.ts` | [studio-improvements-log.md](./studio-improvements-log.md) §42 |
| `steppingDest` reserva destino | ✅ | `shared/steppingDestReserve.ts`, `moveHandlers.ts` | [multiplayer-remote-players.md](./multiplayer-remote-players.md) |
| Rate limit passos | ✅ | `moveHandlers.ts` — `× 0.80` | [multiplayer-remote-players.md](./multiplayer-remote-players.md) §2.2 |
| **Sem rubber-band em `MOVEMENT_TOO_FAST`** | ✅ | `GameRoom.rejectMove(..., sendCorrection=false)` + `forceResyncPosition()` | [multiplayer-remote-players.md](./multiplayer-remote-players.md) §2.2 |
| Predição cliente | ✅ | `clientMovementPrediction.ts` | — |
| Correção visual suave | ✅ | `positionCorrectionSlide.ts` | — |

---

## 5. Mobs — velocidade e facing

| Item | Status | Código | Documentação |
|------|--------|--------|--------------|
| `walkStepMs` por preset | ✅ | `mobPresetTypes.ts`, `creature_presets.json` | [studio-improvements-log.md](./studio-improvements-log.md) §51 |
| Campo no Studio (Mobs Stats) | ✅ | `mobStatsEditorModal.ts`, `studio.html` | §51 abaixo |
| Chase servidor usa `walkStepMs` | ✅ | `RoomCreatureManager.ts`, `creatureChase.ts` | — |
| Facing aggro com histerese | ✅ | `resolveAggroFaceDirection()` | `creatureChase.test.ts` |

---

## 6. Build / deploy / testes

| Item | Status | Notas |
|------|--------|-------|
| Testes server excluídos do `tsc` prod | ✅ | `server/tsconfig.json` — `src/**/*.test.ts` em `exclude` |
| `grantKillExperience.test.ts` mock atualizado | ✅ | `ConnectedPlayer` completo |
| Comandos npm novos | ✅ | `generate:spell-icons`, `generate:spell-cast-sprites` |

---

## 7. Lacunas conhecidas (ainda sem doc dedicada ou incompleto)

| Tópico | Situação | Ação sugerida |
|--------|----------|---------------|
| `docs/architecture.md` | Ainda fala em “cliente futuro” | Atualizado parcialmente — ver seção Play abaixo |
| `docs/hosting.md` | Não lista `game_rates.json` / seed de `spell_catalog` | Adicionar nota no volume DATA_ROOT |
| Magias custom só no volume (Gelo, Para…) | Ícones quebrados até upload ou commit | [spell-system.md](./spell-system.md) § Produção |
| `stages.json` por level (OTC) | Roadmap | [game-rates.md](./game-rates.md) |
| `move_request` refactor | Backlog | [multiplayer-remote-players.md](./multiplayer-remote-players.md) |

---

## 8. Comandos úteis (sessão jun/2026)

```bash
npm test
npm run generate:spell-icons      # PNG 32×32 + atualiza icon no spell_catalog.json
npm run generate:spell-cast-sprites # strips VFX em tiles/effects/spells/cast/
npm run dev                         # Vite + Express unificado
```

Variáveis novas em `.env.example`:

- `GAME_RATE_EXP` — multiplicador global de XP (servidor)

---

## 9. Mapa de documentos (atualizado jun/2026)

| Documento | Conteúdo |
|-----------|----------|
| [recent-features-jun-2026.md](./recent-features-jun-2026.md) | **Este índice** |
| [spell-system.md](./spell-system.md) | Magias, ícones, VFX, Studio APIs |
| [game-rates.md](./game-rates.md) | `GAME_RATE_EXP`, offline vs produção |
| [multiplayer-remote-players.md](./multiplayer-remote-players.md) | Remotos, AOI, movimento WS |
| [analise-chatgpt.md](./analise-chatgpt.md) | Checklist escala OTC (P1) |
| [studio-improvements-log.md](./studio-improvements-log.md) | Log histórico + checklist regressão mapa/sprites |
| [AGENTS.md](../AGENTS.md) | Guia rápido agentes + invariantes |
