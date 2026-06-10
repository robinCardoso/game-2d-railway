# Rates globais (XP) — Elarion Online

Paridade com OTC/Tibia `config.lua` → `rateExp`.

## Configuração

| Ambiente | Onde | Exemplo |
|----------|------|---------|
| **Servidor (autoritativo)** | Variável `GAME_RATE_EXP` | `1` normal, `2` double EXP |
| **Offline / dev** | `public/game_rates.json` | `{ "rateExp": 1 }` |
| **Build Vite (opcional)** | `VITE_GAME_RATE_EXP` | Só quando não há servidor |

Após mudar `GAME_RATE_EXP` em produção, **reinicie** o processo Node (Railway redeploy).

## Fórmula

```
xpGanho = floor(xpBaseDoMob * rateExp)
```

- `xpBase` vem de `creature_presets.json` → `xpReward`
- Penalidade PvP (−10% XP) **não** usa `rateExp` — é percentual do total atual

## Arquivos

| Arquivo | Papel |
|---------|--------|
| `shared/gameRates.ts` | `applyExpRate`, sanitização |
| `server/src/config/gameRates.ts` | Lê `env.rateExp` |
| `server/src/game/grantKillExperience.ts` | Grant + persistência |
| `public/game_rates.json` | Rate offline + seed Railway |
| `GET /api/game-rates` | Rate atual do servidor |

## Cliente

- `welcome.rateExp` — multiplayer (banner "EXP ×2")
- `creature_died.xpReward` — já escalado (floating text)
- `player_progress` — XP total autoritativo

## Anti-cheat

- Em produção, `progress_sync` do cliente **não** altera XP (`progressSyncPolicy.ts`).
- Nunca confiar em rate enviada pelo cliente.

## Evento double EXP

1. Railway → Variables → `GAME_RATE_EXP=2`
2. Redeploy
3. Jogadores veem banner no HUD ao reconectar

## Roadmap

- `stages.json` por faixa de level (substitui rate global, como OTC `stages.xml`)
- `rateLoot`, `rateSkill` separados
