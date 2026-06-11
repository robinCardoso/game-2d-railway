/**
 * Descobre mapas em `public/maps/` e registra entradas custom no MAP_REGISTRY.
 * Usado pelo Studio e pelo Play (mesma fonte de verdade).
 */

import { assetLoader } from '../game-data/assetLoader';
import { apiFetch } from '../shared/apiFetch';
import { BUILTIN_MAP_IDS, MAP_REGISTRY, registerMap } from './mapRegistry';

function registerDiscoveredMap(base: string): void {
    const id = base.slice(0, -5);
    if (!id || !/^[a-z0-9_-]+$/.test(id)) return;
    if (BUILTIN_MAP_IDS.has(id)) return;
    if (MAP_REGISTRY.some((m) => m.id === id)) return;

    registerMap({
        id,
        name: id.replace(/_/g, ' '),
        file: `maps/${base}`,
        size: 256,
        instanced: false,
        description: 'Descoberto em public/maps/',
    });
}

export async function hydrateRegistryFromPublicMapFiles(): Promise<void> {
    await assetLoader.initialize();

    if (assetLoader.isPackaged()) {
        for (const file of assetLoader.listFiles('maps/', '.json')) {
            const base = file.replace(/^.*\//, '').toLowerCase();
            registerDiscoveredMap(base);
        }
        return;
    }

    try {
        const response = await apiFetch('/api/list-maps');
        if (!response.ok) return;
        const payload = (await response.json()) as { files?: string[] };
        const files = payload.files ?? [];

        for (const file of files) {
            const base = file.replace(/^.*[/\\]/, '').toLowerCase();
            if (!base.endsWith('.json')) continue;
            registerDiscoveredMap(base);
        }
    } catch (err) {
        console.warn('[MapDiscovery] Falha ao listar mapas:', err);
    }
}
