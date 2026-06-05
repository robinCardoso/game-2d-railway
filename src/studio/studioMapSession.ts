/**
 * Sessão do GM Studio: último mapa editado e descoberta de JSON em public/maps/.
 */

import { apiFetch } from '../shared/apiFetch';
import {
    BUILTIN_MAP_IDS,
    MAP_REGISTRY,
    registerMap,
} from '../engine/mapRegistry';

const STUDIO_LAST_MAP_KEY = 'game2d_studio_last_map_id_v1';

export function readStudioLastMapId(): string | null {
    try {
        const raw = localStorage.getItem(STUDIO_LAST_MAP_KEY);
        if (!raw) return null;
        const id = raw.trim();
        return id.length > 0 ? id : null;
    } catch {
        return null;
    }
}

export function writeStudioLastMapId(mapId: string): void {
    try {
        localStorage.setItem(STUDIO_LAST_MAP_KEY, mapId);
    } catch (err) {
        console.warn('[Studio] Não foi possível gravar último mapa:', err);
    }
}

/** Registra no MAP_REGISTRY arquivos .json em public/maps/ que ainda não têm entrada. */
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
                description: 'Descoberto em public/maps/ (dev)',
            });
        }
    } catch (err) {
        console.warn('[Studio] Falha ao listar mapas em public/maps:', err);
    }
}

/** ID do mapa a carregar ao abrir o studio (último salvo ou JSON mais recente em disco). */
export async function resolveStudioMapIdToLoad(): Promise<string | null> {
    await hydrateRegistryFromPublicMapFiles();

    const explicit = readStudioLastMapId();
    if (explicit && MAP_REGISTRY.some((m) => m.id === explicit)) {
        return explicit;
    }

    try {
        const response = await apiFetch('/api/list-maps');
        if (!response.ok) return null;
        const payload = (await response.json()) as { latest?: string | null };
        const latest = payload.latest;
        if (!latest) return null;
        const id = latest.replace(/\.json$/i, '').toLowerCase();
        if (MAP_REGISTRY.some((m) => m.id === id)) return id;
    } catch {
        // ignore
    }
    return null;
}
