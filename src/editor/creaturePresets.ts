import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import {
    sanitizeCreaturePresetEntry,
    type CreaturePresetEntry,
    type CreatureVisualSize,
    type MobLootEntry,
    type MobRace,
} from '../game-data/mobPresetTypes';
import { invalidateCreatureThumbnailCache } from './creaturePresetThumbnail';
import { resolvePublicAssetUrl } from '../shared/apiUrl';
import { assetLoader } from '../game-data/assetLoader';

export type { CreatureVisualSize, MobLootEntry, MobRace };
export type CreaturePreset = CreaturePresetEntry;

const PRESETS_URL = '/creature_presets.json';

/** Altura/largura alvo no tile (px) — não altera o recorte da spritesheet. */
export const CREATURE_VISUAL_SIZE_PX: Record<CreatureVisualSize, number> = {
    tiny: 16,
    small: 24,
    medium: 32,
    large: 48,
    boss: 64,
};

let presets: CreaturePreset[] = [];
const configBySpawnName = new Map<string, CharacterSpriteConfig>();

/** Escala de desenho no tile (1 = tamanho nativo do frame na sheet). */
export function computeCreatureDrawScale(
    frameWidth: number,
    frameHeight: number,
    visualSize: CreatureVisualSize | undefined
): number {
    if (!visualSize) return 1;
    const targetPx = CREATURE_VISUAL_SIZE_PX[visualSize];
    const native = Math.max(1, frameWidth, frameHeight);
    return targetPx / native;
}

function applyVisualSize(
    config: CharacterSpriteConfig,
    visualSize: CreatureVisualSize | undefined
): void {
    if (!visualSize) return;
    config.drawScale = computeCreatureDrawScale(
        config.frameWidth,
        config.frameHeight,
        visualSize
    );
}

export function getCreaturePresets(): readonly CreaturePreset[] {
    return presets;
}

export function getCreaturePreset(name: string): CreaturePreset | undefined {
    return presets.find((p) => p.name === name);
}

export function getCreatureConfigForSpawn(spawnName: string): CharacterSpriteConfig | undefined {
    return configBySpawnName.get(spawnName);
}

/** Carrega `public/creature_presets.json` e os JSONs de sprite referenciados. */
export async function loadCreaturePresets(): Promise<void> {
    presets = [];
    configBySpawnName.clear();

    try {
        let rawArray: any[];
        if (assetLoader.isPackaged()) {
            const raw = await assetLoader.getJson<any[]>('creature_presets.json');
            if (!raw) throw new Error('creature_presets.json não encontrado no pacote assets.pak');
            rawArray = raw;
        } else {
            const res = await fetch(resolvePublicAssetUrl(PRESETS_URL), { cache: 'no-store' });
            if (!res.ok) {
                console.warn('[CreaturePresets] creature_presets.json ausente — nenhuma criatura na paleta.');
                return;
            }
            rawArray = await res.json();
        }

        if (!Array.isArray(rawArray)) {
            console.warn('[CreaturePresets] creature_presets.json deve ser um array JSON.');
            return;
        }

        for (const item of rawArray) {
            const preset = sanitizeCreaturePresetEntry(item);
            if (!preset) {
                console.warn('[CreaturePresets] Entrada inválida ignorada:', item);
                continue;
            }

            presets.push(preset);

            try {
                const cleanCfgPath = preset.configPath.replace(/^\//, '');
                const spriteSheetUrl = cleanCfgPath.replace(/\.json$/i, '.png');
                const { fetchCharacterConfigMerged } = await import(
                    '../character/characterCalibrationLoader'
                );
                const config = await fetchCharacterConfigMerged(spriteSheetUrl);
                if (!config) {
                    console.warn(
                        `[CreaturePresets] Config não encontrada para "${preset.name}": ${preset.configPath}`
                    );
                    continue;
                }
                config.name = preset.name;
                applyVisualSize(config, preset.visualSize);
                configBySpawnName.set(preset.name, config);
            } catch (err) {
                console.warn(`[CreaturePresets] Erro ao ler ${preset.configPath}:`, err);
            }
        }

        console.log(`[CreaturePresets] ${presets.length} criatura(s) na paleta.`);
        invalidateCreatureThumbnailCache();
    } catch (err) {
        console.warn('[CreaturePresets] Falha ao carregar lista:', err);
    }
}

export function getSpawnDisplayColor(spawn: { name: string; type: 'monster' | 'npc' }): string {
    return getCreaturePreset(spawn.name)?.color ?? (spawn.type === 'monster' ? '#fb7185' : '#10b981');
}

