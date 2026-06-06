/**
 * Alcance de ataque do jogador — separado de `attackRange` dos mobs (IA de chase).
 * Hoje só melee; distance/magic entram quando houver combate à distância do player.
 */

export type PlayerAttackType = 'melee' | 'distance' | 'magic';

export interface PlayerAttackProfile {
    attackType: PlayerAttackType;
    range: number;
    requiresLineOfSight: boolean;
}

export const PLAYER_MELEE_RANGE = 1;

export function resolvePlayerAttackProfile(_vocationId?: string): PlayerAttackProfile {
    void _vocationId;
    return {
        attackType: 'melee',
        range: PLAYER_MELEE_RANGE,
        requiresLineOfSight: false,
    };
}

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

    const dist = manhattanTileDistance(attacker.tileX, attacker.tileY, target.tileX, target.tileY);

    if (profile.attackType === 'melee') {
        return dist === profile.range;
    }

    return dist >= 1 && dist <= profile.range;
}
