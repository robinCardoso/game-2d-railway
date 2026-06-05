import { parseCharacterConfig } from '../character/characterSerializer';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import { invalidateCreatureThumbnailCache } from './creaturePresetThumbnail';

/** Tamanho visual no tile; movimento permanece no grid 32×32. */
export type CreatureVisualSize = 'tiny' | 'small' | 'medium' | 'large' | 'boss';

export interface CreaturePreset {
    name: string;
    type: 'monster' | 'npc';
    /** JSON de sprite (CharacterSpriteConfig), relativo à raiz public/. */
    configPath: string;
    description?: string;
    color?: string;
    visualSize?: CreatureVisualSize;
}

const PRESETS_URL = '/creature_presets.json';
const VALID_VISUAL_SIZES = new Set<CreatureVisualSize>([
    'tiny', 'small', 'medium', 'large', 'boss',
]);

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

function parseVisualSize(value: unknown): CreatureVisualSize | undefined {
    if (typeof value === 'string' && VALID_VISUAL_SIZES.has(value as CreatureVisualSize)) {
        return value as CreatureVisualSize;
    }
    return undefined;
}

function sanitizePreset(raw: unknown): CreaturePreset | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()) return null;
    if (row.type !== 'monster' && row.type !== 'npc') return null;

    let configPath = '';
    if (typeof row.configPath === 'string' && row.configPath.trim()) {
        configPath = row.configPath.trim().replace(/^\//, '');
    } else if (typeof row.outfitPresetName === 'string' && row.outfitPresetName.trim()) {
        configPath = `tiles/characters/${row.outfitPresetName.trim()}.json`;
    }
    if (!configPath) return null;

    return {
        name: row.name.trim(),
        type: row.type,
        configPath,
        description: typeof row.description === 'string' ? row.description : '',
        color: typeof row.color === 'string' ? row.color : undefined,
        visualSize: parseVisualSize(row.visualSize),
    };
}

/**
 * Aplica tamanho visual no tile via `drawScale`.
 * `frameWidth` / `frameHeight` do JSON permanecem = célula real da spritesheet (ex. 64×64).
 */
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
        const res = await fetch(PRESETS_URL, { cache: 'no-store' });
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
            const preset = sanitizePreset(item);
            if (!preset) {
                console.warn('[CreaturePresets] Entrada inválida ignorada:', item);
                continue;
            }

            presets.push(preset);

            try {
                const cfgRes = await fetch(`/${preset.configPath}`, { cache: 'no-store' });
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
