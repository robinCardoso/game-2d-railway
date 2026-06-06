import { calculateStatsForLevel } from '../engine/character/calculateStats';
import { calculateMeleeDamage } from '../engine/combat/calculateDamage';
import { getVocationById } from '../game-data/vocationRegistry';
import type { VocationId } from '../../shared/types/character';
import type { GameEntity } from '../character/entity';
import type { CharacterRow } from '../shared/types';
import type { CharacterSpeedState } from '../character/movementSpeed';
import { applyExperienceGain } from './experience';
import { isServerAuthoritativeCombat } from './serverAuthority';

const ATTACK_COOLDOWN_MS = 550;

export interface PlayCombatPlayer {
    tileX: number;
    tileY: number;
    worldZ: number;
}

export interface PlayCombatCallbacks {
    onDamage: (target: GameEntity, damage: number) => void;
    onMonsterKilled: (target: GameEntity, xpReward: number) => void;
    onProgressUpdated: (progress: {
        experience: number;
        level: number;
        leveledUp: boolean;
    }) => void;
    faceToward: (target: GameEntity) => void;
}

export interface PlayCombatServerBridge {
    wsConnected: boolean;
    sendAttack: (creatureId: string) => void;
}

let attackCooldownUntil = 0;
let prevSpaceDown = false;

export function resetPlayCombatInput(): void {
    attackCooldownUntil = 0;
    prevSpaceDown = false;
}

function findAdjacentMonster(
    npcs: GameEntity[],
    player: PlayCombatPlayer
): GameEntity | null {
    for (const npc of npcs) {
        if (npc.type !== 'monster' || npc.isDead) continue;
        if (npc.worldZ !== player.worldZ) continue;
        const dx = Math.abs(npc.tileX - player.tileX);
        const dy = Math.abs(npc.tileY - player.tileY);
        if (dx + dy === 1) return npc;
    }
    return null;
}

export function tickPlayCombat(options: {
    nowMs: number;
    keys: Record<string, boolean>;
    stepping: boolean;
    npcs: GameEntity[];
    player: PlayCombatPlayer;
    character: CharacterRow;
    characterSpeed: CharacterSpeedState;
    callbacks: PlayCombatCallbacks;
    server?: PlayCombatServerBridge;
}): void {
    const spaceDown = Boolean(options.keys[' '] || options.keys['space']);
    const spaceEdge = spaceDown && !prevSpaceDown;
    prevSpaceDown = spaceDown;

    if (!spaceEdge || options.nowMs < attackCooldownUntil || options.stepping) return;

    const target = findAdjacentMonster(options.npcs, options.player);
    if (!target) return;

    attackCooldownUntil = options.nowMs + ATTACK_COOLDOWN_MS;
    options.callbacks.faceToward(target);

    if (options.server && isServerAuthoritativeCombat(options.server.wsConnected)) {
        options.server.sendAttack(target.id);
        return;
    }

    const vocationId = (options.character.vocation as VocationId) || 'knight';
    const vocationConfig = getVocationById(vocationId);
    const level = options.characterSpeed.level || options.character.level || 1;
    const stats = calculateStatsForLevel(vocationConfig, level);
    const damageResult = calculateMeleeDamage(stats.melee, target.combatDefense);
    const damage = damageResult.actual;

    target.combatHealth = Math.max(0, target.combatHealth - damage);
    options.callbacks.onDamage(target, damage);

    if (target.combatHealth <= 0) {
        target.isDead = true;
        target.setState('idle');
        const xpReward = target.xpReward;
        const gain = applyExperienceGain(options.character.experience ?? 0, xpReward);
        options.character.experience = gain.experience;
        options.character.level = gain.level;
        options.characterSpeed.level = gain.level;
        options.callbacks.onMonsterKilled(target, xpReward);
        options.callbacks.onProgressUpdated({
            experience: gain.experience,
            level: gain.level,
            leveledUp: gain.leveledUp,
        });
    }
}
