/** Distância Chebyshev entre tiles (1 = adjacente inclusive diagonal). */
export function chebyshevDistance(
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Distância Manhattan entre tiles. */
export function manhattanDistance(
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    return Math.abs(ax - bx) + Math.abs(ay - by);
}
