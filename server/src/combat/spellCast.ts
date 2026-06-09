import type { SpellDefinition } from '../../../src/game-data/spellCatalogTypes.js';
import type { VocationId } from '../../../shared/types/character.js';
import { isPlayerInAttackRange } from '../../../shared/playerAttack.js';
import { processAttack } from './combat.js';
import type { VocationConfig } from '../../../src/engine/character/calculateStats.js';

export interface SpellCastAttacker {
    playerId: string;
    tileX: number;
    tileY: number;
    z: number;
    level: number;
    vocationId: VocationId;
    mana: number;
    spellCooldownUntil: Record<string, number>;
    groupCooldownUntil: Record<string, number>;
}

export interface SpellCastCreature {
    id: string;
    name: string;
    tileX: number;
    tileY: number;
    z: number;
    health: number;
    maxHealth: number;
    defense: number;
    isDead: boolean;
    creatureType: 'monster' | 'npc';
}

export interface SpellCastResult {
    ok: boolean;
    code?: string;
    damage?: number;
    newMana?: number;
    newHealth?: number;
    spellCooldownUntil?: Record<string, number>;
    groupCooldownUntil?: Record<string, number>;
}

export function validateAndResolveSpellCast(
    spell: SpellDefinition,
    attacker: SpellCastAttacker,
    creature: SpellCastCreature | undefined,
    vocationConfig: VocationConfig | undefined,
    nowMs: number
): SpellCastResult {
    if (!spell.implemented) return { ok: false, code: 'SPELL_NOT_IMPLEMENTED' };
    if (!vocationConfig) return { ok: false, code: 'INVALID_VOCATION' };
    if (attacker.level < spell.minLevel) return { ok: false, code: 'LEVEL_TOO_LOW' };
    const vocation = String(attacker.vocationId).toLowerCase();
    if (spell.vocations.length > 0 && !spell.vocations.includes(vocation)) {
        return { ok: false, code: 'VOCATION_BLOCKED' };
    }
    if (attacker.mana < spell.manaCost) return { ok: false, code: 'NOT_ENOUGH_MANA' };

    const groupUntil = attacker.groupCooldownUntil[spell.group] ?? 0;
    if (nowMs < groupUntil) return { ok: false, code: 'GROUP_COOLDOWN' };
    const spellUntil = attacker.spellCooldownUntil[spell.id] ?? 0;
    if (nowMs < spellUntil) return { ok: false, code: 'SPELL_COOLDOWN' };

    if (spell.requiresTarget) {
        if (!creature || creature.creatureType !== 'monster' || creature.isDead) {
            return { ok: false, code: 'CREATURE_NOT_FOUND' };
        }
        const rangeProfile = {
            attackType:
                spell.damage?.type === 'melee'
                    ? ('melee' as const)
                    : spell.damage?.type === 'distance'
                      ? ('distance' as const)
                      : ('magic' as const),
            range: spell.range,
            requiresLineOfSight: spell.requiresLineOfSight === true,
        };
        if (
            creature.z !== attacker.z ||
            !isPlayerInAttackRange(
                { tileX: attacker.tileX, tileY: attacker.tileY, z: attacker.z },
                { tileX: creature.tileX, tileY: creature.tileY, z: creature.z },
                rangeProfile
            )
        ) {
            return { ok: false, code: 'OUT_OF_RANGE' };
        }
    }

    const nextSpellCd = { ...attacker.spellCooldownUntil, [spell.id]: nowMs + spell.cooldownMs };
    const nextGroupCd = {
        ...attacker.groupCooldownUntil,
        [spell.group]: nowMs + spell.groupCooldownMs,
    };
    const newMana = Math.max(0, attacker.mana - spell.manaCost);

    if (!creature || !spell.damage) {
        return {
            ok: true,
            newMana,
            spellCooldownUntil: nextSpellCd,
            groupCooldownUntil: nextGroupCd,
        };
    }

    const attackType =
        spell.damage.type === 'melee'
            ? 'melee'
            : spell.damage.type === 'distance'
              ? 'distance'
              : 'magic';
    const mult = spell.damage.multiplier ?? 1;
    const damageResult = processAttack(
        {
            id: attacker.playerId,
            name: '',
            vocation: attacker.vocationId,
            level: attacker.level,
        },
        {
            id: creature.id,
            name: creature.name,
            health: creature.health,
            maxHealth: creature.maxHealth,
            defense: creature.defense,
        },
        attackType,
        vocationConfig,
        attackType === 'magic' ? mult : mult
    );

    let finalDamage = damageResult.finalDamage;
    if (attackType === 'melee' || attackType === 'distance') {
        finalDamage = Math.max(1, Math.round(finalDamage * mult));
    }

    return {
        ok: true,
        damage: finalDamage,
        newMana,
        newHealth: Math.max(0, creature.health - finalDamage),
        spellCooldownUntil: nextSpellCd,
        groupCooldownUntil: nextGroupCd,
    };
}
