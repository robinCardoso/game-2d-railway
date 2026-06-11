/**
 * Alcance de ataque do jogador — separado de `attackRange` dos mobs (IA de chase).
 * Distância em tiles usa Chebyshev (max(|dx|, |dy|)) — inclui diagonal no melee adjacente.
 *
 * Perfil por vocação: `vocations.json` → `attackProfile` (editável no Studio).
 * Fallback legado por ID quando `attackProfile` ausente.
 */

import {
    chebyshevDistance,
    manhattanDistance,
} from './movement/distance.js';

export type PlayerAttackType = 'melee' | 'distance' | 'magic';

export interface PlayerAttackProfile {
    attackType: PlayerAttackType;
    range: number;
    requiresLineOfSight: boolean;
}

export interface VocationAttackProfileConfig {
    attackType: PlayerAttackType;
    range: number;
    requiresLineOfSight?: boolean;
}

/** Fonte opcional de perfil (ex.: VocationConfig do vocations.json). */
export interface VocationAttackProfileSource {
    attackProfile?: VocationAttackProfileConfig;
}

/** Melee: 1 SQM adjacente (8 direções, inclusive diagonal). */
export const PLAYER_MELEE_RANGE = 1;

/** Alcance padrão para vocações ranged/magic. */
export const PLAYER_RANGED_RANGE = 7;

const MAGIC_VOCATION_IDS = new Set(['mage', 'sorcerer']);
const DISTANCE_VOCATION_IDS = new Set(['archer', 'paladin']);

function clampAttackRange(range: number): number {
    if (!Number.isFinite(range)) return PLAYER_MELEE_RANGE;
    return Math.max(1, Math.min(15, Math.floor(range)));
}

function profileFromConfig(config: VocationAttackProfileConfig): PlayerAttackProfile {
    return {
        attackType: config.attackType,
        range: clampAttackRange(config.range),
        requiresLineOfSight: config.requiresLineOfSight === true,
    };
}

function legacyProfileByVocationId(vocationId?: string): PlayerAttackProfile {
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

/**
 * Resolve perfil de ataque: prioriza `vocation.attackProfile` (Studio/JSON),
 * depois fallback por ID legado, depois melee padrão.
 */
export function resolvePlayerAttackProfile(
    vocationId?: string,
    vocation?: VocationAttackProfileSource | null
): PlayerAttackProfile {
    if (vocation?.attackProfile?.attackType) {
        return profileFromConfig(vocation.attackProfile);
    }
    return legacyProfileByVocationId(vocationId);
}

/** Distância Chebyshev entre centros de tile (1 = adjacente inclusive diagonal). */
export function chebyshevTileDistance(
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    return chebyshevDistance(ax, ay, bx, by);
}

/** @deprecated Preferir chebyshevTileDistance. Mantido para compatibilidade. */
export function manhattanTileDistance(
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    return manhattanDistance(ax, ay, bx, by);
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
