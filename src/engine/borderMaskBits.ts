/**
 * Bits de máscara auto-borda.
 * Cardinais: N=1, E=2, S=4, O=8 (grama em lados retos).
 * Cantos internos (L / concavos): combinação de dois cardinais — 3, 6, 9, 12.
 * Diagonais (só quando nenhum cardinal): NE=16, SE=32, SO=64, NO=128.
 */

export const BORDER_MASK_N = 1;
export const BORDER_MASK_E = 2;
export const BORDER_MASK_S = 4;
export const BORDER_MASK_W = 8;

export const BORDER_MASK_NE = 16;
export const BORDER_MASK_SE = 32;
export const BORDER_MASK_SW = 64;
export const BORDER_MASK_NW = 128;

export const BORDER_MASK_W_E = BORDER_MASK_W | BORDER_MASK_E;
export const BORDER_MASK_N_S = BORDER_MASK_N | BORDER_MASK_S;

export const BORDER_CARDINAL_MASKS = [1, 2, 4, 8] as const;
/** Grama em dois lados perpendiculares da pedra (quina interna em L). */
export const BORDER_INNER_CORNER_MASKS = [3, 6, 9, 12] as const;
export const BORDER_DIAGONAL_MASKS = [16, 32, 64, 128] as const;

export const BORDER_MASK_MAX = 255;

export interface GrassNeighborProbe {
    hasGrass(z: number, x: number, y: number): boolean;
}

/** Cardinais têm prioridade; diagonais só quando não há grama em N/E/S/O. */
export function computeBorderMaskFromGrassNeighbors(
    probe: GrassNeighborProbe,
    z: number,
    x: number,
    y: number
): number {
    let cardinal = 0;
    if (probe.hasGrass(z, x, y - 1)) cardinal |= BORDER_MASK_N;
    if (probe.hasGrass(z, x + 1, y)) cardinal |= BORDER_MASK_E;
    if (probe.hasGrass(z, x, y + 1)) cardinal |= BORDER_MASK_S;
    if (probe.hasGrass(z, x - 1, y)) cardinal |= BORDER_MASK_W;
    if (cardinal > 0) return cardinal;

    let diagonal = 0;
    if (probe.hasGrass(z, x + 1, y - 1)) diagonal |= BORDER_MASK_NE;
    if (probe.hasGrass(z, x + 1, y + 1)) diagonal |= BORDER_MASK_SE;
    if (probe.hasGrass(z, x - 1, y + 1)) diagonal |= BORDER_MASK_SW;
    if (probe.hasGrass(z, x - 1, y - 1)) diagonal |= BORDER_MASK_NW;
    return diagonal;
}

export function isSupportedBorderMask(mask: number): boolean {
    return Number.isInteger(mask) && mask >= 1 && mask <= BORDER_MASK_MAX;
}

const INNER_CORNER_RESOLVE_ORDER = [
    6, // S+E
    12, // S+W
    3, // N+E
    9, // N+W
] as const;

const CARDINAL_RESOLVE_ORDER = [
    BORDER_MASK_N,
    BORDER_MASK_E,
    BORDER_MASK_S,
    BORDER_MASK_W,
] as const;

const DIAGONAL_RESOLVE_ORDER = [
    BORDER_MASK_NE,
    BORDER_MASK_SE,
    BORDER_MASK_SW,
    BORDER_MASK_NW,
] as const;

/**
 * Escolhe tile disponível: máscara exata → cantos internos (3/6/9/12) → um cardinal → diagonal.
 * Corredor O+E / N+S: persiste um tile (O ou N); o render desenha os dois filetes.
 */
export function resolveBorderMaskForRegistry(
    rawMask: number,
    availableMasks: ReadonlySet<number>
): number {
    if (rawMask <= 0) return 0;
    if (availableMasks.has(rawMask)) return rawMask;

    if (rawMask === BORDER_MASK_W_E) {
        if (availableMasks.has(BORDER_MASK_W)) return BORDER_MASK_W;
        if (availableMasks.has(BORDER_MASK_E)) return BORDER_MASK_E;
        return 0;
    }
    if (rawMask === BORDER_MASK_N_S) {
        if (availableMasks.has(BORDER_MASK_N)) return BORDER_MASK_N;
        if (availableMasks.has(BORDER_MASK_S)) return BORDER_MASK_S;
        return 0;
    }

    const swSe = BORDER_MASK_SW | BORDER_MASK_SE;
    const nwNe = BORDER_MASK_NW | BORDER_MASK_NE;
    const nwSw = BORDER_MASK_NW | BORDER_MASK_SW;
    const neSe = BORDER_MASK_NE | BORDER_MASK_SE;
    if (rawMask === swSe) {
        if (availableMasks.has(BORDER_MASK_SE)) return BORDER_MASK_SE;
        if (availableMasks.has(BORDER_MASK_SW)) return BORDER_MASK_SW;
        return 0;
    }
    if (rawMask === nwNe) {
        if (availableMasks.has(BORDER_MASK_NE)) return BORDER_MASK_NE;
        if (availableMasks.has(BORDER_MASK_NW)) return BORDER_MASK_NW;
        return 0;
    }
    if (rawMask === nwSw) {
        if (availableMasks.has(BORDER_MASK_SW)) return BORDER_MASK_SW;
        if (availableMasks.has(BORDER_MASK_NW)) return BORDER_MASK_NW;
        return 0;
    }
    if (rawMask === neSe) {
        if (availableMasks.has(BORDER_MASK_SE)) return BORDER_MASK_SE;
        if (availableMasks.has(BORDER_MASK_NE)) return BORDER_MASK_NE;
        return 0;
    }

    for (const combined of INNER_CORNER_RESOLVE_ORDER) {
        if ((rawMask & combined) === combined && availableMasks.has(combined)) {
            return combined;
        }
    }

    for (const bit of CARDINAL_RESOLVE_ORDER) {
        if ((rawMask & bit) !== 0 && availableMasks.has(bit)) return bit;
    }
    for (const bit of DIAGONAL_RESOLVE_ORDER) {
        if ((rawMask & bit) !== 0 && availableMasks.has(bit)) return bit;
    }
    return 0;
}
