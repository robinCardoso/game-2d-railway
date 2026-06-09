import { ENGINE_CONFIG } from '../engine/config';
import { calculateMagicDamage, calculateMeleeDamage } from '../engine/combat/calculateDamage';
import { calculateStatsForLevel } from '../engine/character/calculateStats';
import type { GameEntity } from '../character/entity';
import { getVocationById } from '../game-data/vocationRegistry';
import type { SpellDefinition, SpellGroup } from '../game-data/spellCatalogTypes';
import type { VocationId } from '../../shared/types/character';
import type { CharacterRow } from '../shared/types';
import type { CharacterSpeedState } from '../character/movementSpeed';
import { isPlayerInAttackRange, resolvePlayerAttackProfile } from '../../shared/playerAttack';
import { calculateEquipmentAttackBonus } from '../../shared/equipmentBonuses';
import { createEmptyEquipment } from '../../shared/inventory';
import { getItemCatalog } from '../game-data/itemCatalog';
import { getLastPlayInventory } from './ui/playHudInventory';
import { beginCreatureDeath } from './creatureDeathLifecycle';
import { applyExperienceGain } from './experience';
import {
    getPlayCombatTarget,
    type PlayCombatCallbacks,
    type PlayCombatPlayer,
    type PlayCombatServerBridge,
} from './playCombat';
import { getSpellForSlot, type SpellBarSlot } from './ui/playSpellBar';
import { toast } from '../utils/popup';

// SPELL_SYSTEM_TODO: VFX castEffect, projéteis, validação LOS, PvP spell

const groupCooldownUntil: Partial<Record<SpellGroup, number>> = {};
const slotCooldownUntil: Partial<Record<SpellBarSlot, number>> = {};
const slotCooldownDuration: Partial<Record<SpellBarSlot, number>> = {};

export function resetPlaySpellCooldowns(): void {
    for (const key of Object.keys(groupCooldownUntil)) delete groupCooldownUntil[key as SpellGroup];
    for (const key of Object.keys(slotCooldownUntil)) delete slotCooldownUntil[key as SpellBarSlot];
    for (const key of Object.keys(slotCooldownDuration)) delete slotCooldownDuration[key as SpellBarSlot];
}

export function getSpellSlotCooldownProgress(
    slot: SpellBarSlot,
    nowMs: number
): { active: boolean; percent: number } {
    const until = slotCooldownUntil[slot] ?? 0;
    if (nowMs >= until) return { active: false, percent: 0 };
    const total = slotCooldownDuration[slot] ?? 1000;
    const remaining = until - nowMs;
    return { active: true, percent: Math.min(1, remaining / total) };
}

function canUseSpell(
    spell: SpellDefinition,
    character: CharacterRow,
    characterSpeed: CharacterSpeedState,
    nowMs: number
): string | null {
    if (!spell.implemented) return 'Esta magia ainda não está disponível.';
    const level = characterSpeed.level || character.level || 1;
    if (level < spell.minLevel) return `Requer level ${spell.minLevel}.`;
    const vocation = (character.vocation || 'knight').toLowerCase();
    if (spell.vocations.length > 0 && !spell.vocations.includes(vocation)) {
        return 'Sua vocação não pode usar esta magia.';
    }
    const groupUntil = groupCooldownUntil[spell.group] ?? 0;
    if (nowMs < groupUntil) return 'Aguarde o cooldown do grupo.';
    return null;
}

function resolvePlayEquipmentAttackBonus(): number {
    const equipment = getLastPlayInventory()?.equipment ?? createEmptyEquipment();
    return calculateEquipmentAttackBonus(equipment, getItemCatalog());
}

function resolveSpellDamage(
    spell: SpellDefinition,
    stats: ReturnType<typeof calculateStatsForLevel>,
    targetDefense: number
): number {
    const mult = spell.damage?.multiplier ?? 1;
    if (spell.damage?.type === 'melee') {
        const attackBonus = resolvePlayEquipmentAttackBonus();
        const base = calculateMeleeDamage(stats.melee + attackBonus, targetDefense).actual;
        return Math.max(1, Math.round(base * mult));
    }
    if (spell.damage?.type === 'magic') {
        return calculateMagicDamage(stats.magicAttack, mult).actual;
    }
    return 0;
}

function spellRangeProfile(spell: SpellDefinition, vocationId: VocationId) {
    const profile = resolvePlayerAttackProfile(vocationId, getVocationById(vocationId));
    const attackType =
        spell.damage?.type === 'melee'
            ? 'melee'
            : spell.damage?.type === 'distance'
              ? 'distance'
              : 'magic';
    return { ...profile, attackType, range: spell.range };
}

function resolveMonsterTarget(npcs: GameEntity[], targetId: string | null): GameEntity | null {
    if (!targetId) return null;
    const target = npcs.find((n) => n.id === targetId && n.type === 'monster');
    if (!target || target.isDead) return null;
    return target;
}

export function tryCastSpellFromSlot(
    slot: SpellBarSlot,
    options: {
        nowMs: number;
        player: PlayCombatPlayer;
        character: CharacterRow;
        characterSpeed: CharacterSpeedState;
        npcs: GameEntity[];
        playerMana: { current: number; max: number };
        callbacks: PlayCombatCallbacks & { onCastSwing?: () => void };
        server?: PlayCombatServerBridge & { sendCastSpell?: (spellId: string, creatureId: string) => void };
    }
): boolean {
    const spell = getSpellForSlot(slot);
    if (!spell) {
        toast('Slot vazio — equipe uma magia no painel Personagem.');
        return false;
    }

    const slotUntil = slotCooldownUntil[slot] ?? 0;
    if (options.nowMs < slotUntil) return false;

    const blockReason = canUseSpell(spell, options.character, options.characterSpeed, options.nowMs);
    if (blockReason) {
        toast(blockReason);
        return false;
    }

    if (options.playerMana.current < spell.manaCost) {
        toast('Mana insuficiente.');
        return false;
    }

    const combatTarget = getPlayCombatTarget();
    if (spell.requiresTarget) {
        if (!combatTarget || combatTarget.type !== 'monster') {
            toast('Selecione um monstro como alvo.');
            return false;
        }
    }

    const target = combatTarget
        ? resolveMonsterTarget(options.npcs, combatTarget.id)
        : null;
    if (spell.requiresTarget && !target) {
        toast('Alvo inválido.');
        return false;
    }

    if (target) {
        const vocationId = (options.character.vocation as VocationId) || 'knight';
        const foot = target.getFootTile(ENGINE_CONFIG.TILE_SIZE);
        if (
            !isPlayerInAttackRange(
                {
                    tileX: options.player.tileX,
                    tileY: options.player.tileY,
                    z: options.player.worldZ,
                },
                { tileX: foot.tileX, tileY: foot.tileY, z: target.worldZ },
                spellRangeProfile(spell, vocationId)
            )
        ) {
            toast('Alvo fora de alcance.');
            return false;
        }
    }

    slotCooldownUntil[slot] = options.nowMs + spell.cooldownMs;
    slotCooldownDuration[slot] = spell.cooldownMs;
    groupCooldownUntil[spell.group] = options.nowMs + spell.groupCooldownMs;
    options.playerMana.current = Math.max(0, options.playerMana.current - spell.manaCost);

    if (target) options.callbacks.faceToward(target);
    options.callbacks.onCastSwing?.();

    if (options.server?.multiplayerConfigured && options.server.wsConnected && target) {
        options.server.sendCastSpell?.(spell.id, target.id);
        return true;
    }

    if (!target || !spell.damage) return true;

    const vocationId = (options.character.vocation as VocationId) || 'knight';
    const level = options.characterSpeed.level || options.character.level || 1;
    const stats = calculateStatsForLevel(getVocationById(vocationId), level);
    const damage = resolveSpellDamage(spell, stats, target.combatDefense);
    if (damage <= 0) return true;

    target.combatHealth = Math.max(0, target.combatHealth - damage);
    options.callbacks.onDamage(target, damage);

    if (target.combatHealth <= 0) {
        beginCreatureDeath(target, options.nowMs);
        const { xpReward } = target;
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

    return true;
}

export function getSpellTooltip(spell: SpellDefinition | undefined): string {
    if (!spell) return 'Slot vazio';
    const cdSec = (spell.cooldownMs / 1000).toFixed(1);
    return `${spell.name}\n${spell.description}\nMana: ${spell.manaCost} · CD: ${cdSec}s · Alcance: ${spell.range}`;
}
