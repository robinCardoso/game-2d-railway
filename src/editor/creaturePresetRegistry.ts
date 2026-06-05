import { apiFetch } from '../shared/apiFetch';
import type { CreatureVisualSize } from './creaturePresets';

export interface CreaturePresetUpsert {
    name: string;
    type: 'npc' | 'monster';
    configPath: string;
    description?: string;
    color?: string;
    visualSize?: CreatureVisualSize;
}

export async function upsertCreaturePreset(entry: CreaturePresetUpsert): Promise<void> {
    const response = await apiFetch('/api/upsert-creature-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Falha ao registrar criatura no catálogo.');
    }
}

export function buildConfigPathFromSave(category: string, name: string): string {
    const filename = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const base = 'tiles/characters';
    const sub = (category || '').trim().replace(/^\/+|\/+$/g, '');
    return sub ? `${base}/${sub}/${filename}.json` : `${base}/${filename}.json`;
}
