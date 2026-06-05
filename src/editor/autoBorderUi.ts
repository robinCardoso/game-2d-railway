import { isVariantBrush } from '../engine/tileVariants';
import { fetchBorderSets } from './borderSetApi';

export interface BorderSetUiEntry {
    id: string;
    label: string;
    fillTerrain: string;
}

/** Fallback quando a API não retorna conjuntos. */
const FALLBACK_BORDER_SETS: BorderSetUiEntry[] = [];

let borderSets: BorderSetUiEntry[] = [...FALLBACK_BORDER_SETS];

export function getMockBorderSets(): BorderSetUiEntry[] {
    return [...borderSets];
}

export function setBorderSetsForUi(sets: BorderSetUiEntry[]): void {
    borderSets = [...sets];
    populateBorderSetSelect();
}

export async function reloadBorderSetsFromServer(): Promise<void> {
    try {
        const sets = await fetchBorderSets();
        setBorderSetsForUi(
            sets.map((s) => ({
                id: s.id,
                label: s.label,
                fillTerrain: s.fillTerrain,
            }))
        );
    } catch (err) {
        console.warn('[AutoBorderUi] Não foi possível carregar conjuntos:', err);
    }
}

function getEl<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function getSelectedBorderSet(): BorderSetUiEntry | undefined {
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    if (!select?.value) return borderSets[0];
    return borderSets.find((s) => s.id === select.value) ?? borderSets[0];
}

function syncToolbarActiveState(): void {
    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    const toolbar = getEl<HTMLElement>('autoBorderToolbar');
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    const hint = getEl<HTMLElement>('autoBorderPaintHint');
    const enabled = toggle?.checked ?? false;

    if (select) select.disabled = !enabled;
    toolbar?.classList.toggle('is-active', enabled);
    hint?.classList.toggle('is-active', enabled);
    syncTileAutoBorderChip();
}

export function syncTileAutoBorderChip(): void {
    const chip = getEl<HTMLElement>('tileAutoBorderStatusChip');
    if (!chip) return;

    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    const set = getSelectedBorderSet();
    if (toggle?.checked && set) {
        chip.style.display = 'block';
        chip.textContent = `Auto-borda: ${set.label}`;
    } else {
        chip.style.display = 'none';
        chip.textContent = '';
    }
}

export function populateBorderSetSelect(filterFillTerrain?: string): void {
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    if (!select) return;

    const prev = select.value;
    const list = filterFillTerrain
        ? borderSets.filter((s) => s.fillTerrain === filterFillTerrain)
        : borderSets;

    select.innerHTML = '';
    if (list.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— Nenhum conjunto —';
        select.appendChild(opt);
        return;
    }

    for (const entry of list) {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = `${entry.label} (${entry.id})`;
        select.appendChild(opt);
    }

    if (prev && list.some((s) => s.id === prev)) {
        select.value = prev;
    } else {
        select.value = list[0].id;
    }
}

/** Ao selecionar pincel Grama aleatório: liga toggle e escolhe conjunto grass. */
export function notifyAutoBorderGrassBrushSelected(): void {
    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    if (toggle && !toggle.checked) {
        toggle.checked = true;
    }
    populateBorderSetSelect('grass');
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    const grassSet = borderSets.find((s) => s.fillTerrain === 'grass');
    if (select && grassSet) {
        select.value = grassSet.id;
    }
    syncToolbarActiveState();
}

export function isAutoBorderEnabled(): boolean {
    return getEl<HTMLInputElement>('autoBorderEnabledToggle')?.checked ?? false;
}

export function getActiveBorderSet(): BorderSetUiEntry | undefined {
    if (!isAutoBorderEnabled()) return undefined;
    const set = getSelectedBorderSet();
    return set?.id ? set : undefined;
}

export function initAutoBorderUi(options?: { onRecalcFloor?: (floorZ: number) => void }): void {
    const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
    const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
    const recalcBtn = getEl<HTMLButtonElement>('autoBorderRecalcFloorBtn');

    populateBorderSetSelect();
    void reloadBorderSetsFromServer().then(() => {
        if (recalcBtn) {
            recalcBtn.disabled = borderSets.length === 0;
            recalcBtn.title =
                borderSets.length === 0
                    ? 'Salve um conjunto auto-borda em Criar Sprites primeiro'
                    : 'Recalcula bordas em todo o andar de edição';
        }
    });

    toggle?.addEventListener('change', () => {
        syncToolbarActiveState();
    });

    select?.addEventListener('change', () => {
        syncTileAutoBorderChip();
    });

    recalcBtn?.addEventListener('click', () => {
        if (recalcBtn.disabled) return;
        options?.onRecalcFloor?.(0);
    });

    syncToolbarActiveState();
}

/** Chamado quando o tile selecionado muda (main.ts). */
export function onMapEditorTileSelectionChanged(selectedId: number, tileRegistry: Record<number, { variantGroup?: string }>): void {
    if (isVariantBrush(selectedId)) {
        const group = tileRegistry[selectedId]?.variantGroup?.toLowerCase();
        if (group) {
            const matchingSet = borderSets.find((s) => s.fillTerrain.toLowerCase() === group);
            if (matchingSet) {
                const toggle = getEl<HTMLInputElement>('autoBorderEnabledToggle');
                if (toggle && !toggle.checked) {
                    toggle.checked = true;
                }
                populateBorderSetSelect(group);
                const select = getEl<HTMLSelectElement>('autoBorderSetSelect');
                if (select) {
                    select.value = matchingSet.id;
                }
                syncToolbarActiveState();
                return;
            }
        }
    }
    syncTileAutoBorderChip();
}
