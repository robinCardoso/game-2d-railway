# Sistema de magias — Elarion Online

Arquitetura inspirada no Tibia 8.6: **catálogo editável** (metadados) separado da **execução** (TypeScript client/server).

## Dados

| Arquivo | Papel |
|---------|-------|
| `public/spell_catalog.json` | Fonte de verdade das magias |
| `src/game-data/spellCatalogTypes.ts` | Schema + sanitização |
| `src/game-data/spellCatalog.ts` | Loader no client |
| `tiles/effects/spells/icons/{id}.png` | Ícones 32×32 da hotbar (fora do tile registry) |
| `scripts/generate-spell-icon-sprites.mjs` | Placeholders + atualiza `icon` no catálogo |

## Play

| Módulo | Função |
|--------|--------|
| `src/game/ui/playCombatHub.ts` | Hub inferior direito (ataque + slots 1–3) |
| `src/game/ui/playSpellBar.ts` | Persistência `localStorage` `play.spellBar.{characterId}` |
| `src/game/playSpellCast.ts` | Validação e cast offline / envio WS |
| `src/game/ui/playSpellModal.ts` | Modal Magias (lista + detalhe, slots 1–3) |
| `src/game/play-spell-modal.css` | Estilos desktop/mobile do modal |

### HUD

- Classe de fase: `play-ui-redesign--phase4`
- CSS hub: `src/game/play-hud-combat.css`
- CSS modal magias: `src/game/play-spell-modal.css`
- Botão **Gerenciar magias** no painel Personagem abre `#spellsPanel`
- Cooldown do ataque básico: `getPlayAttackCooldownProgress()` em `playCombat.ts`
- Hotkeys desktop: `1`, `2`, `3`

## Rede

Mensagem cliente → servidor:

```json
{ "type": "cast_spell", "spellId": "mock_fire_bolt", "creatureId": "spawn_…", "mapId": "…" }
```

Implementação: `shared/protocol.ts`, `gameNetClient.sendCastSpell`, `GameRoom.handleCastSpell`.

## Servidor

- `server/src/game/SpellCatalogStore.ts` — leitura de `spell_catalog.json`
- `server/src/combat/spellCast.ts` — validação mana/CD/alcance/vocação
- `server/src/game/RoomCreatureManager.processSpellCast` — dano autoritativo em mobs

## Studio

- Painel flyout **Magias** (`data-panel="spells"`)
- `src/editor/spellEditor.ts`
- APIs: `GET /api/get-spell-catalog`, `POST /api/save-spell-catalog`, `POST /api/save-spell-icon`

### Ícones da hotbar (PNG)

| Ação | Resultado |
|------|-----------|
| **Upload no Studio** | `POST /api/save-spell-icon` grava `tiles/effects/spells/icons/{spellId}.png` no volume (`DATA_ROOT`) e atualiza `icon` no catálogo |
| **Versionar no git** | Commit dos PNG em `tiles/effects/spells/icons/` — o deploy Railway faz seed de `tiles/effects/**` para o volume |
| **Placeholders locais** | `npm run generate:spell-icons` — gera PNG 32×32 por entrada do catálogo e define `icon: "/tiles/effects/spells/icons/{id}.png"` |

Campo `icon` no JSON: sempre URL absoluta servida pelo Express, ex. `/tiles/effects/spells/icons/knight_brutal_strike.png`.

**Produção:** catálogo editado no Studio fica no volume; ícones só aparecem se o PNG existir no volume (upload) ou vier do repo no deploy. Após criar magia nova, faça upload do ícone ou rode `generate:spell-icons` + commit + redeploy.

SVGs em `public/ui/play-hud/combat/` são fallback legado (`slot_empty.svg`); magias novas devem usar PNG.

## VFX de conjuração (`castEffect`)

Strips PNG + JSON em `tiles/effects/spells/cast/{castEffect}.png` (fundo magenta, chroma no cliente — igual combate).

| `castEffect` | Strip | Frames |
|--------------|-------|--------|
| `knight_brutal_strike` | `knight_brutal_strike.png` | 4 — corte |
| `knight_ground_slam` | `knight_ground_slam.png` | 5 — onda no chão |
| `knight_front_sweep` | `knight_front_sweep.png` | 4 — arco |
| `melee_default` | `melee_default.png` | 4 |
| `magic_default` | `magic_default.png` | 4 — pulso |

| Módulo | Função |
|--------|--------|
| `src/game/spellCastEffectSprites.ts` | Load PNG/JSON, draw strip + rotação |
| `src/game/spellCastEffects.ts` | Spawn + fila ativa (fallback canvas se PNG não carregou) |
| `scripts/generate-spell-cast-sprites.mjs` | Regenerar placeholders: `npm run generate:spell-cast-sprites` |

Substituir os PNG por arte no Studio ou editor de imagem — manter `frameWidth` 64, strip horizontal, fundo `#FF00FF`.

## Roadmap (pós-MVP)
- Projéteis e LOS
- Persistência `CharacterRow.spellBar` no servidor
- Poções F1/F2 e botão Interagir no hub
