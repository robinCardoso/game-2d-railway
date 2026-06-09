/** Slots F1–F3 — sincronizados com o servidor para validar cast_spell. */

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

/** Barra inicial quando o personagem ainda não tem linhas no PostgreSQL. */
export function defaultSpellBarForVocation(vocationId: string | undefined): SpellBarState {
    if ((vocationId || 'knight').toLowerCase() === 'knight') {
        return { ...DEFAULT_BAR_KNIGHT };
    }
    return { ...DEFAULT_BAR_MAGE };
}

export function parseSpellBar(raw: unknown): SpellBarState {
    if (!raw || typeof raw !== 'object') return {};
    const o = raw as Record<string, unknown>;
    const pick = (key: string): string | undefined => {
        if (typeof o[key] !== 'string') return undefined;
        const id = o[key].trim().slice(0, 64);
        return id.length > 0 ? id : undefined;
    };
    return {
        slot1: pick('slot1'),
        slot2: pick('slot2'),
        slot3: pick('slot3'),
    };
}

export function listEquippedSpellIds(bar: SpellBarState): string[] {
    const out: string[] = [];
    for (const id of [bar.slot1, bar.slot2, bar.slot3]) {
        if (id && !out.includes(id)) out.push(id);
    }
    return out;
}

export function isSpellEquipped(spellId: string, bar: SpellBarState): boolean {
    return listEquippedSpellIds(bar).includes(spellId);
}
