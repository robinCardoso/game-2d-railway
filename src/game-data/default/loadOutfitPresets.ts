import type { Gender, VocationId } from '../../../shared/types/character';
import { resolveApiUrl } from '../../shared/apiUrl';

export type OutfitPreset = {
  id: string;
  name: string;
  vocationId: VocationId;
  gender: Gender;
  spriteSheetUrl: string;
  enabled?: boolean;
  showInCreation?: boolean;
};

import { assetLoader } from '../assetLoader';

export async function loadOutfitPresets(): Promise<OutfitPreset[]> {
  let outfits: OutfitPreset[];
  if (assetLoader.isPackaged()) {
    const raw = await assetLoader.getJson<OutfitPreset[]>('outfit_presets.json');
    if (!raw) throw new Error('Erro ao carregar outfit_presets.json do pacote assets.pak');
    outfits = raw;
  } else {
    const response = await fetch(resolveApiUrl('/outfit_presets.json'));
    if (!response.ok) {
      throw new Error('Erro ao carregar outfit_presets.json');
    }
    outfits = (await response.json()) as OutfitPreset[];
  }

  // Filtra apenas os que estão ativos ou habilitados (se enabled não for falso)
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
