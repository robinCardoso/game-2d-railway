import {
    BORDER_MASK_E,
    BORDER_MASK_N,
    BORDER_MASK_NE,
    BORDER_MASK_NW,
    BORDER_MASK_S,
    BORDER_MASK_SE,
    BORDER_MASK_SW,
    BORDER_MASK_W,
} from '../engine/borderMaskBits';

/** Posição do slot na grade 3×3 (vizinhos da grama). */
export type BorderNeighborSlotRole =
    | 'nw'
    | 'n'
    | 'ne'
    | 'w'
    | 'center'
    | 'e'
    | 'sw'
    | 's'
    | 'se';

export type BorderSlotLayoutMode = 'free' | 'neighbor3x3' | 'cardinal4' | 'innerCorner4';

export interface BorderSlotGeoMeta {
    role: BorderNeighborSlotRole;
    /** Rótulo em relação à grama (como o usuário pensa o mapa). */
    grassSideLabel: string;
    /** Onde o filete deve aparecer no PNG do tile de pedra. */
    fileteHint: string;
    mask: number;
}

/** Grade 3×3: cada slot → máscara que o motor usa na pedra vizinha. */
export const NEIGHBOR_3X3_SLOTS: BorderSlotGeoMeta[] = [
    { role: 'nw', grassSideLabel: '↖ Diagonal NO', fileteHint: 'filete canto SE do tile', mask: BORDER_MASK_SE },
    { role: 'n', grassSideLabel: '↑ Acima da grama', fileteHint: 'filete na base do tile (encosta embaixo na grama)', mask: BORDER_MASK_S },
    { role: 'ne', grassSideLabel: '↗ Diagonal NE', fileteHint: 'filete canto SO do tile', mask: BORDER_MASK_SW },
    { role: 'w', grassSideLabel: '← Esquerda da grama', fileteHint: 'filete na borda direita do tile', mask: BORDER_MASK_E },
    { role: 'center', grassSideLabel: '— Grama (centro)', fileteHint: 'slot não usado — fill é outro asset', mask: 0 },
    { role: 'e', grassSideLabel: '→ Direita da grama', fileteHint: 'filete na borda esquerda do tile', mask: BORDER_MASK_W },
    { role: 'sw', grassSideLabel: '↙ Diagonal SO', fileteHint: 'filete canto NE do tile', mask: BORDER_MASK_NE },
    { role: 's', grassSideLabel: '↓ Abaixo da grama', fileteHint: 'filete no topo do tile (encosta em cima na grama)', mask: BORDER_MASK_N },
    { role: 'se', grassSideLabel: '↘ Diagonal SE', fileteHint: 'filete canto NO do tile', mask: BORDER_MASK_NW },
];

export const CARDINAL_4_SLOTS: BorderSlotGeoMeta[] = [
    { role: 'n', grassSideLabel: '↑ Acima da grama', fileteHint: 'filete na base do tile', mask: BORDER_MASK_S },
    { role: 'e', grassSideLabel: '→ Direita da grama', fileteHint: 'filete na borda esquerda do tile', mask: BORDER_MASK_W },
    { role: 's', grassSideLabel: '↓ Abaixo da grama', fileteHint: 'filete no topo do tile', mask: BORDER_MASK_N },
    { role: 'w', grassSideLabel: '← Esquerda da grama', fileteHint: 'filete na borda direita do tile', mask: BORDER_MASK_E },
];

/** Quinas internas (L): grama em dois lados perpendiculares da pedra. */
export const INNER_CORNER_4_SLOTS: BorderSlotGeoMeta[] = [
    {
        role: 'n',
        grassSideLabel: '⌐ Grama ↑+→ (M3)',
        fileteHint: 'quina interna: grama no canto SO do PNG (pedra a NO do “L”)',
        mask: 3,
    },
    {
        role: 'e',
        grassSideLabel: '⌐ Grama ↓+→ (M6)',
        fileteHint: 'quina interna: grama no canto NO do PNG (pedra a SO do “L”)',
        mask: 6,
    },
    {
        role: 's',
        grassSideLabel: '⌐ Grama ↓+← (M12)',
        fileteHint: 'quina interna: grama no canto NE do PNG (pedra a SE do “L”)',
        mask: 12,
    },
    {
        role: 'w',
        grassSideLabel: '⌐ Grama ↑+← (M9)',
        fileteHint: 'quina interna: grama no canto SE do PNG (pedra a NE do “L”)',
        mask: 9,
    },
];

export function getInnerCorner4SlotMeta(col: number): BorderSlotGeoMeta | null {
    if (col < 0 || col > 3) return null;
    return INNER_CORNER_4_SLOTS[col] ?? null;
}

export function getNeighbor3x3SlotMeta(col: number, row: number): BorderSlotGeoMeta | null {
    if (col < 0 || col > 2 || row < 0 || row > 2) return null;
    return NEIGHBOR_3X3_SLOTS[row * 3 + col] ?? null;
}

export function getCardinal4SlotMeta(col: number): BorderSlotGeoMeta | null {
    if (col < 0 || col > 3) return null;
    return CARDINAL_4_SLOTS[col] ?? null;
}

/** Rótulo curto na prévia 3×3 (posição x,y = mesma do motor). */
export function getPreviewCellCaption(x: number, y: number): string | null {
    const meta = getNeighbor3x3SlotMeta(x, y);
    if (!meta || meta.mask === 0) return null;
    const arrow = meta.grassSideLabel.split(' ')[0] ?? '';
    return `${arrow} M${meta.mask}`;
}

/** Máscara esperada para slot em modo guiado. */
export function getExpectedMaskForSlot(
    mode: BorderSlotLayoutMode,
    col: number,
    row: number
): number | null {
    if (mode === 'neighbor3x3') {
        return getNeighbor3x3SlotMeta(col, row)?.mask ?? null;
    }
    if (mode === 'cardinal4' && row === 0) {
        return getCardinal4SlotMeta(col)?.mask ?? null;
    }
    if (mode === 'innerCorner4' && row === 0) {
        return getInnerCorner4SlotMeta(col)?.mask ?? null;
    }
    return null;
}

/** Rótulos amigáveis no dropdown (perspectiva da grama + número técnico). */
export const BORDER_MASK_GRASS_LABELS: Record<number, string> = {
    0: '0 — (não usar)',
    1: '1 — ↓ Pedra abaixo da grama · filete no topo',
    2: '2 — ← Pedra à esquerda · filete à direita',
    3: '3 — ⌐ Quina interna · grama ↑ e →',
    4: '4 — ↑ Pedra acima da grama · filete embaixo',
    5: '5 — ↑↓ Pedra entre grama em cima e embaixo',
    6: '6 — ⌐ Quina interna · grama ↓ e →',
    7: '7 — ↑↓→ Três lados (sem oeste)',
    8: '8 — → Pedra à direita · filete à esquerda',
    9: '9 — ⌐ Quina interna · grama ↑ e ←',
    10: '10 — →← Corredor horizontal',
    11: '11 — ↑→← Três lados (sem sul)',
    12: '12 — ⌐ Quina interna · grama ↓ e ←',
    13: '13 — ↑↓← Três lados (sem leste)',
    14: '14 — ↓→← Três lados (sem norte)',
    15: '15 — Ilha cercada de grama',
    16: '16 — ↖ Diagonal NO da grama',
    32: '32 — ↙ Diagonal SO da grama',
    64: '64 — ↗ Diagonal NE da grama',
    128: '128 — ↘ Diagonal SE da grama',
};

/** Célula da prévia 3×3 → slot na lista (col/row). */
export function slotCoordsForPreviewCell(
    mode: BorderSlotLayoutMode,
    gridX: number,
    gridY: number,
    slotCols: number,
    slotRows: number
): { col: number; row: number } | null {
    if (gridX < 0 || gridX > 2 || gridY < 0 || gridY > 2) return null;
    if (gridX === 1 && gridY === 1) return null;

    if (mode === 'neighbor3x3' && slotCols === 3 && slotRows === 3) {
        return { col: gridX, row: gridY };
    }

    if (mode === 'cardinal4' && slotRows === 1) {
        const map: Record<string, { col: number; row: number }> = {
            '1,0': { col: 0, row: 0 },
            '2,1': { col: 1, row: 0 },
            '1,2': { col: 2, row: 0 },
            '0,1': { col: 3, row: 0 },
        };
        return map[`${gridX},${gridY}`] ?? null;
    }

    return { col: gridX, row: gridY };
}

/** Slot ativo → célula destacada na prévia 3×3. */
export function previewCellForSlotCoords(
    mode: BorderSlotLayoutMode,
    slotCol: number,
    slotRow: number,
    slotCols: number,
    slotRows: number
): { x: number; y: number } | null {
    if (mode === 'neighbor3x3' && slotCols === 3 && slotRows === 3) {
        if (slotCol === 1 && slotRow === 1) return null;
        return { x: slotCol, y: slotRow };
    }

    if (mode === 'cardinal4' && slotRows === 1) {
        const map: Record<string, { x: number; y: number }> = {
            '0,0': { x: 1, y: 0 },
            '1,0': { x: 2, y: 1 },
            '2,0': { x: 1, y: 2 },
            '3,0': { x: 0, y: 1 },
        };
        return map[`${slotCol},${slotRow}`] ?? null;
    }

    if (slotCol >= 0 && slotCol <= 2 && slotRow >= 0 && slotRow <= 2 && !(slotCol === 1 && slotRow === 1)) {
        return { x: slotCol, y: slotRow };
    }
    return null;
}

export const BORDER_MASK_GRASS_HINTS: Record<number, string> = {
    1: 'Pedra fica ABAIXO da grama. Escolha tile com filete de grama no TOPO do PNG.',
    2: 'Pedra fica à ESQUERDA da grama. Filete de grama na borda DIREITA do PNG.',
    4: 'Pedra fica ACIMA da grama. Escolha tile com filete de grama na BASE do PNG.',
    8: 'Pedra fica à DIREITA da grama. Filete de grama na borda ESQUERDA do PNG.',
    16: 'Pedra na diagonal NO — só grama na diagonal SE.',
    32: 'Pedra na diagonal SO — só grama na diagonal NE.',
    64: 'Pedra na diagonal NE — só grama na diagonal SO.',
    128: 'Pedra na diagonal SE — só grama na diagonal NO.',
    3: 'Pedra com grama a norte e leste — tile em L (grama no canto SO do PNG).',
    6: 'Pedra com grama a sul e leste — tile em L (grama no canto NO do PNG). Use no “joelho” do L, ex. célula amarela do mapa.',
    9: 'Pedra com grama a norte e oeste — tile em L (grama no canto SE do PNG).',
    12: 'Pedra com grama a sul e oeste — tile em L (grama no canto NE do PNG).',
};
