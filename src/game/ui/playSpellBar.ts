import { getSpellById } from '../../game-data/spellCatalog';
import type { SpellDefinition } from '../../game-data/spellCatalogTypes';
import {
    defaultSpellBarForVocation,
    type SpellBarState,
} from '../../../shared/spellBar';
import {
    fetchCharacterSpellSlots,
    saveCharacterSpellSlots,
} from '../characterSpellSlotsApi';

export type SpellBarSlot = 1 | 2 | 3;

export type { SpellBarState };

let onSpellBarChanged: (() => void) | null = null;

export function setPlaySpellBarSyncHandler(handler: (() => void) | null): void {
    onSpellBarChanged = handler;
}

function notifySpellBarChanged(): void {
    onSpellBarChanged?.();
}

let characterId: string | null = null;
let barState: SpellBarState = defaultSpellBarForVocation('knight');

function applyBarState(next: SpellBarState): void {
    barState = { ...next };
    notifySpellBarChanged();
}

export function initPlaySpellBar(activeCharacterId: string, vocation?: string): void {
    characterId = activeCharacterId;
    barState = defaultSpellBarForVocation(vocation);
    notifySpellBarChanged();
}

/** Carrega slots autoritativos do PostgreSQL (fallback: defaults por vocação). */
export async function loadPlaySpellBarFromServer(
    activeCharacterId: string,
    vocation?: string
): Promise<void> {
    characterId = activeCharacterId;
    try {
        const spellBar = await fetchCharacterSpellSlots(activeCharacterId);
        applyBarState(spellBar);
    } catch (err) {
        console.warn('[playSpellBar] falha ao carregar do servidor, usando defaults:', err);
        applyBarState(defaultSpellBarForVocation(vocation));
    }
}

export function getPlaySpellBarState(): Readonly<SpellBarState> {
    return barState;
}

export function getSpellIdForSlot(slot: SpellBarSlot): string | undefined {
    if (slot === 1) return barState.slot1;
    if (slot === 2) return barState.slot2;
    return barState.slot3;
}

export function getSpellForSlot(slot: SpellBarSlot): SpellDefinition | undefined {
    const id = getSpellIdForSlot(slot);
    if (!id) return undefined;
    return getSpellById(id);
}

export async function equipSpellToSlot(spellId: string, slot: SpellBarSlot): Promise<void> {
    const next: SpellBarState = { ...barState };
    if (slot === 1) next.slot1 = spellId;
    else if (slot === 2) next.slot2 = spellId;
    else next.slot3 = spellId;

    if (!characterId) {
        applyBarState(next);
        return;
    }

    try {
        const saved = await saveCharacterSpellSlots(characterId, next);
        applyBarState(saved);
    } catch (err) {
        console.error('[playSpellBar] falha ao salvar slot:', err);
        throw err;
    }
}
