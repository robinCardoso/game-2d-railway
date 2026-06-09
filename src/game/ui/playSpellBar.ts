import { getSpellById } from '../../game-data/spellCatalog';
import type { SpellDefinition } from '../../game-data/spellCatalogTypes';

export type SpellBarSlot = 1 | 2 | 3;

export interface SpellBarState {
    slot1?: string;
    slot2?: string;
    slot3?: string;
}

const DEFAULT_BAR_MAGE: SpellBarState = {
    slot1: 'mock_energy_strike',
    slot2: 'mock_fire_bolt',
    slot3: 'mock_void_touch',
};

const DEFAULT_BAR_KNIGHT: SpellBarState = {
    slot1: 'knight_brutal_strike',
    slot2: 'knight_ground_slam',
    slot3: 'knight_front_sweep',
};

function defaultBarForVocation(vocation: string | undefined): SpellBarState {
    if ((vocation || 'knight').toLowerCase() === 'knight') {
        return { ...DEFAULT_BAR_KNIGHT };
    }
    return { ...DEFAULT_BAR_MAGE };
}

let characterId: string | null = null;
let barState: SpellBarState = { ...DEFAULT_BAR_KNIGHT };

function storageKey(id: string): string {
    return `play.spellBar.${id}`;
}

function readBar(id: string, vocation?: string): SpellBarState {
    const defaults = defaultBarForVocation(vocation);
    try {
        const raw = localStorage.getItem(storageKey(id));
        if (!raw) return defaults;
        const parsed = JSON.parse(raw) as SpellBarState;
        return {
            slot1: typeof parsed.slot1 === 'string' ? parsed.slot1 : defaults.slot1,
            slot2: typeof parsed.slot2 === 'string' ? parsed.slot2 : defaults.slot2,
            slot3: typeof parsed.slot3 === 'string' ? parsed.slot3 : defaults.slot3,
        };
    } catch {
        return defaults;
    }
}

function saveBar(): void {
    if (!characterId) return;
    try {
        localStorage.setItem(storageKey(characterId), JSON.stringify(barState));
    } catch {
        /* ignore */
    }
}

export function initPlaySpellBar(activeCharacterId: string, vocation?: string): void {
    characterId = activeCharacterId;
    barState = readBar(activeCharacterId, vocation);
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

export function equipSpellToSlot(spellId: string, slot: SpellBarSlot): void {
    if (slot === 1) barState.slot1 = spellId;
    else if (slot === 2) barState.slot2 = spellId;
    else barState.slot3 = spellId;
    saveBar();
}
