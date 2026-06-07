/**
 * Alcance de ataque do jogador — separado de `attackRange` dos mobs (IA de chase).
 * Distância em tiles usa Chebyshev (max(|dx|, |dy|)) — inclui diagonal no melee adjacente.
 */

export type PlayerAttackType = 'melee' | 'distance' | 'magic';

export interface PlayerAttackProfile {
    attackType: PlayerAttackType;
    range: number;
    requiresLineOfSight: boolean;
}

/** Melee: 1 SQM adjacente (8 direções, inclusive diagonal). */
export const PLAYER_MELEE_RANGE = 1;

/** Magia / distância (mage, sorcerer, archer). */
export const PLAYER_RANGED_RANGE = 7;

const MAGIC_VOCATION_IDS = new Set(['mage', 'sorcerer']);
const DISTANCE_VOCATION_IDS = new Set(['archer', 'paladin']);

export function resolvePlayerAttackProfile(vocationId?: string): PlayerAttackProfile {
    const id = (vocationId ?? 'knight').trim().toLowerCase();

    if (MAGIC_VOCATION_IDS.has(id)) {
        return {
            attackType: 'magic',
            range: PLAYER_RANGED_RANGE,
            requiresLineOfSight: false,
        };
    }

    if (DISTANCE_VOCATION_IDS.has(id)) {
        return {
            attackType: 'distance',
            range: PLAYER_RANGED_RANGE,
            requiresLineOfSight: false,
        };
    }

    return {
        attackType: 'melee',
        range: PLAYER_MELEE_RANGE,
        requiresLineOfSight: false,
    };
}

/** Distância Chebyshev entre centros de tile (1 = adjacente inclusive diagonal). */
export function chebyshevTileDistance(
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** @deprecated Preferir chebyshevTileDistance. Mantido para compatibilidade. */
export function manhattanTileDistance(
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function isPlayerInAttackRange(
    attacker: { tileX: number; tileY: number; z: number },
    target: { tileX: number; tileY: number; z: number },
    profile: PlayerAttackProfile = resolvePlayerAttackProfile()
): boolean {
    if (attacker.z !== target.z) return false;

    const dist = chebyshevTileDistance(
        attacker.tileX,
        attacker.tileY,
        target.tileX,
        target.tileY
    );

    if (dist === 0) return false;

    if (profile.attackType === 'melee') {
        return dist <= profile.range;
    }

    return dist >= 1 && dist <= profile.range;
}
