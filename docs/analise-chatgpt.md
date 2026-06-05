Sobre cada ponto
1. Clamp 55–600ms

Sim, faz sentido.

O servidor não deve aceitar 16ms vindo do cliente como duração real de passo público.

Mas também não deve usar 80ms, porque isso entra em conflito com sua própria curva de velocidade.

Então o correto seria algo assim:

const MIN_SERVER_STEP_DURATION_MS = 55;
const MAX_SERVER_STEP_DURATION_MS = 600;

E no parser:

export function parseStepDurationMs(raw: unknown): number | undefined {
  const n = Number(raw);

  if (!Number.isFinite(n)) {
    return undefined;
  }

  return Math.max(
    MIN_SERVER_STEP_DURATION_MS,
    Math.min(MAX_SERVER_STEP_DURATION_MS, Math.round(n))
  );
}

Comentário importante:

// 55ms matches STEP_DURATION_BY_SPEED.AT_MAX_SPEED.
// Do not raise this without updating the movement speed curve.

Isso evita você mesmo esquecer depois por que esse número existe.

2. Rate limit é mais importante que snapshot buffer agora

Esse ponto é crucial.

O problema real antes do público não é só o client mandar:

stepDurationMs = 16

O problema maior é ele mandar muitos movimentos por segundo.

Mesmo com clamp, se o servidor aceitar vários move rápido demais, o player pode avançar tiles em sequência.

Então o servidor precisa guardar por player algo como:

lastMoveAcceptedAtMs

E validar:

agora - último movimento >= stepDurationMs mínimo permitido

Ou, melhor ainda:

agora - último movimento >= duração esperada do personagem

Para MVP, pode ser simples:

const now = Date.now();
const minInterval = parsedStepDurationMs ?? MIN_SERVER_STEP_DURATION_MS;

if (now - player.lastMoveAcceptedAtMs < minInterval * 0.85) {
  return;
}

Eu usaria uma tolerância pequena, tipo 0.85, para não punir jitter de rede durante desenvolvimento.

Mais tarde, para produção séria, o servidor deve calcular a duração oficial e ignorar totalmente o valor enviado pelo client.

3. chordHeldSinceMs dentro do controller

Concordo: não é urgente, mas é barato e melhora a arquitetura.

E eu concordo mais ainda com este detalhe:

mover junto lastMovementFacingKey / prevMovementFacingKeys.

Porque aí o estado de input deixa de ser global do módulo e passa a pertencer ao controller.

Isso evita bug futuro em:

Studio
Play
debug local
replay
NPC
hot reload

Não muda gameplay. É refactor seguro.

Eu faria isso depois do clamp/rate limit.

4. RemoteSnapshotBuffer não precisa vir agora

Concordo com sua conclusão.

Se com duas abas o movimento está bom, e com stepDurationMs + grace 120ms o remoto está fluido, o buffer completo pode esperar.

Ele é importante para:

ping variável
muitos players
produção
Wi-Fi ruim
mobile real

Mas implementar cedo demais pode adicionar:

delay perceptível
jitter novo
debug mais difícil
diferença entre posição lógica e visual

Então eu só implementaria depois de testar com latência artificial.

Teste ideal:

Chrome DevTools
Network
Throttle custom
Latency: 150ms
Download: normal
Upload: normal

Se ainda ficar bom, não mexe.

Se ficar com micro-tranco, aí sim entra:

serverTime + RemoteSnapshotBuffer
Minha recomendação revisada

O próximo commit ideal agora não é snapshot buffer.

É este:

Commit 1
fix: harden server movement timing

Inclui:

parseStepDurationMs min 55
constantes documentadas
rate limit simples por player
logs dev quando movimento for rejeitado por timing
Commit 2
refactor: keep movement input timing inside controller

Inclui:

chordHeldSinceMs dentro do GridMovementController
lastMovementFacingKey dentro do controller
prevMovementFacingKeys dentro do controller
resetGridMovementInputState atuando no controller
Commit 3, só se necessário
feat: add remote snapshot buffer

Só depois de testar latência e confirmar tranco real.

Minha resposta direta

Sua análise está correta.

Eu ajustaria o plano para:

Agora:
- clamp 55–600ms no servidor
- rate limit de movimento

Depois:
- refactor do estado global do input

Mais tarde:
- RemoteSnapshotBuffer com serverTime

Produção séria:
- servidor calcula velocidade oficial
- client só envia intenção de movimento

E sim: não use 80ms. Para o seu sistema, o valor correto mínimo agora é 55ms, porque ele respeita o AT_MAX_SPEED que você já definiu.

---

## Implementado (2026-06-05)

| Item | Status |
|------|--------|
| `MIN_SERVER_STEP_DURATION_MS` 55 + `MAX` 600 em `shared/protocol.ts` | ✅ |
| `chordHeldSinceMs` / `lastMovementFacingKey` / `prevMovementFacingKeys` no `GridMovementController` | ✅ |
| Rate limit de movimento no servidor (`MOVEMENT_TOO_FAST`, tolerância 0.85) | ✅ |
| `RemoteSnapshotBuffer` + `serverTime` | ⏳ após teste com throttle 150ms |