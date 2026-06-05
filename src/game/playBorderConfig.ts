import { fetchBorderSets } from '../editor/borderSetApi';

export interface PlayBorderConfig {
    borderSetId: string;
    fillTerrain: string;
}

const DEFAULT_PLAY_BORDER_CONFIG: PlayBorderConfig = {
    borderSetId: 'terra_edges',
    fillTerrain: '02-grass-random',
};

let activePlayBorderConfig: PlayBorderConfig = { ...DEFAULT_PLAY_BORDER_CONFIG };

export function getPlayBorderConfig(): PlayBorderConfig {
    return activePlayBorderConfig;
}

/** Carrega conjunto auto-borda do manifest (mesma API do Studio). */
export async function loadPlayBorderConfig(): Promise<PlayBorderConfig> {
    try {
        const sets = await fetchBorderSets();
        const preferred = sets.find((s) => s.id === 'terra_edges') ?? sets[0];
        if (preferred?.id) {
            activePlayBorderConfig = {
                borderSetId: preferred.id,
                fillTerrain: preferred.fillTerrain || DEFAULT_PLAY_BORDER_CONFIG.fillTerrain,
            };
            return activePlayBorderConfig;
        }
    } catch (err) {
        console.warn('[playApp] Conjuntos auto-borda indisponíveis, usando fallback:', err);
    }

    activePlayBorderConfig = { ...DEFAULT_PLAY_BORDER_CONFIG };
    return activePlayBorderConfig;
}
