/**
 * Descobre mapas em `public/maps/` e registra entradas custom no MAP_REGISTRY.
 * Usado pelo Studio e pelo Play (mesma fonte de verdade).
 */

import { apiFetch } from '../shared/apiFetch';
import { BUILTIN_MAP_IDS, MAP_REGISTRY, registerMap } from './mapRegistry';

export async function hydrateRegistryFromPublicMapFiles(): Promise<void> {
    try {
        const response = await apiFetch('/api/list-maps');
        if (!response.ok) return;
        const payload = (await response.json()) as { files?: string[] };
        const files = payload.files ?? [];

        for (const file of files) {
            const base = file.replace(/^.*[/\\]/, '').toLowerCase();
            if (!base.endsWith('.json')) continue;
            const id = base.slice(0, -5);
            if (!id || !/^[a-z0-9_-]+$/.test(id)) continue;
            if (BUILTIN_MAP_IDS.has(id)) continue;
            if (MAP_REGISTRY.some((m) => m.id === id)) continue;

            registerMap({
                id,
                name: id.replace(/_/g, ' '),
                file: `maps/${base}`,
                size: 256,
                instanced: false,
                description: 'Descoberto em public/maps/',
            });
        }
    } catch (err) {
        console.warn('[MapDiscovery] Falha ao listar mapas:', err);
    }
}
