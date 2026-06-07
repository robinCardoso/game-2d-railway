import { ENGINE_CONFIG } from '../engine/config';
import { calculateStatsForLevel } from '../engine/character/calculateStats';
import { calculateMeleeDamage } from '../engine/combat/calculateDamage';
import { getVocationById } from '../game-data/vocationRegistry';
import type { VocationId } from '../../shared/types/character';
import type { GameEntity } from '../character/entity';
import type { CharacterRow } from '../shared/types';
import type { CharacterSpeedState } from '../character/movementSpeed';
import { applyExperienceGain } from './experience';
import { beginCreatureDeath } from './creatureDeathLifecycle';
import { isPlayerInAttackRange, resolvePlayerAttackProfile } from '../../shared/playerAttack';

const DEFAULT_ATTACK_COOLDOWN_MS = 550;

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
    onAttackSwing?: () => void;
}

export interface PlayCombatServerBridge {
    wsConnected: boolean;
    /** Quando true, XP/dano local não são aplicados — só o servidor. */
    multiplayerConfigured: boolean;
    sendAttack: (creatureId: string) => void;
}

export interface PlayCombatCamera {
    x: number;
    y: number;
    zoom?: number;
}

let attackCooldownUntil = 0;
let combatTargetId: string | null = null;
let hoveredMonsterId: string | null = null;

export function resetPlayCombatInput(): void {
    attackCooldownUntil = 0;
    combatTargetId = null;
    hoveredMonsterId = null;
}

export function getPlayCombatHoverId(): string | null {
    return hoveredMonsterId;
}

export function getPlayCombatTargetId(): string | null {
    return combatTargetId;
}

export function clearPlayCombatTarget(): void {
    combatTargetId = null;
}

export function clientToPlayWorld(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
    camera: PlayCombatCamera
): { worldX: number; worldY: number } {
    const rect = canvas.getBoundingClientRect();
    const zoom = camera.zoom || 1;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    return {
        worldX: canvasX / zoom + camera.x,
        worldY: canvasY / zoom + camera.y,
    };
}

export function worldPointToTile(
    worldX: number,
    worldY: number,
    tileSize: number
): { tileX: number; tileY: number } {
    return {
        tileX: Math.floor(worldX / tileSize),
        tileY: Math.floor(worldY / tileSize),
    };
}

/** Seleção estilo Tibia: tile (SQM) clicado, não bbox do sprite. */
export function findMonsterAtWorldPoint(
    npcs: GameEntity[],
    worldX: number,
    worldY: number,
    playerZ: number,
    tileSize: number
): GameEntity | null {
    const { tileX, tileY } = worldPointToTile(worldX, worldY, tileSize);
    let best: GameEntity | null = null;
    let bestSortY = -Infinity;

    for (const npc of npcs) {
        if (npc.type !== 'monster' || npc.isDead) continue;
        if (npc.worldZ !== playerZ) continue;
        if (!npc.occupiesTile(tileX, tileY, playerZ, tileSize)) continue;

        const sortY = npc.worldY + tileSize;
        if (sortY >= bestSortY) {
            bestSortY = sortY;
            best = npc;
        }
    }

    return best;
}

export function findMonsterAtClientPoint(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
    camera: PlayCombatCamera,
    npcs: GameEntity[],
    playerZ: number,
    tileSize: number
): GameEntity | null {
    const { worldX, worldY } = clientToPlayWorld(clientX, clientY, canvas, camera);
    return findMonsterAtWorldPoint(npcs, worldX, worldY, playerZ, tileSize);
}

export function updatePlayCombatHover(options: {
    clientX: number;
    clientY: number;
    canvas: HTMLCanvasElement;
    camera: PlayCombatCamera;
    npcs: GameEntity[];
    playerZ: number;
    tileSize: number;
    enabled: boolean;
}): void {
    if (!options.enabled) {
        hoveredMonsterId = null;
        return;
    }

    const monster = findMonsterAtClientPoint(
        options.clientX,
        options.clientY,
        options.canvas,
        options.camera,
        options.npcs,
        options.playerZ,
        options.tileSize
    );
    hoveredMonsterId = monster?.id ?? null;
}

/** Desktop: botão direito (toggle). Mobile/toque: tap no mob (toggle). */
export function handlePlayCombatTargetClick(options: {
    clientX: number;
    clientY: number;
    canvas: HTMLCanvasElement;
    camera: PlayCombatCamera;
    npcs: GameEntity[];
    playerZ: number;
    tileSize: number;
}): boolean {
    const monster = findMonsterAtClientPoint(
        options.clientX,
        options.clientY,
        options.canvas,
        options.camera,
        options.npcs,
        options.playerZ,
        options.tileSize
    );
    if (!monster) return false;

    if (combatTargetId === monster.id) {
        combatTargetId = null;
    } else {
        combatTargetId = monster.id;
        attackCooldownUntil = 0;
    }
    return true;
}

function getPlayerAttackCooldownMs(
    character: CharacterRow,
    characterSpeed: CharacterSpeedState
): number {
    const vocationId = (character.vocation as VocationId) || 'knight';
    const vocationConfig = getVocationById(vocationId);
    const level = characterSpeed.level || character.level || 1;
    const stats = calculateStatsForLevel(vocationConfig, level);
    return Math.max(200, stats.attackSpeed || DEFAULT_ATTACK_COOLDOWN_MS);
}

function isAdjacentToPlayer(target: GameEntity, player: PlayCombatPlayer): boolean {
    const foot = target.getFootTile(ENGINE_CONFIG.TILE_SIZE);
    const profile = resolvePlayerAttackProfile();
    return isPlayerInAttackRange(
        { tileX: player.tileX, tileY: player.tileY, z: player.worldZ },
        { tileX: foot.tileX, tileY: foot.tileY, z: target.worldZ },
        profile
    );
}

function resolveCombatTarget(npcs: GameEntity[]): GameEntity | null {
    if (!combatTargetId) return null;
    const target = npcs.find((n) => n.id === combatTargetId);
    if (!target || target.type !== 'monster' || target.isDead) {
        combatTargetId = null;
        return null;
    }
    return target;
}

function executeAttack(
    target: GameEntity,
    options: {
        nowMs: number;
        character: CharacterRow;
        characterSpeed: CharacterSpeedState;
        callbacks: PlayCombatCallbacks;
        server?: PlayCombatServerBridge;
    }
): void {
    const cooldownMs = getPlayerAttackCooldownMs(options.character, options.characterSpeed);
    attackCooldownUntil = options.nowMs + cooldownMs;
    options.callbacks.faceToward(target);
    options.callbacks.onAttackSwing?.();

    if (options.server?.multiplayerConfigured) {
        if (options.server.wsConnected) {
            options.server.sendAttack(target.id);
        }
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
        beginCreatureDeath(target, options.nowMs);
        if (combatTargetId === target.id) {
            combatTargetId = null;
        }
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
}

export function tickPlayCombat(options: {
    nowMs: number;
    stepping: boolean;
    npcs: GameEntity[];
    player: PlayCombatPlayer;
    character: CharacterRow;
    characterSpeed: CharacterSpeedState;
    callbacks: PlayCombatCallbacks;
    server?: PlayCombatServerBridge;
}): void {
    const target = resolveCombatTarget(options.npcs);
    if (!target) return;
    if (options.nowMs < attackCooldownUntil || options.stepping) return;
    if (!isAdjacentToPlayer(target, options.player)) return;

    executeAttack(target, options);
}
