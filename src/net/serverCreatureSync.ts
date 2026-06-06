import { ENGINE_CONFIG } from '../engine/config';
import type { CreatureSnapshot } from '../../shared/protocol';
import { MONSTER_STEP_MS } from '../../shared/creatureChase';
import { GameEntity } from '../character/entity';
import { createCreatureConfigForSpawn } from '../character/creatureConfigs';
import { resolveCreatureCombatStats } from '../game/creatureCombatStats';
import { getCreaturePreset } from '../editor/creaturePresets';
import { protocolDirectionToSprite } from '../world/playerAppearance';

const { TILE_SIZE } = ENGINE_CONFIG;

interface CreatureVisualState {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    moveStartedAt: number;
    moveDurationMs: number;
    moving: boolean;
}

function mapDirection(dir?: CreatureSnapshot['direction']): 'up' | 'down' | 'left' | 'right' {
    if (!dir) return 'down';
    return protocolDirectionToSprite(dir);
}

/**
 * Criaturas autoritativas do servidor — substituem mobs locais quando online.
 */
/** Janela sem novo passo antes de voltar ao idle (persegue = walk contínuo, como npcAI offline). */
const CHASE_IDLE_GRACE_MS = MONSTER_STEP_MS * 2;

export class ServerCreatureSync {
    private readonly entities = new Map<string, GameEntity>();
    private readonly visuals = new Map<string, CreatureVisualState>();
    private readonly chaseActiveUntil = new Map<string, number>();
    private readonly loading = new Set<string>();

    isActive(): boolean {
        return this.entities.size > 0;
    }

    getEntities(): GameEntity[] {
        return [...this.entities.values()];
    }

    /** Substitui o snapshot completo da sala (welcome / creature_sync). */
    applySync(creatures: CreatureSnapshot[], mapId: string, instanceId?: string): void {
        const activeIds = new Set<string>();

        for (const snap of creatures) {
            if (snap.mapId !== mapId) continue;
            if ((snap.instanceId ?? undefined) !== (instanceId ?? undefined)) continue;
            if (snap.creatureType !== 'monster') continue;

            activeIds.add(snap.creatureId);
            this.upsertFromSnapshot(snap, performance.now(), false);
        }

        for (const id of this.entities.keys()) {
            if (!activeIds.has(id)) {
                this.entities.delete(id);
                this.visuals.delete(id);
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
        entity.speak(`-${damage}`, 900);
        return entity;
    }

    applyDied(creatureId: string): GameEntity | undefined {
        const entity = this.entities.get(creatureId);
        if (!entity) return undefined;
        entity.combatHealth = 0;
        entity.isDead = true;
        entity.setState('idle');
        this.visuals.delete(creatureId);
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
        entity.isDead = false;
        entity.combatHealth = payload.health;
        entity.combatMaxHealth = payload.maxHealth;
        entity.tileX = payload.tileX;
        entity.tileY = payload.tileY;
        entity.worldZ = payload.z;
        entity.worldX = payload.tileX * TILE_SIZE;
        entity.worldY = payload.tileY * TILE_SIZE;
        entity.stepDestTileX = undefined;
        entity.stepDestTileY = undefined;
        entity.setState('idle');
        entity.isChasing = false;
        this.visuals.delete(payload.creatureId);
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

        entity.worldZ = snap.z;
        entity.setDirection(mapDirection(snap.direction));

        const destX = snap.tileX * TILE_SIZE;
        const destY = snap.tileY * TILE_SIZE;
        const atDest =
            Math.abs(entity.worldX - destX) < 0.5 && Math.abs(entity.worldY - destY) < 0.5;

        if (atDest) {
            entity.tileX = snap.tileX;
            entity.tileY = snap.tileY;
            entity.worldX = destX;
            entity.worldY = destY;
            entity.stepDestTileX = undefined;
            entity.stepDestTileY = undefined;
            this.visuals.delete(snap.creatureId);
            this.chaseActiveUntil.delete(snap.creatureId);
            entity.isChasing = false;
            entity.setState('idle');
            return;
        }

        entity.stepDestTileX = snap.tileX;
        entity.stepDestTileY = snap.tileY;
        this.startMoveVisual(
            snap.creatureId,
            entity.worldX,
            entity.worldY,
            destX,
            destY,
            stepDurationMs,
            nowMs
        );
    }

    tick(nowMs: number): void {
        for (const [id, entity] of this.entities.entries()) {
            const visual = this.visuals.get(id);
            if (visual?.moving) {
                const elapsed = nowMs - visual.moveStartedAt;
                const t = Math.min(1, elapsed / visual.moveDurationMs);
                entity.worldX = visual.fromX + (visual.toX - visual.fromX) * t;
                entity.worldY = visual.fromY + (visual.toY - visual.fromY) * t;
                if (t >= 1) {
                    entity.worldX = visual.toX;
                    entity.worldY = visual.toY;
                    entity.tileX = Math.floor(visual.toX / TILE_SIZE);
                    entity.tileY = Math.floor(visual.toY / TILE_SIZE);
                    entity.stepDestTileX = undefined;
                    entity.stepDestTileY = undefined;
                    visual.moving = false;
                }
            }

            this.syncChaseVisualState(id, entity, visual, nowMs);
            entity.update(nowMs, visual?.moveDurationMs);
        }
    }

    clear(): void {
        this.entities.clear();
        this.visuals.clear();
        this.chaseActiveUntil.clear();
        this.loading.clear();
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
        this.applyCombatState(entity, snap);

        const targetX = snap.tileX * TILE_SIZE;
        const targetY = snap.tileY * TILE_SIZE;

        if (!animateMove || (prevX === snap.tileX && prevY === snap.tileY)) {
            entity.tileX = snap.tileX;
            entity.tileY = snap.tileY;
            entity.worldX = targetX;
            entity.worldY = targetY;
            entity.stepDestTileX = undefined;
            entity.stepDestTileY = undefined;
            if (!entity.isDead) {
                entity.setState('idle');
            }
            this.visuals.delete(snap.creatureId);
            return;
        }

        entity.stepDestTileX = snap.tileX;
        entity.stepDestTileY = snap.tileY;
        this.startMoveVisual(
            snap.creatureId,
            entity.worldX,
            entity.worldY,
            targetX,
            targetY,
            snap.stepDurationMs ?? MONSTER_STEP_MS,
            nowMs
        );
    }

    /** Mantém walk entre passos durante perseguição; idle só quando a perseguição termina. */
    private syncChaseVisualState(
        id: string,
        entity: GameEntity,
        visual: CreatureVisualState | undefined,
        nowMs: number
    ): void {
        if (entity.isDead) return;

        const moving = Boolean(visual?.moving);
        const chaseUntil = this.chaseActiveUntil.get(id);
        const chasing = moving || (chaseUntil !== undefined && nowMs < chaseUntil);

        entity.isChasing = chasing;
        if (chasing) {
            entity.setState('walk');
            return;
        }

        if (chaseUntil !== undefined) {
            this.chaseActiveUntil.delete(id);
        }
        entity.setState('idle');
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
        this.applyCombatState(entity, snap);
        void entity.animController.loadImage();
        return entity;
    }

    private applyCombatState(entity: GameEntity, snap: CreatureSnapshot): void {
        if (snap.maxHealth !== undefined) {
            entity.combatMaxHealth = snap.maxHealth;
        }
        if (snap.health !== undefined) {
            entity.combatHealth = snap.health;
        }
        if (snap.isDead !== undefined) {
            entity.isDead = snap.isDead;
            if (snap.isDead) {
                entity.setState('idle');
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

    private startMoveVisual(
        id: string,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        durationMs: number,
        nowMs: number
    ): void {
        this.chaseActiveUntil.set(id, nowMs + CHASE_IDLE_GRACE_MS);
        this.visuals.set(id, {
            fromX,
            fromY,
            toX,
            toY,
            moveStartedAt: nowMs,
            moveDurationMs: Math.max(16, durationMs),
            moving: true,
        });
    }
}
