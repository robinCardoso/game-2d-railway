import type { SpellCatalogDocument } from '../src/game-data/spellCatalogTypes.js';
import { defaultSpellBarForVocation, parseSpellBar, type SpellBarState } from './spellBar.js';

export type { SpellBarState };

export function validateCharacterSpellBar(
    raw: unknown,
    catalog: SpellCatalogDocument,
    context: { vocationId: string; level: number; learnedSpellIds?: readonly string[] }
): { ok: true; value: SpellBarState } | { ok: false; errors: string[] } {
    const bar = parseSpellBar(raw);
    const errors: string[] = [];
    const spellById = new Map(catalog.spells.map((s) => [s.id, s]));
    const vocation = context.vocationId.toLowerCase();

    for (const [slotLabel, spellId] of [
        ['slot1', bar.slot1],
        ['slot2', bar.slot2],
        ['slot3', bar.slot3],
    ] as const) {
        if (!spellId) continue;
        const spell = spellById.get(spellId);
        if (!spell) {
            errors.push(`${slotLabel}: magia desconhecida "${spellId}".`);
            continue;
        }
        if (!spell.implemented) {
            errors.push(`${slotLabel}: magia "${spellId}" não implementada.`);
        }
        if (spell.vocations.length > 0 && !spell.vocations.includes(vocation)) {
            errors.push(`${slotLabel}: magia "${spellId}" não permitida para vocação ${vocation}.`);
        }
        if (context.level < spell.minLevel) {
            errors.push(
                `${slotLabel}: magia "${spellId}" exige level ${spell.minLevel} (atual ${context.level}).`
            );
        }
        if (
            context.learnedSpellIds &&
            context.learnedSpellIds.length > 0 &&
            !context.learnedSpellIds.includes(spellId)
        ) {
            errors.push(`${slotLabel}: magia "${spellId}" não aprendida.`);
        }
    }

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: bar };
}

/** Estado vazio no DB → defaults por vocação (primeiro login). */
export function resolveSpellBarOrDefaults(
    bar: SpellBarState,
    vocationId: string | undefined
): SpellBarState {
    if (bar.slot1 || bar.slot2 || bar.slot3) return bar;
    return defaultSpellBarForVocation(vocationId);
}
