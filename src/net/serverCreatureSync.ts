import { ENGINE_CONFIG } from '../engine/config';
import type { CreatureSnapshot } from '../../shared/protocol';
import { MONSTER_STEP_MS } from '../../shared/creatureChase';
import { GameEntity } from '../character/entity';
import { createCreatureConfigForSpawn } from '../character/creatureConfigs';
import { resolveCreatureCombatStats } from '../game/creatureCombatStats';
import { getCreaturePreset } from '../editor/creaturePresets';
import { protocolDirectionToSprite } from '../world/playerAppearance';
import {
    beginCreatureDeath,
    respawnCreatureAtSpawn,
    tickCreatureCorpse,
} from '../game/creatureDeathLifecycle';

const { TILE_SIZE } = ENGINE_CONFIG;

/** Mantém walk após chegar no tile, esperando o próximo passo do servidor. */
const CHASE_IDLE_GRACE_MS = 80;

function mapDirection(dir?: CreatureSnapshot['direction']): 'up' | 'down' | 'left' | 'right' {
    if (!dir) return 'down';
    return protocolDirectionToSprite(dir);
}

function slideToward(current: number, target: number, maxDelta: number): number {
    if (current < target) return Math.min(target, current + maxDelta);
    if (current > target) return Math.max(target, current - maxDelta);
    return current;
}

function tileManhattanDelta(fromX: number, fromY: number, toX: number, toY: number): number {
    return Math.abs(toX - fromX) + Math.abs(toY - fromY);
}

function snapEntityToTile(entity: GameEntity, tileX: number, tileY: number): void {
    entity.tileX = tileX;
    entity.tileY = tileY;
    entity.worldX = tileX * TILE_SIZE;
    entity.worldY = tileY * TILE_SIZE;
    entity.stepDestTileX = undefined;
    entity.stepDestTileY = undefined;
}

function isEntityMidSlide(entity: GameEntity, nowMs: number, chaseUntil?: number): boolean {
    const destX = entity.tileX * TILE_SIZE;
    const destY = entity.tileY * TILE_SIZE;
    const farFromTile =
        Math.abs(entity.worldX - destX) >= 0.5 || Math.abs(entity.worldY - destY) >= 0.5;
    const chaseGraceActive = chaseUntil !== undefined && nowMs < chaseUntil;
    return farFromTile || chaseGraceActive;
}

/** Paridade npcAI.faceSlideDirection — direção do deslize visual, não olhar fixo no alvo. */
function faceSlideDirection(entity: GameEntity): void {
    const targetX = entity.tileX * TILE_SIZE;
    const targetY = entity.tileY * TILE_SIZE;
    const dx = targetX - entity.worldX;
    const dy = targetY - entity.worldY;
    if (Math.abs(dx) > Math.abs(dy)) {
        entity.setDirection(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > 0.5) {
        entity.setDirection(dy > 0 ? 'down' : 'up');
    }
}

/**
 * Criaturas autoritativas do servidor — substituem mobs locais quando online.
 * Deslize contínuo por frame (mesmo modelo do npcAI offline), não interpolação por pacote.
 */
export class ServerCreatureSync {
    private readonly entities = new Map<string, GameEntity>();
    private readonly stepDurationMs = new Map<string, number>();
    private readonly chaseActiveUntil = new Map<string, number>();
    private readonly loading = new Set<string>();
    private lastFrameMs = 0;

    isActive(): boolean {
        return this.entities.size > 0;
    }

    getEntities(): GameEntity[] {
        return [...this.entities.values()];
    }

    applySync(creatures: CreatureSnapshot[], mapId: string, instanceId?: string): void {
        const activeIds = new Set<string>();
        const nowMs = performance.now();

        for (const snap of creatures) {
            if (snap.mapId !== mapId) continue;
            if ((snap.instanceId ?? undefined) !== (instanceId ?? undefined)) continue;
            if (snap.creatureType !== 'monster') continue;

            activeIds.add(snap.creatureId);
            this.upsertFromSnapshot(snap, nowMs, false);
        }

        for (const id of this.entities.keys()) {
            if (!activeIds.has(id)) {
                this.entities.delete(id);
                this.stepDurationMs.delete(id);
                this.chaseActiveUntil.delete(id);
            }
        }
    }

    applyDamaged(
        creatureId: string,
        health: number,
        maxHealth: number,
        damage: number
    ): GameEntity | undefined {
        const entity = this.entities.get(creatureId);
        if (!entity) return undefined;
        entity.combatMaxHealth = maxHealth;
        entity.combatHealth = health;
        entity.spawnFloatingDamage(damage, performance.now());
        return entity;
    }

    applyDied(creatureId: string): GameEntity | undefined {
        const entity = this.entities.get(creatureId);
        if (!entity) return undefined;
        entity.combatHealth = 0;
        beginCreatureDeath(entity, performance.now());
        this.stepDurationMs.delete(creatureId);
        this.chaseActiveUntil.delete(creatureId);
        return entity;
    }

    applyRespawned(payload: {
        creatureId: string;
        tileX: number;
        tileY: number;
        z: number;
        health: number;
        maxHealth: number;
    }): GameEntity | undefined {
        const entity = this.entities.get(payload.creatureId);
        if (!entity) return undefined;
        respawnCreatureAtSpawn(entity, performance.now(), TILE_SIZE);
        entity.combatHealth = payload.health;
        entity.combatMaxHealth = payload.maxHealth;
        entity.tileX = payload.tileX;
        entity.tileY = payload.tileY;
        entity.worldZ = payload.z;
        entity.worldX = payload.tileX * TILE_SIZE;
        entity.worldY = payload.tileY * TILE_SIZE;
        this.stepDurationMs.delete(payload.creatureId);
        this.chaseActiveUntil.delete(payload.creatureId);
        return entity;
    }

    applyMoved(
        snap: Pick<
            CreatureSnapshot,
            'creatureId' | 'tileX' | 'tileY' | 'z' | 'direction'
        >,
        stepDurationMs: number,
        nowMs: number
    ): void {
        const entity = this.entities.get(snap.creatureId);
        if (!entity || entity.isDead) return;

        const prevTileX = entity.tileX;
        const prevTileY = entity.tileY;
        const tileDelta = tileManhattanDelta(prevTileX, prevTileY, snap.tileX, snap.tileY);

        entity.worldZ = snap.z;
        entity.setDirection(mapDirection(snap.direction));

        if (tileDelta > 1) {
            snapEntityToTile(entity, snap.tileX, snap.tileY);
            this.stepDurationMs.delete(snap.creatureId);
            this.chaseActiveUntil.delete(snap.creatureId);
            entity.setState('idle');
            return;
        }

        const duration = Math.max(16, stepDurationMs);
        this.stepDurationMs.set(snap.creatureId, duration);

        entity.tileX = snap.tileX;
        entity.tileY = snap.tileY;

        const destX = snap.tileX * TILE_SIZE;
        const destY = snap.tileY * TILE_SIZE;

        if (tileDelta === 0) {
            const chaseUntil = this.chaseActiveUntil.get(snap.creatureId);
            if (!isEntityMidSlide(entity, nowMs, chaseUntil)) {
                entity.worldX = destX;
                entity.worldY = destY;
                entity.stepDestTileX = undefined;
                entity.stepDestTileY = undefined;
            }
            return;
        }

        const atDest =
            Math.abs(entity.worldX - destX) < 0.5 && Math.abs(entity.worldY - destY) < 0.5;

        if (atDest) {
            entity.worldX = destX;
            entity.worldY = destY;
            entity.stepDestTileX = undefined;
            entity.stepDestTileY = undefined;
        } else {
            entity.stepDestTileX = snap.tileX;
            entity.stepDestTileY = snap.tileY;
        }

        this.chaseActiveUntil.set(
            snap.creatureId,
            nowMs + duration + CHASE_IDLE_GRACE_MS
        );
    }

    tick(nowMs: number): void {
        const dt = Math.min(48, this.lastFrameMs > 0 ? nowMs - this.lastFrameMs : 16);
        this.lastFrameMs = nowMs;

        for (const [id, entity] of this.entities.entries()) {
            if (entity.isDead) {
                tickCreatureCorpse(entity, nowMs);
                continue;
            }

            const duration = this.stepDurationMs.get(id) ?? MONSTER_STEP_MS;
            const speedPxPerMs = TILE_SIZE / duration;
            const maxDelta = speedPxPerMs * dt;

            const targetX = entity.tileX * TILE_SIZE;
            const targetY = entity.tileY * TILE_SIZE;

            entity.worldX = slideToward(entity.worldX, targetX, maxDelta);
            entity.worldY = slideToward(entity.worldY, targetY, maxDelta);

            const arrived =
                Math.abs(entity.worldX - targetX) < 0.5 &&
                Math.abs(entity.worldY - targetY) < 0.5;

            if (arrived) {
                entity.worldX = targetX;
                entity.worldY = targetY;
                entity.stepDestTileX = undefined;
                entity.stepDestTileY = undefined;
            }

            const sliding = !arrived;
            const chaseUntil = this.chaseActiveUntil.get(id);
            const chasing = sliding || (chaseUntil !== undefined && nowMs < chaseUntil);

            if (sliding) {
                faceSlideDirection(entity);
            }

            entity.isChasing = chasing;
            if (chasing) {
                entity.setState('walk');
            } else if (chaseUntil !== undefined) {
                this.chaseActiveUntil.delete(id);
                entity.setState('idle');
            }

            entity.update(nowMs, chasing ? duration : undefined);
        }
    }

    clear(): void {
        this.entities.clear();
        this.stepDurationMs.clear();
        this.chaseActiveUntil.clear();
        this.loading.clear();
        this.lastFrameMs = 0;
    }

    resetFrameClock(): void {
        this.lastFrameMs = 0;
    }

    /** Snap visual ao tile autoritativo após pausa longa do rAF (aba em background). */
    snapAllToAuthoritativeTiles(): void {
        for (const entity of this.entities.values()) {
            if (entity.isDead) continue;
            snapEntityToTile(entity, entity.tileX, entity.tileY);
            this.chaseActiveUntil.delete(entity.id);
            if (!entity.isDead) {
                entity.setState('idle');
            }
        }
    }

    private upsertFromSnapshot(
        snap: CreatureSnapshot,
        nowMs: number,
        animateMove: boolean
    ): void {
        let entity = this.entities.get(snap.creatureId);
        if (!entity) {
            this.createEntity(snap);
            entity = this.entities.get(snap.creatureId);
            if (!entity) {
                entity = this.buildEntityImmediate(snap);
                this.entities.set(snap.creatureId, entity);
            }
        }

        const prevX = entity.tileX;
        const prevY = entity.tileY;
        entity.worldZ = snap.z;
        entity.setDirection(mapDirection(snap.direction));
        this.applyCombatState(entity, snap, nowMs);

        const duration = snap.stepDurationMs ?? MONSTER_STEP_MS;
        this.stepDurationMs.set(snap.creatureId, duration);

        entity.tileX = snap.tileX;
        entity.tileY = snap.tileY;

        const tileDelta = tileManhattanDelta(prevX, prevY, snap.tileX, snap.tileY);

        if (!animateMove || tileDelta === 0) {
            snapEntityToTile(entity, snap.tileX, snap.tileY);
            if (!entity.isDead) {
                entity.setState('idle');
            }
            return;
        }

        if (tileDelta > 1) {
            snapEntityToTile(entity, snap.tileX, snap.tileY);
            if (!entity.isDead) {
                entity.setState('idle');
            }
            return;
        }

        entity.stepDestTileX = snap.tileX;
        entity.stepDestTileY = snap.tileY;
        this.chaseActiveUntil.set(
            snap.creatureId,
            nowMs + duration + CHASE_IDLE_GRACE_MS
        );
    }

    private buildEntityImmediate(snap: CreatureSnapshot): GameEntity {
        const config = createCreatureConfigForSpawn(snap.name);
        const entity = new GameEntity(
            snap.creatureId,
            snap.name,
            config,
            snap.tileX,
            snap.tileY,
            snap.z,
            5,
            'monster',
            TILE_SIZE
        );
        entity.worldX = snap.tileX * TILE_SIZE;
        entity.worldY = snap.tileY * TILE_SIZE;
        entity.setDirection(mapDirection(snap.direction));
        const preset = getCreaturePreset(snap.name);
        entity.initCombatStats(resolveCreatureCombatStats(preset));
        this.applyCombatState(entity, snap, performance.now());
        void entity.animController.loadImage();
        return entity;
    }

    private applyCombatState(entity: GameEntity, snap: CreatureSnapshot, nowMs: number): void {
        if (snap.maxHealth !== undefined) {
            entity.combatMaxHealth = snap.maxHealth;
        }
        if (snap.health !== undefined) {
            entity.combatHealth = snap.health;
        }
        if (snap.isDead !== undefined) {
            entity.isDead = snap.isDead;
            if (snap.isDead && entity.deathAtMs === undefined) {
                beginCreatureDeath(entity, nowMs);
            } else if (!snap.isDead && entity.isDead) {
                respawnCreatureAtSpawn(entity, nowMs, TILE_SIZE);
            }
        }
    }

    private createEntity(snap: CreatureSnapshot): void {
        if (this.loading.has(snap.creatureId) || this.entities.has(snap.creatureId)) return;
        this.loading.add(snap.creatureId);
        const entity = this.buildEntityImmediate(snap);
        this.entities.set(snap.creatureId, entity);
        this.loading.delete(snap.creatureId);
    }
}
