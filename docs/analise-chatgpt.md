A direção está muito boa, mas agora apareceu um problema de arquitetura importante: vocações e progresso ainda não estão 100% centralizados para produção Railway.

O que ficou muito bom
1. VocationId agora aceita classes customizadas

Isso foi uma boa mudança. Antes você estava preso a knight | mage | archer. Agora VocationId virou string, com comentário dizendo que pode ser knight, mage, archer ou classes custom. Isso combina com o editor dinâmico de vocações.

Isso permite criar futuramente:

druid
paladin
necromancer
berserker
priest
assassin

sem brigar com TypeScript.

2. Editor de vocações ficou bem completo

Você criou vocationEditorModal.ts, com criação, edição, exclusão de vocações customizadas, simulação de stats no level 100 e proteção para não excluir vocações padrão (knight, mage, archer). Ele também salva via /api/save-vocations e recarrega dropdowns usando evento game:vocations-updated.

Isso é exatamente o tipo de ferramenta que o Studio precisa ter.

3. Stats por level estão melhores

calculateStatsForLevel agora trabalha com qualquer VocationConfig, usando baseStats + growthPerLevel. Isso é bom porque permite balanceamento por vocação sem espalhar fórmula em vários lugares.

A ideia está certa:

baseStats = força inicial da vocação
growthPerLevel = crescimento por level
stats finais = base + crescimento * level
4. Catálogo de itens foi uma boa base

O item_catalog.json começa vazio, mas você já criou estrutura com equipment, loot, slot, speedBonus, descrição e flag implemented.

Gostei da flag:

implemented: false

Isso é importante porque permite cadastrar loot futuro sem o item já existir de verdade no inventário/equipamento.

5. Loot de monstros foi preparado corretamente

Em mobPresetTypes.ts, você adicionou loot?: MobLootEntry[], race, stats efetivos e validação de drop chance entre 0 e 100. O comentário deixa claro que o loot está persistido para uso futuro, mas ainda não é consumido no Play.

Isso é uma boa decisão: primeiro cadastra estrutura, depois implementa drop real.

Pontos críticos que eu corrigiria
1. Vocações dinâmicas ainda não são a fonte real do Play

Esse é o ponto mais importante.

Você criou editor dinâmico, /api/get-vocations, /api/save-vocations e vocations.json. Mas partes importantes do jogo ainda importam diretamente:

import { VOCATIONS } from '../game-data/default/vocations';

Isso acontece no combate:

const vocationConfig = VOCATIONS[vocationId] || VOCATIONS.knight;

e também na UI de stats:

const vocationConfig = VOCATIONS[vocationId] || VOCATIONS.knight;

Ou seja: se você criar uma vocação nova no Studio, o personagem pode até salvar vocationId = druid, mas o combate e a UI podem cair no fallback de knight, porque estão usando o objeto estático compilado.

Como deveria funcionar

Você precisa ter um runtime vocation registry.

Exemplo:

src/game-data/vocationRegistry.ts

Com funções:

loadVocations()
getVocationById(id)
getAllVocations()
applyVocations(vocations)

E aí todo lugar usa isso:

const vocationConfig = getVocationById(vocationId);

Não mais:

VOCATIONS[vocationId]
2. Criação de personagem ainda carrega vocações estáticas

Na tela de criação, create.ts ainda importa VOCATIONS de default/vocations e popula o select inicialmente com ele. Ela até escuta VOCATIONS_UPDATED_EVENT, mas esse evento só funciona na mesma página/sessão; se você editar vocações no Studio e depois abrir /create.html, a criação não necessariamente busca as vocações salvas do servidor.

O fluxo correto deveria ser:

create.html abre
→ GET /api/get-vocations
→ popula dropdown com vocações reais
→ fallback para VOCATIONS estático só se API falhar

Hoje o editor está bom, mas a tela de criação ainda não está 100% conectada nele.

3. Salvamento de vocações pode não persistir no Railway Volume

No paths.ts, quando DATA_ROOT existe, você redireciona várias coisas para o volume:

maps
tiles
tile_catalog.json
creature_presets.json
outfit_presets.json
item_catalog.json

Mas vocationsConfigPath e vocationsJsonPath continuam apontando para:

src/game-data/default/vocations.ts
src/game-data/default/vocations.json

mesmo quando existe DATA_ROOT.

Isso é perigoso no Railway.

Se o Studio salvar vocações em arquivo dentro do código fonte do container, isso pode sumir em redeploy. Para produção, vocações editáveis precisam ir para:

/data/vocations.json

ou para PostgreSQL.

Então em paths.ts, quando env.dataRoot existir, eu faria:

vocationsJsonPath: path.join(env.dataRoot, 'vocations.json')

E manteria vocationsConfigPath só como legado/dev, não como fonte principal.

4. XP/level provavelmente não salva em produção com WS ticket ativo

Esse ponto é crítico.

No playCombat.ts, ao matar monstro, você aplica XP e level localmente:

const gain = applyExperienceGain(...)
options.character.experience = gain.experience;
options.character.level = gain.level;

Até aqui ok.

Mas em playApp.ts, o save de progresso faz:

if (isServerWsTicketEnabled() || !activeCharacter) return;

Ou seja: quando o modo produção com backend/ticket está ativo, o progresso não é salvo pelo frontend.

Pelo que dá para ver neste commit, o combate ainda é client-side. Então em produção Railway pode acontecer isto:

jogador mata monstro
ganha XP na tela
fecha o jogo
abre de novo
XP voltou ao valor antigo
Como corrigir sem refatorar tudo

Por enquanto, eu removeria essa trava só para progresso:

function scheduleProgressSave(immediate = false): void {
  if (!activeCharacter) return;
  ...
}

Você pode manter a posição autoritativa no servidor, mas permitir que progresso seja salvo via API enquanto o combate ainda é local.

Mais para frente, o correto será:

servidor calcula morte do monstro
servidor dá XP
servidor salva progresso

Mas ainda não parece ser essa fase.

5. Combate ainda é local, não multiplayer autoritativo

Isso não é bug agora, mas precisa ficar claro.

Hoje tickPlayCombat roda no cliente: ele procura monstro adjacente, calcula dano, reduz target.combatHealth, marca target.isDead e dá XP.

Para jogo single-player/local está ok.

Mas no multiplayer, isso significa que cada cliente pode ter uma versão própria dos monstros:

Player A mata troll na tela dele
Player B ainda vê troll vivo
Player A ganha XP local
Player B também pode matar o mesmo troll

Para MVP visual, tudo bem. Para gameplay online real, combate precisa ir para o servidor depois.

Sobre o sistema de itens/equipamento

A base está boa, mas ainda está em fase de estrutura.

Você criou equipment.ts, itemDefinitions.ts e cálculo de speedBonus por equipamento.

Isso permite futuramente:

boots com speedBonus
ring com mana bonus
amulet com defense
helmet com armor
weapon com attack

Mas hoje o ItemDefinition só expõe:

slot
speedBonus
description
implemented

Então minha sugestão para o próximo passo do item system seria ampliar o catálogo para aceitar bônus genéricos:

bonuses: {
  melee?: number;
  magicAttack?: number;
  distanceAttack?: number;
  defense?: number;
  attackSpeed?: number;
  health?: number;
  mana?: number;
  speed?: number;
}

Ao invés de começar criando muitos campos soltos tipo speedBonus, defenseBonus, manaBonus.

Ordem que eu recomendo agora
Prioridade 1 — centralizar vocações runtime

Criar:

src/game-data/vocationRegistry.ts

Com:

let runtimeVocations = { ...VOCATIONS };

export async function loadRuntimeVocations() {
  const res = await fetch('/api/get-vocations');
  if (res.ok) {
    const data = await res.json();
    runtimeVocations = sanitize/normalize(data.vocations);
  }
  return runtimeVocations;
}

export function getVocationById(id: string) {
  return runtimeVocations[id] ?? runtimeVocations.knight;
}

export function getRuntimeVocations() {
  return runtimeVocations;
}

export function applyRuntimeVocations(vocations) {
  runtimeVocations = vocations;
}

Depois trocar:

playCombat.ts
characterStatsUi.ts
create.ts

para usar o registry.

Prioridade 2 — salvar vocações no Volume

Ajustar paths.ts:

vocationsJsonPath: path.join(env.dataRoot, 'vocations.json')

quando DATA_ROOT existir.

E no boot, semear:

src/game-data/default/vocations.json
→ /data/vocations.json

igual você já faz com item_catalog.json, creature_presets.json e outros arquivos.

Prioridade 3 — salvar XP/level em produção

Enquanto o combate ainda for local, deixe updateCharacterProgress salvar mesmo com WS ticket ativo.

Ou crie uma regra separada:

const SERVER_AUTHORITATIVE_POSITION = isServerWsTicketEnabled();
const SERVER_AUTHORITATIVE_COMBAT = false;

Aí:

if (SERVER_AUTHORITATIVE_COMBAT) return;

Hoje o problema é que você está tratando “server WS ticket ativo” como se tudo fosse autoritativo no servidor. Mas ainda não é. Posição sim; combate ainda não.

Prioridade 4 — decidir fase do combate online

Você tem dois caminhos:

Caminho A — MVP rápido
combate local
XP salvo por API
monstros não sincronizados
bom para testar progressão
Caminho B — multiplayer real
combate no servidor
monstros no servidor
vida dos monstros sincronizada
XP calculado no servidor
loot calculado no servidor

Eu faria A agora e B depois.

Minha avaliação do commit

Esse commit é muito bom como avanço de ferramenta e RPG system, mas ele cria um ponto de atenção:

Você começou a transformar dados fixos em dados editáveis, mas algumas partes do jogo ainda continuam lendo dados fixos compilados.

Isso é normal nessa fase.

O sistema está indo de:

vocações hardcoded
monstros simples
sem item catalog
sem UI de status

para:

vocações editáveis
stats por level
monstros com combate/loot
catálogo de itens
UI de status
progressão

A direção está correta.

Mas antes de adicionar inventário/drop real, eu estabilizaria:

1. vocações runtime funcionando em todas as telas
2. vocações salvas no volume
3. XP/level persistindo em produção
4. stats UI usando vocação dinâmica
5. combate usando vocação dinâmica

Depois disso, aí sim o próximo passo natural é:

drop de loot
inventário
equipar item
bônus no cálculo de stats

Minha conclusão: commit aprovado como evolução, mas eu faria um commit de correção arquitetural antes de continuar criando mais features.