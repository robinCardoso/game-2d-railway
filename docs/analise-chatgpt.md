3. Cuidado com spam de erro MOVEMENT_TOO_FAST

Quando o movimento é rejeitado, você faz:

console.warn(...)
send error
sendPositionCorrection(...)

Funciona, mas se um client bugado ou malicioso floodar movimento, isso pode gerar muito log e muita resposta de correção.

Para produção, depois eu adicionaria um throttle simples de erro por player:

lastMoveErrorSentAtMs

E só mandar erro/correction a cada, por exemplo, 250ms ou 500ms.

**Status (2026-06-05):** implementado em `GameRoom.rejectMove()` — `lastMoveRejectionSentAtMs`, throttle **400ms**, cobre todos os códigos de rejeição (`INVALID_TILE`, `NOT_WALKABLE`, `INVALID_STEP`, `MOVEMENT_TOO_FAST`); excesso = silent drop.
