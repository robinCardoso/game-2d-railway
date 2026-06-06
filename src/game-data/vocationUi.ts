import type { VocationConfig } from '../engine/character/calculateStats';

export const VOCATIONS_UPDATED_EVENT = 'game:vocations-updated';

/** Vocações base do jogo — não podem ser excluídas no editor. */
export const DEFAULT_VOCATION_IDS = ['knight', 'mage', 'archer'] as const;

export type VocationsMap = Record<string, VocationConfig>;

export function isDefaultVocationId(id: string): boolean {
    return (DEFAULT_VOCATION_IDS as readonly string[]).includes(id);
}

export function dispatchVocationsUpdated(vocations: VocationsMap): void {
    window.dispatchEvent(
        new CustomEvent(VOCATIONS_UPDATED_EVENT, { detail: { vocations } })
    );
}

export function fillVocationSelect(
    select: HTMLSelectElement,
    vocations: VocationsMap,
    options?: { includeKeyInLabel?: boolean; fallbackValue?: string }
): void {
    const current = select.value;
    select.innerHTML = '';
    const entries = Object.entries(vocations).sort((a, b) =>
        a[1].name.localeCompare(b[1].name, 'pt')
    );
    for (const [key, config] of entries) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = options?.includeKeyInLabel
            ? `${config.name} (${key.toUpperCase()})`
            : config.name;
        select.appendChild(opt);
    }
    const fallback = options?.fallbackValue ?? 'knight';
    if (current && select.querySelector(`option[value="${CSS.escape(current)}"]`)) {
        select.value = current;
    } else if (select.querySelector(`option[value="${CSS.escape(fallback)}"]`)) {
        select.value = fallback;
    } else if (select.options.length > 0) {
        select.value = select.options[0].value;
    }
}
