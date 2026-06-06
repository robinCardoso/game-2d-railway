Ponto que eu observaria com cuidado

A única parte que eu testaria bem é esta:

gridMovement.stepping = false;

Ela resolve input preso, mas pode ter um efeito colateral se a aba ficar oculta no meio de um passo.

Cenário possível:

player começa passo local
aba perde foco
cliente força stepping = false
servidor talvez ainda considere origem/destino anterior
ao voltar, resync_request corrige estado

Como você já manda resync_request ao voltar, isso tende a se corrigir. Mas eu testaria especificamente:

1. Começar a andar.
2. No meio do movimento, alt-tab.
3. Esperar mob/player se mover no servidor.
4. Voltar.
5. Ver se o player local não fica meio tile fora, travado, ou com input antigo.

Se aparecer problema, a melhoria seria: no onHidden, além de limpar input, mandar um último syncPositionIfChanged() antes do browser throttlar tudo, caso o WS ainda esteja aberto. Não é obrigatório agora, mas é uma proteção boa.

Outro detalhe fino: snap antes do snapshot novo

No handlePlayPageVisible, você faz:

serverCreatures.resetFrameClock();
serverCreatures.snapAllToAuthoritativeTiles();
remoteSprites.snapAllToAuthoritativeTiles();

if (gameNet?.isConnected()) {
  gameNet.requestRoomResync();
}

Isso é aceitável. O snap inicial evita delta gigante visual. Depois o resync_request traz o estado real do servidor. Mas visualmente pode acontecer um micro “snap antigo → snap novo” ao voltar foco.

Se ficar perceptível, a ordem alternativa seria:

visible:
  resetFrameClock
  requestRoomResync
  quando chegar creature_sync/state_sync:
    aplicar snapshot novo
    snap visual nesse snapshot

Mas para o estágio atual, sua solução está boa e mais simples.