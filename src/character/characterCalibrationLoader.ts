import { assetLoader } from '../game-data/assetLoader';
import type { CharacterSpriteConfig } from './spriteAnimation';
import {
    mergeCharacterConfigWithCalibration,
    parseCharacterCalibration,
    spriteUrlToConfigPaths,
} from './characterCalibration';

/** Carrega JSON principal + arquivo lateral `.calibration.json` (prioridade na calibração). */
export async function fetchCharacterConfigMerged(spriteSheetUrl: string): Promise<CharacterSpriteConfig | null> {
    await assetLoader.initialize();
    const { mainJson, calibrationJson } = spriteUrlToConfigPaths(spriteSheetUrl);

    const config = await assetLoader.fetchJson<CharacterSpriteConfig>(mainJson);
    if (!config) return null;

    try {
        const calibrationText = await assetLoader.fetchText(calibrationJson);
        if (calibrationText) {
            const calibration = parseCharacterCalibration(calibrationText);
            return mergeCharacterConfigWithCalibration(config, calibration);
        }
    } catch (err) {
        console.warn('[characterCalibration] Falha ao carregar .calibration.json; usando JSON principal.', err);
    }

    return config;
}
