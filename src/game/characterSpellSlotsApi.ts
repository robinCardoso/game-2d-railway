import { apiFetch } from '../shared/apiFetch';
import type { SpellBarState } from '../../shared/spellBar';

export async function fetchCharacterSpellSlots(characterId: string): Promise<SpellBarState> {
    const res = await apiFetch(
        `/api/characters/${encodeURIComponent(characterId)}/spell-slots`
    );
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Falha ao carregar magias (${res.status}).`);
    }
    const data = (await res.json()) as { spellBar: SpellBarState };
    return data.spellBar;
}

export async function saveCharacterSpellSlots(
    characterId: string,
    spellBar: SpellBarState
): Promise<SpellBarState> {
    const res = await apiFetch(
        `/api/characters/${encodeURIComponent(characterId)}/spell-slots`,
        {
            method: 'PUT',
            body: JSON.stringify(spellBar),
        }
    );
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            details?: string[];
        };
        const detail = body.details?.length ? `: ${body.details.join('; ')}` : '';
        throw new Error((body.error ?? `Falha ao salvar magias (${res.status}).`) + detail);
    }
    const data = (await res.json()) as { spellBar: SpellBarState };
    return data.spellBar;
}
