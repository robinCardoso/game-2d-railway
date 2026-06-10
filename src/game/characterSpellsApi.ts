import { apiFetch } from '../shared/apiFetch';

export async function fetchCharacterLearnedSpells(characterId: string): Promise<string[]> {
    const res = await apiFetch(`/api/characters/${encodeURIComponent(characterId)}/spells`);
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Falha ao carregar magias aprendidas (${res.status}).`);
    }
    const data = (await res.json()) as { learnedSpells: string[] };
    return Array.isArray(data.learnedSpells) ? data.learnedSpells : [];
}
