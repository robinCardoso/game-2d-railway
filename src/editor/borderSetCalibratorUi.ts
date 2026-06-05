/**
 * Máscaras auto-borda: cardinais 1–15 (bits N/E/S/O) + diagonais 16/32/64/128.
 */
import {
    inferBorderSlotGrid,
    normalizeBorderCellsToNeighbor3x3,
} from './borderSetExport';
import { getRequiredMaskForPreviewCell } from './borderSetPreview';
import {
    BORDER_MASK_GRASS_HINTS,
    BORDER_MASK_GRASS_LABELS,
    CARDINAL_4_SLOTS,
    getCardinal4SlotMeta,
    getExpectedMaskForSlot,
    getInnerCorner4SlotMeta,
    getNeighbor3x3SlotMeta,
    INNER_CORNER_4_SLOTS,
    previewCellForSlotCoords,
    slotCoordsForPreviewCell,
    type BorderSlotLayoutMode,
} from './borderNeighborSlots';
import { BORDER_INNER_CORNER_MASKS } from '../engine/borderMaskBits';
import {
    BORDER_MASK_NE,
    BORDER_MASK_NW,
    BORDER_MASK_SE,
    BORDER_MASK_SW,
} from '../engine/borderMaskBits';

export const BORDER_MASK_LABELS: Record<number, string> = {
    0: '0 — Sem borda (interior)',
    1: '1 — Grama ↑ Norte',
    2: '2 — Grama → Leste',
    3: '3 — Grama ↑→ Norte+Leste',
    4: '4 — Grama ↓ Sul',
    5: '5 — Grama ↑↓ Norte+Sul',
    6: '6 — Grama ↓→ Sul+Leste',
    7: '7 — Grama ↑↓→ Norte+Sul+Leste',
    8: '8 — Grama ← Oeste',
    9: '9 — Grama ↑← Norte+Oeste',
    10: '10 — Grama →← Leste+Oeste',
    11: '11 — Grama ↑→← Norte+Leste+Oeste',
    12: '12 — Grama ↓← Sul+Oeste',
    13: '13 — Grama ↑↓← Norte+Sul+Oeste',
    14: '14 — Grama ↓→← Sul+Leste+Oeste',
    15: '15 — Grama nos 4 lados (ilha)',
    16: '16 — Grama ↗ diagonal NE (só canto)',
    32: '32 — Grama ↘ diagonal SE (só canto)',
    64: '64 — Grama ↙ diagonal SO (só canto)',
    128: '128 — Grama ↖ diagonal NO (só canto)',
};

/** Texto curto ao selecionar máscara (legenda dinâmica). */
export const BORDER_MASK_HINTS: Record<number, string> = {
    0: 'Tile sem filete — interior da grama ou slot não usado.',
    1: 'Grama em cima do chão → filete na borda superior do tile.',
    2: 'Grama à direita → filete na borda direita.',
    3: 'Grama em cima e à direita → canto superior direito.',
    4: 'Grama embaixo do chão → filete na borda inferior (parte de baixo).',
    5: 'Grama em cima e embaixo → filetes superior e inferior.',
    6: 'Grama embaixo e à direita → canto inferior direito.',
    7: 'Grama em cima, embaixo e à direita → três lados (falta oeste).',
    8: 'Grama à esquerda → filete na borda esquerda.',
    9: 'Grama em cima e à esquerda → canto superior esquerdo.',
    10: 'Grama à esquerda e direita → filetes laterais (corredor E–O).',
    11: 'Grama em cima, esquerda e direita → três lados (falta sul).',
    12: 'Grama embaixo e à esquerda → canto inferior esquerdo.',
    13: 'Grama em cima, embaixo e à esquerda → três lados (falta leste).',
    14: 'Grama embaixo, esquerda e direita → três lados (falta norte).',
    15: 'Grama em todos os lados — chão cercado (bolsão).',
    16: 'Só grama na diagonal NE — canto do filete (pedra diagonal ao NW da grama).',
    32: 'Só grama na diagonal SE — canto (pedra diagonal ao SW da grama).',
    64: 'Só grama na diagonal SO — canto (pedra diagonal ao NE da grama).',
    128: 'Só grama na diagonal NO — canto (pedra diagonal ao SE da grama).',
};

export interface BorderSetCellAssignment {
    col: number;
    row: number;
    mask: number;
    /** Coluna do tile na spritesheet (padrão = col). */
    sourceCol: number;
    /** Linha do tile na spritesheet (padrão = row). */
    sourceRow: number;
}

const MASK_SELECT_VALUES = [
    ...Array.from({ length: 16 }, (_, mask) => mask),
    BORDER_MASK_NE,
    BORDER_MASK_SE,
    BORDER_MASK_SW,
    BORDER_MASK_NW,
];

function maskSelectOptions(selected: number): string {
    return MASK_SELECT_VALUES.map((mask) => {
        const label = BORDER_MASK_GRASS_LABELS[mask] ?? BORDER_MASK_LABELS[mask] ?? String(mask);
        return `<option value="${mask}"${mask === selected ? ' selected' : ''}>${label}</option>`;
    }).join('');
}

const NEIGHBOR_3X3_MASKS = [1, 2, 4, 8, 16, 32, 64, 128] as const;

function detectSlotLayoutMode(cols: number, rows: number, assignments: Map<string, number>): BorderSlotLayoutMode {
    if (cols === 3 && rows === 3) {
        const present = new Set(
            [...assignments.values()].filter((m) => m > 0)
        );
        if (NEIGHBOR_3X3_MASKS.every((m) => present.has(m))) {
            return 'neighbor3x3';
        }
        let matches = true;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const expected = getNeighbor3x3SlotMeta(col, row)?.mask ?? 0;
                if ((assignments.get(`${col},${row}`) ?? 0) !== expected) {
                    matches = false;
                    break;
                }
            }
            if (!matches) break;
        }
        if (matches) return 'neighbor3x3';
    }
    if (cols === 4 && rows === 1) {
        let matches = true;
        for (let col = 0; col < 4; col++) {
            const expected = getCardinal4SlotMeta(col)?.mask ?? 0;
            if ((assignments.get(`${col},0`) ?? 0) !== expected) {
                matches = false;
                break;
            }
        }
        if (matches) return 'cardinal4';
    }
    return 'free';
}

function formatSlotLabel(col: number, row: number, mode: BorderSlotLayoutMode): string {
    if (mode === 'neighbor3x3') {
        const meta = getNeighbor3x3SlotMeta(col, row);
        if (meta) return `${meta.grassSideLabel} · M${meta.mask}`;
    }
    if (mode === 'cardinal4' && row === 0) {
        const meta = getCardinal4SlotMeta(col);
        if (meta) return `${meta.grassSideLabel} · M${meta.mask}`;
    }
    if (mode === 'innerCorner4' && row === 0) {
        const meta = getInnerCorner4SlotMeta(col);
        if (meta) return `${meta.grassSideLabel} · M${meta.mask}`;
    }
    return `Slot Col ${col + 1} · Lin ${row + 1}`;
}

function innerCornerLabelForMask(mask: number): string | null {
    const meta = INNER_CORNER_4_SLOTS.find((s) => s.mask === mask);
    return meta ? `${meta.grassSideLabel} · M${meta.mask}` : null;
}

export function createBorderSetCalibratorUi(options: {
    listEl: HTMLElement;
    badgeEl: HTMLElement | null;
    pickHintEl?: HTMLElement | null;
    maskHintEl?: HTMLElement | null;
    fillTerrain?: string;
    onChange?: () => void;
    onActiveCellChange?: (col: number, row: number) => void;
}) {
    const assignments = new Map<string, number>();
    const sourceTiles = new Map<string, { col: number; row: number }>();
    let activeCol = -1;
    let activeRow = -1;
    let slotLayoutMode: BorderSlotLayoutMode = 'free';
    let slotGridCols = 1;
    let slotGridRows = 1;

    function hasActiveSlot(): boolean {
        return activeCol >= 0 && activeRow >= 0;
    }

    function clearActiveSlot(): void {
        activeCol = -1;
        activeRow = -1;
        options.listEl.querySelectorAll('.cal-border-cell-row').forEach((el) => {
            el.classList.remove('is-active');
        });
        updatePickHint();
        if (options.maskHintEl) options.maskHintEl.textContent = '';
    }

    function key(col: number, row: number): string {
        return `${col},${row}`;
    }

    function getSource(col: number, row: number): { col: number; row: number } {
        return sourceTiles.get(key(col, row)) ?? { col, row };
    }

    function setBadge(fill: string): void {
        if (options.badgeEl) {
            options.badgeEl.textContent = `${fill} → chão`;
        }
    }

    function updatePickHint(): void {
        if (!options.pickHintEl) return;
        if (!hasActiveSlot()) {
            options.pickHintEl.textContent =
                'Selecione um slot à direita, depois clique no tile na imagem à esquerda.';
            return;
        }
        options.pickHintEl.textContent =
            `Slot Col ${activeCol + 1} · Lin ${activeRow + 1} — clique no tile na imagem à esquerda para indicar qual célula da sheet usa esta borda.`;
        if (slotLayoutMode !== 'free') {
            const meta =
                slotLayoutMode === 'neighbor3x3'
                    ? getNeighbor3x3SlotMeta(activeCol, activeRow)
                    : getCardinal4SlotMeta(activeCol);
            if (meta && meta.mask > 0) {
                options.pickHintEl.textContent = `${meta.grassSideLabel} (M${meta.mask}): ${meta.fileteHint}. Clique o tile na sheet.`;
            }
        }
    }

    function updateMaskHint(mask: number): void {
        if (!options.maskHintEl) return;
        const grassHint = BORDER_MASK_GRASS_HINTS[mask];
        options.maskHintEl.textContent = grassHint ?? BORDER_MASK_HINTS[mask] ?? '';
    }

    function isMaskLocked(col: number, row: number): boolean {
        if (slotLayoutMode === 'free') return false;
        return getExpectedMaskForSlot(slotLayoutMode, col, row) !== null;
    }

    function applyGuidedMaskClasses(rowEl: HTMLElement, col: number, row: number, mask: number): void {
        rowEl.classList.remove('is-mask-mismatch');
        if (slotLayoutMode === 'free') return;
        const expected = getExpectedMaskForSlot(slotLayoutMode, col, row);
        if (expected === null) return;
        if (expected !== mask) {
            rowEl.classList.add('is-mask-mismatch');
        }
    }

    function setActiveCell(col: number, row: number, scrollIntoView = false): void {
        activeCol = col;
        activeRow = row;
        options.listEl.querySelectorAll('.cal-border-cell-row').forEach((el) => {
            const rowEl = el as HTMLElement;
            const isActive =
                parseInt(rowEl.dataset.col ?? '-1', 10) === col &&
                parseInt(rowEl.dataset.row ?? '-1', 10) === row;
            rowEl.classList.toggle('is-active', isActive);
            if (isActive && scrollIntoView) {
                rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
        updatePickHint();
        if (hasActiveSlot()) {
            updateMaskHint(assignments.get(key(activeCol, activeRow)) ?? 0);
        }
        options.onActiveCellChange?.(col, row);
    }

    function formatSourceLabel(logicalCol: number, logicalRow: number): string {
        const src = getSource(logicalCol, logicalRow);
        if (src.col === logicalCol && src.row === logicalRow) {
            return `Tile sheet: Col ${src.col + 1} · Lin ${src.row + 1}`;
        }
        return `Tile sheet: Col ${src.col + 1} · Lin ${src.row + 1} (remapeado)`;
    }

    function rebuildCellList(cols: number, rows: number): void {
        slotGridCols = cols;
        slotGridRows = rows;
        if (hasActiveSlot()) {
            activeCol = Math.min(activeCol, Math.max(0, cols - 1));
            activeRow = Math.min(activeRow, Math.max(0, rows - 1));
        }
        options.listEl.innerHTML = '';
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const k = key(col, row);
                if (!assignments.has(k)) {
                    assignments.set(k, 0);
                }
                if (!sourceTiles.has(k)) {
                    sourceTiles.set(k, { col, row });
                }
                const mask = assignments.get(k) ?? 0;
                const expectedMask = getExpectedMaskForSlot(slotLayoutMode, col, row);
                const locked = isMaskLocked(col, row);
                const isCenter = expectedMask === 0 && slotLayoutMode === 'neighbor3x3';
                const rowEl = document.createElement('div');
                rowEl.className = `cal-border-cell-row${mask === 0 && cols * rows > 1 && !isCenter ? ' is-unassigned' : ''}${isCenter ? ' is-center-slot' : ''}`;
                rowEl.dataset.col = String(col);
                rowEl.dataset.row = String(row);
                if (hasActiveSlot() && col === activeCol && row === activeRow) {
                    rowEl.classList.add('is-active');
                }
                applyGuidedMaskClasses(rowEl, col, row, mask);
                const slotLabel =
                    innerCornerLabelForMask(mask) ?? formatSlotLabel(col, row, slotLayoutMode);
                const selectHtml = locked
                    ? `<span class="cal-border-mask-locked" title="Máscara fixa neste preset">M${expectedMask ?? 0}</span>`
                    : `<select aria-label="Máscara slot coluna ${col + 1}, linha ${row + 1}">${maskSelectOptions(mask)}</select>`;
                rowEl.innerHTML = `
                    <div class="cal-border-cell-main">
                        <span class="cal-border-cell-label" title="Slot lógico coluna ${col + 1}, linha ${row + 1}">${slotLabel}</span>
                        <span class="cal-border-cell-source">${isCenter ? 'Centro da grama — não exporta borda' : formatSourceLabel(col, row)}</span>
                    </div>
                    ${selectHtml}
                `;
                if (!isCenter) {
                    rowEl.addEventListener('click', (e) => {
                        if ((e.target as HTMLElement).closest('select')) return;
                        setActiveCell(col, row, false);
                        options.onChange?.();
                    });
                }
                const select = rowEl.querySelector('select') as HTMLSelectElement | null;
                if (select) {
                    select.addEventListener('change', () => {
                        const value = parseInt(select.value, 10);
                        assignments.set(k, Number.isFinite(value) ? value : 0);
                        rowEl.classList.toggle('is-unassigned', value === 0 && cols * rows > 1);
                        applyGuidedMaskClasses(rowEl, col, row, value);
                        if (col === activeCol && row === activeRow) {
                            updateMaskHint(value);
                        }
                        options.onChange?.();
                    });
                    select.addEventListener('click', (e) => e.stopPropagation());
                }
                options.listEl.appendChild(rowEl);
            }
        }
        if (hasActiveSlot()) {
            updateMaskHint(assignments.get(key(activeCol, activeRow)) ?? 0);
        } else {
            updatePickHint();
        }
    }

    function refreshSourceLabels(): void {
        options.listEl.querySelectorAll('.cal-border-cell-row').forEach((el) => {
            const rowEl = el as HTMLElement;
            const col = parseInt(rowEl.dataset.col ?? '0', 10);
            const row = parseInt(rowEl.dataset.row ?? '0', 10);
            const sourceEl = rowEl.querySelector('.cal-border-cell-source');
            if (sourceEl) {
                sourceEl.textContent = formatSourceLabel(col, row);
            }
        });
    }

    /** Grade 3×3 alinhada aos 8 vizinhos da grama no mapa (centro = slot vazio). */
    function applyFullNeighborPreset(): void {
        assignments.clear();
        sourceTiles.clear();
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const meta = getNeighbor3x3SlotMeta(col, row)!;
                assignments.set(key(col, row), meta.mask);
                sourceTiles.set(key(col, row), { col, row });
            }
        }
        slotLayoutMode = 'neighbor3x3';
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(3, 3);
        options.onChange?.();
    }

    /** @deprecated Preset numérico 0…N — preferir applyFullNeighborPreset ou applyCardinalPreset. */
    function applyPreset(cols: number, rows: number): void {
        assignments.clear();
        sourceTiles.clear();
        let index = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                assignments.set(key(col, row), index < 16 ? index : 0);
                sourceTiles.set(key(col, row), { col, row });
                index++;
            }
        }
        activeCol = -1;
        activeRow = -1;
        slotLayoutMode = 'free';
        rebuildCellList(cols, rows);
        options.onChange?.();
    }
    function applyCardinalPreset(): void {
        assignments.clear();
        sourceTiles.clear();
        CARDINAL_4_SLOTS.forEach((meta, col) => {
            assignments.set(key(col, 0), meta.mask);
            sourceTiles.set(key(col, 0), { col, row: 0 });
        });
        slotLayoutMode = 'cardinal4';
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(4, 1);
        options.onChange?.();
    }

    /** Só os 4 cantos internos (L) — máscaras 3, 6, 9, 12. */
    function applyInnerCornerPreset(): void {
        assignments.clear();
        sourceTiles.clear();
        INNER_CORNER_4_SLOTS.forEach((meta, col) => {
            assignments.set(key(col, 0), meta.mask);
            sourceTiles.set(key(col, 0), { col, row: 0 });
        });
        slotLayoutMode = 'innerCorner4';
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(4, 1);
        options.onChange?.();
    }

    /**
     * Mantém bordas 9 vizinhos (se já existirem) e adiciona linha com 4 quinas internas.
     */
    function appendInnerCornerSlots(): void {
        const innerRow = slotGridRows >= 3 ? slotGridRows : 3;
        INNER_CORNER_4_SLOTS.forEach((meta, col) => {
            const k = key(col, innerRow);
            assignments.set(k, meta.mask);
            if (!sourceTiles.has(k)) {
                sourceTiles.set(k, { col, row: innerRow });
            }
        });
        slotGridCols = Math.max(slotGridCols, 4);
        slotGridRows = innerRow + 1;
        if (slotLayoutMode === 'neighbor3x3') {
            slotLayoutMode = 'free';
        }
        activeCol = -1;
        activeRow = -1;
        rebuildCellList(slotGridCols, slotGridRows);
        options.onChange?.();
    }

    /** Restaura máscaras e remapeamentos salvos ao reabrir um conjunto. */
    function loadAssignments(cells: BorderSetCellAssignment[], cols: number, rows: number): void {
        const inferred = inferBorderSlotGrid(cells);
        let useCols = Math.max(cols, inferred.cols);
        let useRows = Math.max(rows, inferred.rows);

        let normalized = cells;
        const activeMasks = cells.filter((c) => c.mask > 0);
        if (activeMasks.length >= 4 && useCols < 3) {
            useCols = 3;
            useRows = 3;
        }
        const hasInnerCorner = activeMasks.some((c) =>
            (BORDER_INNER_CORNER_MASKS as readonly number[]).includes(c.mask)
        );
        if (useCols === 3 && useRows === 3 && activeMasks.length >= 4 && !hasInnerCorner) {
            normalized = normalizeBorderCellsToNeighbor3x3(cells);
        }

        assignments.clear();
        sourceTiles.clear();
        for (let row = 0; row < useRows; row++) {
            for (let col = 0; col < useCols; col++) {
                const k = key(col, row);
                assignments.set(k, 0);
                sourceTiles.set(k, { col, row });
            }
        }
        for (const cell of normalized) {
            if (cell.col < 0 || cell.col >= useCols || cell.row < 0 || cell.row >= useRows) continue;
            const k = key(cell.col, cell.row);
            assignments.set(k, cell.mask);
            sourceTiles.set(k, {
                col: cell.sourceCol ?? cell.col,
                row: cell.sourceRow ?? cell.row,
            });
        }
        activeCol = -1;
        activeRow = -1;
        slotGridCols = useCols;
        slotGridRows = useRows;
        slotLayoutMode = detectSlotLayoutMode(useCols, useRows, assignments);
        rebuildCellList(useCols, useRows);
        options.onChange?.();
    }
    /**
     * Clique na prévia 3×3: define máscara correta + slot ativo (e aplica preset 9×9 se necessário).
     */
    function selectSlotFromPreviewGrid(
        gridX: number,
        gridY: number
    ): { ok: boolean; cols: number; rows: number } {
        const neededMask = getRequiredMaskForPreviewCell(gridX, gridY);
        if (neededMask === 0) {
            return { ok: false, cols: slotGridCols, rows: slotGridRows };
        }

        const hasAnyMask = [...assignments.values()].some((m) => m > 0);
        if (!hasAnyMask) {
            applyFullNeighborPreset();
        }

        let slot = slotCoordsForPreviewCell(
            slotLayoutMode,
            gridX,
            gridY,
            slotGridCols,
            slotGridRows
        );
        if (!slot) {
            slot = slotCoordsForPreviewCell('neighbor3x3', gridX, gridY, 3, 3);
        }
        if (!slot) {
            return { ok: false, cols: slotGridCols, rows: slotGridRows };
        }

        const k = key(slot.col, slot.row);
        assignments.set(k, neededMask);
        rebuildCellList(slotGridCols, slotGridRows);
        setActiveCell(slot.col, slot.row, true);
        options.onChange?.();
        return { ok: true, cols: slotGridCols, rows: slotGridRows };
    }

    /** Clique no canvas: associa tile da sheet ao slot ativo. */
    function handleCanvasPick(sheetCol: number, sheetRow: number): boolean {
        if (!hasActiveSlot()) return false;
        if (slotLayoutMode === 'neighbor3x3' && activeCol === 1 && activeRow === 1) return false;
        const k = key(activeCol, activeRow);
        let mask = assignments.get(k) ?? 0;
        const maskWasZero = mask === 0;
        if (maskWasZero) {
            const previewCell = previewCellForSlotCoords(
                slotLayoutMode,
                activeCol,
                activeRow,
                slotGridCols,
                slotGridRows
            );
            if (previewCell) {
                mask = getRequiredMaskForPreviewCell(previewCell.x, previewCell.y);
                if (mask > 0) {
                    assignments.set(k, mask);
                }
            }
        }
        sourceTiles.set(k, { col: sheetCol, row: sheetRow });
        if (maskWasZero && mask > 0) {
            rebuildCellList(slotGridCols, slotGridRows);
            setActiveCell(activeCol, activeRow, false);
        } else {
            refreshSourceLabels();
        }
        const rowEl = options.listEl.querySelector(
            `.cal-border-cell-row[data-col="${activeCol}"][data-row="${activeRow}"]`
        ) as HTMLElement | null;
        if (rowEl) {
            rowEl.classList.remove('is-unassigned');
            applyGuidedMaskClasses(rowEl, activeCol, activeRow, mask);
            const sourceEl = rowEl.querySelector('.cal-border-cell-source');
            if (sourceEl) {
                sourceEl.textContent = formatSourceLabel(activeCol, activeRow);
            }
        }
        options.onChange?.();
        return true;
    }

    function getAssignments(cols: number, rows: number): BorderSetCellAssignment[] {
        const out: BorderSetCellAssignment[] = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const src = getSource(col, row);
                out.push({
                    col,
                    row,
                    mask: assignments.get(key(col, row)) ?? 0,
                    sourceCol: src.col,
                    sourceRow: src.row,
                });
            }
        }
        return out;
    }

    function getActiveCell(): { col: number; row: number } {
        return { col: activeCol, row: activeRow };
    }

    function getMaskAt(col: number, row: number): number {
        return assignments.get(key(col, row)) ?? 0;
    }

    function getSourceAt(col: number, row: number): { col: number; row: number } {
        return getSource(col, row);
    }

    /** Ativa o slot que usa esta máscara (ex. quina L M6). */
    function selectSlotByMask(mask: number): boolean {
        if (mask <= 0) return false;
        for (let row = 0; row < slotGridRows; row++) {
            for (let col = 0; col < slotGridCols; col++) {
                if ((assignments.get(key(col, row)) ?? 0) === mask) {
                    setActiveCell(col, row, true);
                    options.onChange?.();
                    return true;
                }
            }
        }
        return false;
    }

    /** Cria slots das quinas L se faltarem e ativa o da máscara pedida. */
    function ensureAndSelectInnerCorner(mask: number): boolean {
        if (mask <= 0) return false;
        if (selectSlotByMask(mask)) return true;

        const hasNeighborMask = [...assignments.values()].some(
            (m) => m === 1 || m === 2 || m === 4 || m === 8 || m >= 16
        );
        if (!hasNeighborMask) {
            applyFullNeighborPreset();
        }
        appendInnerCornerSlots();
        return selectSlotByMask(mask);
    }

    setBadge(options.fillTerrain ?? 'grama');
    updatePickHint();

    return {
        rebuildCellList,
        applyPreset,
        applyFullNeighborPreset,
        applyCardinalPreset,
        applyInnerCornerPreset,
        appendInnerCornerSlots,
        loadAssignments,
        hasActiveSlot,
        clearActiveSlot,
        getAssignments,
        setFillTerrain: setBadge,
        setActiveCell,
        handleCanvasPick,
        getActiveCell,
        getMaskAt,
        getSourceAt,
        getSlotLayoutMode: () => slotLayoutMode,
        getSlotGridSize: () => ({ cols: slotGridCols, rows: slotGridRows }),
        selectSlotFromPreviewGrid,
        selectSlotByMask,
        ensureAndSelectInnerCorner,
    };
}
