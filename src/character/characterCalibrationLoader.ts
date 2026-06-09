import { resolveApiUrl } from '../shared/apiUrl';
import type { CharacterSpriteConfig } from './spriteAnimation';
import {
    mergeCharacterConfigWithCalibration,
    parseCharacterCalibration,
    spriteUrlToConfigPaths,
} from './characterCalibration';

/** Carrega JSON principal + arquivo lateral `.calibration.json` (prioridade na calibração). */
export async function fetchCharacterConfigMerged(spriteSheetUrl: string): Promise<CharacterSpriteConfig | null> {
    const { mainJson, calibrationJson } = spriteUrlToConfigPaths(spriteSheetUrl);
    const mainUrl = resolveApiUrl(`/${mainJson}`);

    let config: CharacterSpriteConfig | null = null;
    try {
        const mainRes = await fetch(mainUrl);
        if (mainRes.ok) {
            config = (await mainRes.json()) as CharacterSpriteConfig;
        }
    } catch {
        return null;
    }
    if (!config) return null;

    try {
        const calUrl = resolveApiUrl(`/${calibrationJson}`);
        const calRes = await fetch(calUrl);
        if (calRes.ok) {
            const calibration = parseCharacterCalibration(await calRes.text());
            return mergeCharacterConfigWithCalibration(config, calibration);
        }
    } catch (err) {
        console.warn('[characterCalibration] Falha ao carregar .calibration.json; usando JSON principal.', err);
    }

    return config;
}
