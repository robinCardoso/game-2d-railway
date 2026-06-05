Objetivo

Separar definitivamente:

vocationId = status/classe
gender = visual base
outfitId = aparência escolhida

Hoje você está perto disso, mas ainda existe confusão entre presetId e vocationId.

1. Atualizar o tipo do personagem

Em shared/types/character.ts, garanta algo assim:

export type VocationId = 'knight' | 'mage' | 'archer';
export type Gender = 'male' | 'female';

export type CharacterAppearance = {
  gender: Gender;
  outfitId: string;
  spriteSheetUrl: string;
};

export type Character = {
  id: string;
  name: string;
  gameId: string;

  vocation: VocationId;

  appearance: CharacterAppearance;

  mapId: string;
  spawnMapId: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  direction: 'north' | 'south' | 'east' | 'west';
};

Regra:

vocation nunca deve guardar sprite
outfit nunca deve guardar status
character guarda os dois
2. Padronizar outfit_presets.json

Em public/outfit_presets.json, use este formato:

[
  {
    "id": "knight_male_default",
    "name": "Knight Male Default",
    "vocationId": "knight",
    "gender": "male",
    "spriteSheetUrl": "tiles/characters/vocations/male/knight.png",
    "enabled": true
  },
  {
    "id": "knight_female_default",
    "name": "Knight Female Default",
    "vocationId": "knight",
    "gender": "female",
    "spriteSheetUrl": "tiles/characters/vocations/female/knight.png",
    "enabled": true
  }
]

Depois você pode ter:

{
  "id": "knight_male_gold",
  "name": "Knight Male Gold Armor",
  "vocationId": "knight",
  "gender": "male",
  "spriteSheetUrl": "tiles/characters/vocations/male/knight_gold.png",
  "enabled": true
}
3. Criar helper para carregar outfits

Crie:

src/game-data/default/loadOutfitPresets.ts
import type { Gender, VocationId } from '../../../shared/types/character';

export type OutfitPreset = {
  id: string;
  name: string;
  vocationId: VocationId;
  gender: Gender;
  spriteSheetUrl: string;
  enabled?: boolean;
};

export async function loadOutfitPresets(): Promise<OutfitPreset[]> {
  const response = await fetch('/outfit_presets.json');

  if (!response.ok) {
    throw new Error('Erro ao carregar outfit_presets.json');
  }

  const outfits = (await response.json()) as OutfitPreset[];

  return outfits.filter((outfit) => outfit.enabled !== false);
}

export function findOutfitPreset(
  outfits: OutfitPreset[],
  outfitId: string
): OutfitPreset | undefined {
  return outfits.find((outfit) => outfit.id === outfitId);
}

export function filterOutfitsByVocationAndGender(
  outfits: OutfitPreset[],
  vocationId: VocationId,
  gender: Gender
): OutfitPreset[] {
  return outfits.filter(
    (outfit) =>
      outfit.vocationId === vocationId &&
      outfit.gender === gender &&
      outfit.enabled !== false
  );
}
4. Alterar tela de criação

Hoje provavelmente você tem algo como:

select preset
select gender
preview

Troque para:

select vocation
select gender
select outfit
preview

HTML/DOM mental:

vocationSelect
genderSelect
outfitSelect
presetPreview

Fluxo:

let outfitPresets: OutfitPreset[] = [];

async function initCreateCharacter() {
  outfitPresets = await loadOutfitPresets();

  renderVocationOptions();
  renderGenderOptions();
  renderOutfitOptions();
  updatePreview();
}

Quando mudar vocação ou gênero:

function renderOutfitOptions() {
  const vocationId = vocationSelect.value as VocationId;
  const gender = genderSelect.value as Gender;

  const availableOutfits = filterOutfitsByVocationAndGender(
    outfitPresets,
    vocationId,
    gender
  );

  outfitSelect.innerHTML = '';

  for (const outfit of availableOutfits) {
    const option = document.createElement('option');
    option.value = outfit.id;
    option.textContent = outfit.name;
    outfitSelect.appendChild(option);
  }

  updatePreview();
}

Preview:

function updatePreview() {
  const outfit = findOutfitPreset(outfitPresets, outfitSelect.value);

  if (!outfit) {
    presetPreview.src = '';
    return;
  }

  presetPreview.src = `/${outfit.spriteSheetUrl}`;
}
5. Na criação do personagem

Ao salvar, pegue:

const vocationId = vocationSelect.value as VocationId;
const gender = genderSelect.value as Gender;
const outfitId = outfitSelect.value;
const outfit = findOutfitPreset(outfitPresets, outfitId);

Valide:

if (!outfit) {
  throw new Error('Outfit inválido');
}

if (outfit.vocationId !== vocationId) {
  throw new Error('Outfit não pertence à vocação selecionada');
}

if (outfit.gender !== gender) {
  throw new Error('Outfit não pertence ao gênero selecionado');
}

Crie o personagem assim:

await createCharacter({
  name,
  vocation: vocationId,
  gender,
  outfitId: outfit.id,
  spriteSheetUrl: outfit.spriteSheetUrl,
});
6. Ajustar characterStore.ts

A função de criação não deve mais receber presetId como se fosse vocação.

Evite:

createCharacter(name, presetId, gender)

Prefira:

createCharacter({
  name,
  vocationId,
  gender,
  outfitId,
  spriteSheetUrl,
})

Exemplo:

export async function createCharacter(input: {
  name: string;
  vocationId: VocationId;
  gender: Gender;
  outfitId: string;
  spriteSheetUrl: string;
}) {
  const gameConfig = DEFAULT_GAME_CONFIG;

  const character = {
    id: crypto.randomUUID(),
    name: input.name,
    gameId: gameConfig.id,

    vocation: input.vocationId,

    gender: input.gender,
    outfitId: input.outfitId,
    spriteSheetUrl: input.spriteSheetUrl,

    spawnMapId: gameConfig.start.mapId,
    mapId: gameConfig.start.mapId,
    position: gameConfig.start.position,
    direction: gameConfig.start.direction,
  };

  return saveCharacter(character);
}
7. Ajustar Supabase/mock

No banco/personagem salvo, precisa existir:

vocation
gender
outfit_id
sprite_sheet_url

No mock/localStorage, mesma coisa.

Se ainda não quiser mexer no banco agora, use fallback:

outfitId: config.outfitId ?? `${vocation}_${gender}_default`

Mas o ideal é já salvar certo.

8. Ajustar Play

No Play, para renderizar o personagem:

Use:

character.spriteSheetUrl

Não recalcule por vocação/gênero.

Porque agora o jogador pode ser:

vocation: knight
gender: male
outfitId: knight_male_gold
spriteSheetUrl: tiles/characters/vocations/male/knight_gold.png

Se você recalcular:

/vocations/male/knight.png

vai perder o outfit escolhido.

9. Studio

No Studio, quando salvar um Player Sprite, ele deve registrar ou atualizar um outfit preset.

Campos mínimos:

id
name
vocationId
gender
spriteSheetUrl
enabled

Exemplo de regra:

Se tipo = player:
  salva PNG/JSON
  atualiza outfit_presets.json

Se tipo = monster/npc:
  salva PNG/JSON
  atualiza creature_presets.json
Ordem segura de implementação

Faça assim:

Commit 1:
- Criar tipo OutfitPreset
- Criar loadOutfitPresets.ts

Commit 2:
- Alterar create.ts para vocation + gender + outfit

Commit 3:
- Alterar characterStore.ts para salvar outfitId e spriteSheetUrl

Commit 4:
- Ajustar Play para usar spriteSheetUrl salvo

Commit 5:
- Ajustar Studio para registrar outfit_presets.json ao salvar Player

Não faça tudo em um commit só.

Regra principal

O fluxo final deve ser:

Studio cria Outfit
↓
outfit_presets.json registra outfit
↓
characters/create.ts lista outfits
↓
jogador escolhe vocação + gênero + outfit
↓
character salva vocationId + gender + outfitId + spriteSheetUrl
↓
Play usa spriteSheetUrl salvo

Isso deixa o sistema preparado para vários visuais por vocação sem quebrar status, mapa, combate ou criação de personagem.