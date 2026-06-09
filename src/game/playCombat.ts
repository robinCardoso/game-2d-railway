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
    faceToward: (target: { tileX: number; tileY: number }) => void;
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

export type CombatTargetType = 'monster' | 'player';

export interface CombatTarget {
    id: string;
    type: CombatTargetType;
}

let attackCooldownUntil = 0;
let combatTarget: CombatTarget | null = null;
let hoveredMonsterId: string | null = null;

export function resetPlayCombatInput(): void {
    attackCooldownUntil = 0;
    combatTarget = null;
    hoveredMonsterId = null;
}

export function getPlayCombatHoverId(): string | null {
    return hoveredMonsterId;
}

export function getPlayCombatTargetId(): string | null {
    return combatTarget?.id ?? null;
}

export function getPlayCombatTarget(): CombatTarget | null {
    return combatTarget;
}

export function clearPlayCombatTarget(): void {
    combatTarget = null;
}

export interface PlayCombatTargetable {
    id: string;
    tileX: number;
    tileY: number;
    z: number;
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

export function findTargetAtWorldPoint(
    npcs: GameEntity[],
    remotes: PlayCombatTargetable[],
    worldX: number,
    worldY: number,
    playerZ: number,
    tileSize: number
): { id: string; type: 'monster' | 'player' } | null {
    const { tileX, tileY } = worldPointToTile(worldX, worldY, tileSize);

    for (const npc of npcs) {
        if (npc.type !== 'monster' || npc.isDead) continue;
        if (npc.worldZ !== playerZ) continue;
        if (npc.occupiesTile(tileX, tileY, playerZ, tileSize)) {
            return { id: npc.id, type: 'monster' };
        }
    }

    for (const remote of remotes) {
        if (remote.z !== playerZ) continue;
        if (remote.tileX === tileX && remote.tileY === tileY) {
            return { id: remote.id, type: 'player' };
        }
    }

    return null;
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
    remotes?: PlayCombatTargetable[];
}): void {
    if (!options.enabled) {
        hoveredMonsterId = null;
        return;
    }

    const { worldX, worldY } = clientToPlayWorld(options.clientX, options.clientY, options.canvas, options.camera);
    const target = findTargetAtWorldPoint(
        options.npcs,
        options.remotes || [],
        worldX,
        worldY,
        options.playerZ,
        options.tileSize
    );
    hoveredMonsterId = target?.id ?? null;
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
    remotes?: PlayCombatTargetable[];
}): boolean {
    const { worldX, worldY } = clientToPlayWorld(options.clientX, options.clientY, options.canvas, options.camera);
    const target = findTargetAtWorldPoint(
        options.npcs,
        options.remotes || [],
        worldX,
        worldY,
        options.playerZ,
        options.tileSize
    );

    if (!target) return false;

    if (combatTarget?.id === target.id && combatTarget.type === target.type) {
        combatTarget = null;
    } else {
        combatTarget = { id: target.id, type: target.type };
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

function isAdjacentToPlayer(
    target: GameEntity,
    player: PlayCombatPlayer,
    character: CharacterRow
): boolean {
    const foot = target.getFootTile(ENGINE_CONFIG.TILE_SIZE);
    const vocationId = (character.vocation as VocationId) || 'knight';
    const profile = resolvePlayerAttackProfile(vocationId, getVocationById(vocationId));
    return isPlayerInAttackRange(
        { tileX: player.tileX, tileY: player.tileY, z: player.worldZ },
        { tileX: foot.tileX, tileY: foot.tileY, z: target.worldZ },
        profile
    );
}

function resolvePredictedMeleeDamage(
    character: CharacterRow,
    characterSpeed: CharacterSpeedState,
    target: GameEntity
): number {
    const vocationId = (character.vocation as VocationId) || 'knight';
    const vocationConfig = getVocationById(vocationId);
    const level = characterSpeed.level || character.level || 1;
    const stats = calculateStatsForLevel(vocationConfig, level);
    return calculateMeleeDamage(stats.melee, target.combatDefense).actual;
}

function resolveCombatTarget(npcs: GameEntity[]): GameEntity | null {
    if (!combatTarget || combatTarget.type !== 'monster') return null;
    const target = npcs.find((n) => n.id === combatTarget!.id);
    if (!target || target.type !== 'monster' || target.isDead) {
        combatTarget = null;
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
            const predicted = resolvePredictedMeleeDamage(
                options.character,
                options.characterSpeed,
                target
            );
            if (predicted > 0) {
                options.callbacks.onDamage(target, predicted);
            }
        }
        return;
    }

    const damage = resolvePredictedMeleeDamage(
        options.character,
        options.characterSpeed,
        target
    );

    target.combatHealth = Math.max(0, target.combatHealth - damage);
    options.callbacks.onDamage(target, damage);

    if (target.combatHealth <= 0) {
        beginCreatureDeath(target, options.nowMs);
        if (combatTarget?.id === target.id) {
            combatTarget = null;
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
    /** Tecla de movimento pressionada — não forçar face ao alvo enquanto o jogador anda. */
    movementIntent?: boolean;
    npcs: GameEntity[];
    player: PlayCombatPlayer;
    character: CharacterRow;
    characterSpeed: CharacterSpeedState;
    callbacks: PlayCombatCallbacks;
    server?: PlayCombatServerBridge;
    remotes?: PlayCombatTargetable[];
}): void {
    if (!combatTarget) return;

    if (combatTarget.type === 'player') {
        const target = options.remotes?.find((r) => r.id === combatTarget!.id);
        if (!target || target.z !== options.player.worldZ) {
            combatTarget = null;
            return;
        }

        if (!options.stepping && !options.movementIntent) {
            options.callbacks.faceToward(target);
        }

        if (options.nowMs < attackCooldownUntil || options.stepping) return;

        const vocationId = (options.character.vocation as VocationId) || 'knight';
        const attackProfile = resolvePlayerAttackProfile(vocationId, getVocationById(vocationId));
        if (
            !isPlayerInAttackRange(
                { tileX: options.player.tileX, tileY: options.player.tileY, z: options.player.worldZ },
                { tileX: target.tileX, tileY: target.tileY, z: target.z },
                attackProfile
            )
        ) {
            return;
        }

        const cooldownMs = getPlayerAttackCooldownMs(options.character, options.characterSpeed);
        attackCooldownUntil = options.nowMs + cooldownMs;

        options.callbacks.onAttackSwing?.();

        if (options.server?.multiplayerConfigured && options.server.wsConnected) {
            options.server.sendAttack(combatTarget.id);
        }
        return;
    }

    const target = resolveCombatTarget(options.npcs);
    if (!target) return;

    if (!options.stepping && !options.movementIntent) {
        options.callbacks.faceToward(target);
    }

    if (options.nowMs < attackCooldownUntil || options.stepping) return;
    if (!isAdjacentToPlayer(target, options.player, options.character)) return;

    executeAttack(target, options);
}
