# Engine de personagens e sprites (plano estilo GameMaker)

## Objetivo

Separar **autoria** (criar/importar sprite, grid, animações, preview) de **runtime** (jogo usa JSON + `CharacterRenderer`).

O Knight deixa de ser tile `id: 6` no mapa; passa a ser entidade desenhada por cima do chão.

---

## Três camadas (não misturar)

```
┌──────────────────────────────────────────────────────────────┐
│  CHARACTER STUDIO (editor ADM) — src/editor/characterStudio/  │
│  Importar PNG, grid 2×2 / 3×3 / 4×4, origin, fps, preview    │
│  Exportar CharacterDefinition.json                           │
└────────────────────────────┬─────────────────────────────────┘
                             │ gera
┌────────────────────────────▼─────────────────────────────────┐
│  DADOS — assets/characters/<id>/ + data/characters/*.json    │
└────────────────────────────┬─────────────────────────────────┘
                             │ lê
┌────────────────────────────▼─────────────────────────────────┐
│  RUNTIME — src/character/sprite/ + CharacterRenderer         │
│  facing (grid) + anim loop + drawImage no canvas do jogo      │
└──────────────────────────────────────────────────────────────┘
```

---

## Pastas propostas

```
assets/characters/
  knight/
    sheet.png              # spritesheet importada (fonte)
    knight.character.json  # opcional: export junto da imagem

data/characters/           # ou public/characters/ para fetch
  knight.json              # definição canônica (versionada)

src/character/
  movementSpeed.ts         # já existe
  characterMovement.ts     # já existe
  facing.ts                # tipo CardinalFacing + helpers
  sprite/
    types.ts               # CharacterDefinition, AnimationDef, SheetDef
    loadCharacter.ts         # fetch / import JSON + Image
    spriteSheet.ts           # fatiar grid: frameIndex → {sx,sy,sw,sh}
    animationPlayer.ts       # loop, fps, frame atual, delta ms
    characterRenderer.ts     # desenha no canvas (mundo + preview)

src/editor/characterStudio/
  index.ts                 # init UI do estúdio
  sheetCanvas.ts           # imagem + overlay do grid + seleção
  previewPlayer.ts         # loop com fps configurável
  exportCharacter.ts       # gera JSON

src/movement/gridMovement.ts  # passo 1: adicionar facing ao player
```

---

## Formato de dados (`CharacterDefinition` v1)

```json
{
  "version": 1,
  "id": "knight",
  "name": "Knight",
  "sheet": {
    "image": "sheet.png",
    "frameWidth": 32,
    "frameHeight": 32,
    "columns": 4,
    "rows": 4,
    "originX": 16,
    "originY": 28
  },
  "animations": {
    "idle": {
      "frames": [0],
      "fps": 4,
      "loop": true
    },
    "walk": {
      "byDirection": {
        "north": [4, 5, 6, 7],
        "south": [0, 1, 2, 3],
        "east": [8, 9, 10, 11],
        "west": [12, 13, 14, 15]
      },
      "fps": 8,
      "loop": true
    }
  },
  "defaultAnimation": "idle",
  "walkAnimation": "walk"
}
```

- **frames**: índices row-major `col + row * columns` (como GameMaker subimages).
- **fps**: velocidade do **loop de animação** (independente de `stepDurationMs` do grid).
- **origin**: ponto dos pés no frame (alinhamento ao tile).

---

## Relação movimento grid × animação

| Sistema | Controla |
|---------|----------|
| `gridMovement` + speed | **Quando** muda de tile (`stepDurationMs`) |
| `animationPlayer` | **Qual frame** exibe e **fps** do ciclo walk |
| `player.facing` | **Qual faixa** `byDirection` usar |

Recomendação: 4 frames walk + 8 fps ≈ sensação natural com ~250–320 ms por tile.

---

## UI do Character Studio (menu **Personagem**)

Comportamento igual aos outros flyouts, mas painel **mais largo** (~420px) ou modal.

```
┌─ Personagem ──────────────────────────────────────────────┐
│ [Importar PNG]  Personagem: [ knight ▼ ]  [+ Novo]        │
├──────────────────────┬────────────────────────────────────┤
│  Spritesheet + grid  │  Propriedades                      │
│  ┌────────────────┐  │  Frame: 32 × 32                    │
│  │ ▢▢▢▢          │  │  Grid:  [4] col × [4] lin          │
│  │ ▢▢▢▢  overlay  │  │  Origin: X [16] Y [28]  [pés]    │
│  └────────────────┘  │  Animação: [ walk ▼ ]              │
│  Clique = seleciona  │  Direção: N S E W (faixa atual)     │
│  frames para anim    │  Frames: 0,1,2,3                   │
│                      │  FPS: [8]  [✓] Loop                │
├──────────────────────┴────────────────────────────────────┤
│  Preview (loop)     [ ▶ ] [ ■ ]   Fundo: ⬜ / 🟩 checker   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │            [sprite animado centralizado]             │ │
│  └──────────────────────────────────────────────────────┘ │
│  [Exportar knight.character.json]  [Aplicar no mapa teste] │
└───────────────────────────────────────────────────────────┘
```

### Regras de UX

1. **Um painel por vez** no flyout padrão; Personagem pode ser o mais largo.
2. Alterar **cols/rows** redesenha overlay sem perder PNG.
3. **Preview** usa o mesmo `animationPlayer` do jogo (WYSIWYG).
4. **Export** grava JSON; **Import** no estúdio recarrega PNG + JSON.
5. Atalho futuro: menu **Personagem** no top bar (`data-open-panel="character"`).

---

## Cuidados importantes

| Tema | Cuidado |
|------|---------|
| Tile vs personagem | Remover knight do `TILE_TYPES` / tileset de chão; só entidade |
| Tamanho do frame | Validar 16/32/48; default 32 para alinhar ao grid |
| Origin | Pés no centro inferior do frame — senão “flutua” no tile |
| fps vs speed | Não confundir fps da animação com SPEED stat |
| Pixel art | `image-rendering: pixelated` no canvas |
| Vite assets | PNG em `assets/characters/`; JSON pode usar path relativo |
| Memória | Uma `Image` por sheet; `drawImage(sx,sy,sw,sh,...)` |
| 8 direções | Fase 2; começar com 4 (N/S/E/W) |
| Colisão | Máscara opcional depois (`hitbox` no JSON); não no MVP |
| Versão JSON | `version: 1` + migração futura |
| IndexedDB / conta | Fora do MVP; só exportar arquivo |

---

## Fases de implementação (ordem)

### Fase A — Base runtime (1–2 dias)
- [ ] `facing` em `GridPlayerMotion` + set no `gridMovement`
- [ ] `sprite/types.ts` + `spriteSheet.ts` + `animationPlayer.ts`
- [ ] `characterRenderer.draw(ctx, player, def, nowMs)`
- [ ] Carregar `knight.json` hardcoded no `main.ts` (sem tile 6)

### Fase B — Character Studio mínimo (2–3 dias)
- [ ] Import PNG + cols/rows + preview loop + fps slider
- [ ] Seleção manual de índices de frames (lista ou clique)
- [ ] Export JSON

### Fase C — Grid visual (estilo GM)
- [ ] Overlay clicável; arrastar seleção de retângulo de frames
- [ ] Abas por animação (idle, walk, attack…)
- [ ] 4 direções com faixas separadas

### Fase D — Integração jogo
- [ ] Personagem no mapa teste usa renderer
- [ ] Walk sync: anim walk só avança frame enquanto `gridMovement.stepping`

---

## O que NÃO fazer no MVP

- Editor de hitbox por frame
- Combinação de múltiplas PNG em um personagem
- Bone animation / skeletal
- Sprites espelhados automáticos (espelhar W a partir de E) — fase 2

---

## Próximo passo imediato recomendado

**Fase A.1** — só `facing` no grid (rápido, desbloqueia animação direcional).

Depois **Fase A.2** — `CharacterRenderer` com 1 spritesheet 4×4 e walk por direção.

O export/import de mapa pode continuar em paralelo; são sistemas independentes.
