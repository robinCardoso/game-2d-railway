Pontos de atenção sérios
1. Risco de peso no Play

Esse commit adiciona bastante lógica no Play: painel de detalhes, clique em slot, equipar/desequipar, render de 50 slots, abas de bolsa, cálculo de bônus, sync por WS e update do estado local. O próprio plano mostra que o fluxo agora passa por UI → mutate → validate → save → servidor → WebSocket → UI.

Isso não é errado, mas no seu projeto você já sentiu “peso” e lag depois de várias melhorias. Então agora eu não colocaria mais nenhuma feature grande antes de medir:

1. Abrir inventário parado
2. Abrir inventário enquanto anda
3. Matar mob com inventário aberto
4. Receber autoloot com inventário aberto
5. Equipar/desequipar repetidamente
6. Testar com 2 jogadores online

Se o FPS cair quando abre inventário, o problema provavelmente está em renderização/recriação de DOM. O ideal é o grid de 50 slots ser criado uma vez e depois só atualizar textContent, className, src e estados necessários.

2. Migrations merecem revisão antes de produção

A migration 007_inventory_bags.sql altera a primary key de character_backpack_slots. Isso é correto para suportar múltiplas bolsas, mas pode dar problema se já houver dados duplicados ou se alguma query antiga ainda assume primary key por (character_id, slot_index).

Antes de rodar em produção, eu validaria:

select character_id, slot_index, count(*)
from character_backpack_slots
group by character_id, slot_index
having count(*) > 1;

E depois:

select character_id, bag_index, slot_index, count(*)
from character_backpack_slots
group by character_id, bag_index, slot_index
having count(*) > 1;

Se tiver duplicidade, a migration pode falhar.

3. Segurança: o servidor precisa continuar sendo a autoridade

A implementação diz que o PUT /inventory valida o inventário e que o servidor sincroniza GameRoom.equipment + WS inventory_updated. Isso é exatamente o caminho certo.

Mas eu revisaria estes pontos:

O cliente não pode:
- criar item novo no inventário;
- aumentar quantidade de item;
- mover item para bolsa bloqueada;
- equipar item não implementado;
- equipar item no slot errado;
- equipar item que não existe no inventário salvo;
- alterar attackBonus, defenseBonus, speedBonus pelo payload;
- mandar unlockedBagSlots maior que o salvo no banco.

O servidor deve recalcular tudo usando o catálogo oficial, não aceitar estatística enviada pelo cliente.

4. unlocked_bag_slots precisa ser regra de produto, não só visual

A migration adiciona unlocked_bag_slots com default 3 e check entre 1 e 5. Isso está correto para seu plano de 5 abas com 2 bloqueadas.

Mas a UI precisa refletir isso de forma clara:

Aba 1: liberada
Aba 2: liberada
Aba 3: liberada
Aba 4: bloqueada / Comprar
Aba 5: bloqueada / Comprar

E o servidor precisa bloquear qualquer tentativa de salvar item em bag_index >= unlocked_bag_slots.

Minha conclusão

Essa implementação foi boa e estruturalmente importante. Ela não parece uma gambiarra; ela começou a transformar o inventário em um sistema real de RPG: equipamento, bolsas, slots, autoloot e sincronização online.

Mas agora o próximo passo não deveria ser adicionar mais interface ou mais sistema. O próximo passo deveria ser um commit só de estabilização:

Commit recomendado:
chore: harden inventory performance and validation

Com foco em:

1. Garantir que o servidor rejeita qualquer inventário adulterado.
2. Medir FPS com inventário aberto/fechado.
3. Evitar recriar 50 slots no DOM a cada update.
4. Confirmar que autoloot não trava quando todas as bolsas liberadas estão cheias.
5. Confirmar que bolsa 4 e 5 bloqueadas não aceitam item via request manual.
6. Confirmar que bônus de arma/escudo atualizam no combate sem precisar relogar.
7. Confirmar que migrations rodam em banco já populado.
Checklist de teste que eu faria agora
[ ] Criar personagem novo → começa com 3 bolsas liberadas.
[ ] Abrir inventário → mostra 5 abas, 2 bloqueadas.
[ ] Matar mob → item entra na bolsa 1.
[ ] Encher bolsa 1 → próximo loot entra na bolsa 2.
[ ] Encher bolsas 1, 2 e 3 → loot excedente falha com mensagem/log claro.
[ ] Tentar salvar item na bolsa 4 via request manual → servidor rejeita.
[ ] Equipar wooden_shield → vai para shield, não body.
[ ] Equipar leather_armor → vai para body.
[ ] Equipar iron_sword → vai para weapon.
[ ] Equipar segunda arma → arma antiga volta para primeira posição livre.
[ ] Mochila cheia + desequipar → falha com mensagem clara.
[ ] Equipar arma com attackBonus → dano muda no servidor.
[ ] Recarregar página → inventário/equipamentos continuam corretos.
[ ] Dois jogadores online → equipar item envia `inventory_updated` sem quebrar sessão.
[ ] FPS antes/depois abrindo inventário.

Minha opinião direta: pode seguir com essa base, mas agora precisa “travar qualidade” antes de avançar. Inventário é um sistema central; se ele ficar pesado ou inseguro, tudo depois — loot, loja, trade, upgrade, drop no chão, baú, compra de bolsa — vai herdar o problema.