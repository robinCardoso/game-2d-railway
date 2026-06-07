import { parseCharacterConfig } from '../character/characterSerializer';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import {
    sanitizeCreaturePresetEntry,
    type CreaturePresetEntry,
    type CreatureVisualSize,
    type MobLootEntry,
    type MobRace,
} from '../game-data/mobPresetTypes';
import { invalidateCreatureThumbnailCache } from './creaturePresetThumbnail';
import { resolveApiUrl } from '../shared/apiUrl';

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
        const res = await fetch(resolveApiUrl(PRESETS_URL), { cache: 'no-store' });
        if (!res.ok) {
            console.warn('[CreaturePresets] creature_presets.json ausente — nenhuma criatura na paleta.');
            return;
        }

        const raw = await res.json();
        if (!Array.isArray(raw)) {
            console.warn('[CreaturePresets] creature_presets.json deve ser um array JSON.');
            return;
        }

        for (const item of raw) {
            const preset = sanitizeCreaturePresetEntry(item);
            if (!preset) {
                console.warn('[CreaturePresets] Entrada inválida ignorada:', item);
                continue;
            }

            presets.push(preset);

            try {
                const cleanCfgPath = preset.configPath.replace(/^\//, '');
                const cfgRes = await fetch(resolveApiUrl('/' + cleanCfgPath), { cache: 'no-store' });
                if (!cfgRes.ok) {
                    console.warn(
                        `[CreaturePresets] Sprite não encontrado para "${preset.name}": ${preset.configPath}`
                    );
                    continue;
                }
                const config = parseCharacterConfig(await cfgRes.text());
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
