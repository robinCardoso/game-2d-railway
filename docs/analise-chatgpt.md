Regra principal

O player local anda pelo input.

O player remoto nunca deve “pular” direto para o tile recebido. Ele deve receber um alvo e caminhar visualmente até ele.

Algo assim conceitualmente:

remotePlayer.currentWorldX
remotePlayer.currentWorldY

remotePlayer.targetWorldX
remotePlayer.targetWorldY

remotePlayer.visualX = lerp(current, target, alpha)
remotePlayer.visualY = lerp(current, target, alpha)

O servidor manda:

{
  playerId,
  tileX,
  tileY,
  direction,
  appearance,
  timestamp
}

O client transforma isso em:

targetPixelX = tileX * TILE_SIZE
targetPixelY = tileY * TILE_SIZE

E anima até lá.

2. Separar claramente “posição lógica” e “posição visual”

Esse é um ponto muito importante.

Você precisa ter duas posições no sistema:

Posição lógica

É a posição real no grid.

Exemplo:

tileX: 10
tileY: 8

Essa posição serve para:

colisão;
combate;
range de ataque;
interação com NPC;
validação do servidor;
pathfinding;
mapa;
portas;
teleporte.
Posição visual

É onde o sprite está sendo desenhado na tela.

Exemplo:

renderX: 640.4
renderY: 512.8

Essa posição serve apenas para:

desenho;
suavização;
animação;
sensação de movimento.

O erro comum é usar a mesma posição para tudo. Aí o multiplayer fica travado, porque cada update do servidor reposiciona o personagem seco no grid.

3. Criar um RemotePlayerController

Eu não deixaria essa lógica espalhada no render, nem no websocket direto.

Criaria algo nessa linha:

RemotePlayerController

Responsável por:

receber snapshots do servidor;
guardar fila de movimentos;
interpolar posição;
atualizar direção;
atualizar animação;
resolver atraso de rede;
evitar teleporte pequeno;
aplicar teleporte real quando a distância for muito grande.

Exemplo de responsabilidade:

remotePlayer.applySnapshot(snapshot)
remotePlayer.update(deltaTime)
remotePlayer.draw(ctx)

Isso deixa a estrutura limpa.

4. Criar buffer de snapshots

Para movimento online ficar bonito, o client normalmente não renderiza exatamente o último estado recebido. Ele renderiza um pouco “atrasado”, tipo 100ms ou 150ms.

Por quê?

Porque assim ele tem dois pontos para interpolar:

snapshotA -> snapshotB

Sem isso, ele recebe um ponto, anda, recebe outro, corrige, anda, corrige… e parece que o player remoto está “travando”.

Então o próximo passo profissional seria:

remoteSnapshots: PlayerSnapshot[]

E o render usa:

renderTime = now - interpolationDelay

Daí você acha dois snapshots:

beforeSnapshot
afterSnapshot

E interpola entre eles.

Isso vai deixar o multiplayer muito mais fluido.

5. Definir o servidor como autoridade

Depois que o movimento visual estiver bom, você precisa decidir a regra principal:

O client pede movimento. O servidor valida. O servidor confirma. Todos recebem.

Fluxo ideal:

Client local aperta direita
↓
Client mostra movimento local imediatamente
↓
Client envia move_request para servidor
↓
Servidor valida colisão/grid
↓
Servidor atualiza posição oficial
↓
Servidor envia player_moved para todos
↓
Client local confirma ou corrige
↓
Clients remotos interpolam

Por enquanto você pode manter mais simples, mas já deve estruturar pensando nisso.

Não deixe o client mandar simplesmente:

"estou na posição X/Y"

O correto é mandar intenção:

"quero andar para direita"

O servidor calcula se pode ou não.

---

**Documentação canônica (atualizada):** ver [multiplayer-remote-players.md](./multiplayer-remote-players.md) para o que já está implementado e o backlog (buffer de snapshots, AOI, `move_request`, etc.).