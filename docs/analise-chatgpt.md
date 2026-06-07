Pontos que eu validaria com cuidado agora
1. Ataque em player depende de ID começar com p_

No playCombat.ts, o cliente decide se o alvo é player usando:

if (combatTargetId.startsWith('p_')) {
  ...
}

O problema é: isso depende do padrão do playerId.

Se todo playerId do servidor sempre começa com p_, ok. Mas se em produção vier UUID, account id, character id ou outro formato, o cliente vai tratar player como monstro e o PvP não dispara corretamente.

Eu recomendo trocar isso por um estado explícito:

combatTarget = {
  id: string,
  type: 'monster' | 'player'
}

Hoje findTargetAtWorldPoint() já retorna { id, type }, mas você perde o type quando salva só combatTargetId.

Esse é o principal ajuste que eu faria.

2. Protocolo de ataque ainda chama o campo de creatureId

O AttackMessage continua assim:

creatureId: string

Mas agora ele pode representar:

ID de monstro
ou ID de player

Funciona tecnicamente, mas semanticamente ficou estranho. Melhor seria:

targetId: string
targetType: 'creature' | 'player'

Não precisa mudar agora se quiser manter compatibilidade, mas para o futuro isso evita confusão.

3. resolveApiUrl() precisa cuidar de barra dupla

O resolveApiUrl() atual concatena:

`${apiBaseUrl}${path}`

Se alguém configurar:

VITE_API_BASE_URL=https://api.seujogo.com/

e chamar:

/api/auth/login

a URL vira:

https://api.seujogo.com//api/auth/login

Geralmente funciona, mas é melhor blindar:

const base = apiBaseUrl.replace(/\/$/, '');
return `${base}${path}`;

Não é crítico, mas é melhoria simples.

4. Recarregamento do registry do servidor

Você criou refreshServerMapEntry(mapId) no server/src/mapRegistry.ts, que relê pvpEnabled e instanced do JSON salvo.

O que eu não consegui confirmar pelo patch/minified é se o endpoint de salvar mapa chama isso imediatamente após salvar. O app.ts mostra que o Studio router está registrado, mas não ficou claro no trecho aberto onde o refresh é chamado.

Se ainda não estiver chamando, precisa garantir algo assim após saveMap:

refreshServerMapEntry(mapId);

Senão, o GM salva pvpEnabled=false, o JSON fica certo, mas o servidor só aplica depois de restart.

5. Teste real de morte PvP com dois clientes

No servidor, a morte PvP agora faz:

broadcast player_damaged
broadcast player_died
calcula perda de XP se não for arena
recalcula maxHealth
move para spawn
cura HP
broadcast player_respawned
position_correction para vítima
persistência imediata

Isso está muito bom.

Mas precisa testar visualmente com 2 clientes:

Jogador A mata Jogador B.
B vê dano, morte e volta no templo.
A vê B sumir/respawnar no templo.
Terceiro jogador C vê a mesma coisa.
B reloga e continua no spawn com HP cheio.

Esse teste é obrigatório antes de dizer “PvP pronto”.

Minha conclusão

Essas melhorias foram fortes e bem direcionadas. Você resolveu problemas reais que eu tinha apontado antes: HP no welcome, sync de dano, respawn para observadores, pvpEnabled no JSON e leitura pelo servidor.

O projeto agora saiu de:

multiplayer com mobs + movimento

para:

base real de MMORPG 2D com PvP, HP persistente, mapa configurável e feedback visual

Mas eu ainda não fecharia como produção pública. Eu faria mais um commit pequeno de robustez:

fix: store combat target type explicitly and harden runtime api url

Com 3 mudanças:

1. combatTargetId -> combatTarget { id, type }
2. AttackMessage futuro: targetId/targetType ou pelo menos abstrair internamente
3. resolveApiUrl() remover barra final do VITE_API_BASE_URL

Depois disso, eu faria teste manual com 2 ou 3 clientes conectados ao Railway