import { ENGINE_CONFIG } from '../engine/config';
import type { CreatureSnapshot } from '../../shared/protocol';
import { MONSTER_STEP_MS } from '../../shared/creatureChase';
import { GameEntity } from '../character/entity';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import { createCreatureConfigForSpawn } from '../character/creatureConfigs';
import { resolveCreatureCombatStats } from '../game/creatureCombatStats';
import { getCreaturePreset } from '../editor/creaturePresets';
import { protocolDirectionToSprite } from '../world/playerAppearance';
import {
    beginCreatureDeath,
    refreshCreatureDeathVisual,
    respawnCreatureAtSpawn,
    tickCreatureCorpse,
} from '../game/creatureDeathLifecycle';
import { creatureVisualDesyncPx, logCreatureSync } from './creatureSyncDebug';
import {
    createNetworkMotionBuffer,
    pushNetworkMotionSegment,
    sampleNetworkMotion,
    snapNetworkMotionBuffer,
    type NetworkMotionBuffer,
} from '../../shared/networkMotionBuffer';

const { TILE_SIZE } = ENGINE_CONFIG;

const CHASE_IDLE_GRACE_MS = 80;
const MAX_CATCHUP_LAG_TILES = 5;

/** Tile do último passo de rede aceito (paridade RemotePlayerSpriteManager.state.tileX). */
type NetworkCommittedTile = { tileX: number; tileY: number };

type CreatureSlide = {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startedAtMs: number;
    durationMs: number;
    active: boolean;
    queued?: Array<{
        toX: number;
        toY: number;
        durationMs: number;
        direction?: CreatureSnapshot['direction'];
    }>;
};

type ServerCreatureTile = {
    tileX: number;
    tileY: number;
    z: number;
    direction?: CreatureSnapshot['direction'];
    stepDurationMs: number;
};

function mapDirection(dir?: CreatureSnapshot['direction']): 'up' | 'down' | 'left' | 'right' {
    if (!dir) return 'down';
    return protocolDirectionToSprite(dir);
}

function tileManhattanDelta(fromX: number, fromY: number, toX: number, toY: number): number {
    return Math.abs(toX - fromX) + Math.abs(toY - fromY);
}

function visualTileOf(entity: GameEntity): { tileX: number; tileY: number } {
    return {
        tileX: Math.round(entity.worldX / TILE_SIZE),
        tileY: Math.round(entity.worldY / TILE_SIZE),
    };
}

function directionForCardinalStep(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): CreatureSnapshot['direction'] {
    if (toX > fromX) return 'east';
    if (toX < fromX) return 'west';
    if (toY > fromY) return 'south';
    if (toY < fromY) return 'north';
    return 'south';
}

function pickNextCardinalStepToward(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): { tileX: number; tileY: number } | null {
    if (fromX === toX && fromY === toY) return null;
    if (fromX !== toX) {
        return { tileX: fromX + Math.sign(toX - fromX), tileY: fromY };
    }
    return { tileX: fromX, tileY: fromY + Math.sign(toY - fromY) };
}

function snapEntityToTile(entity: GameEntity, tileX: number, tileY: number): void {
    entity.tileX = tileX;
    entity.tileY = tileY;
    entity.worldX = tileX * TILE_SIZE;
    entity.worldY = tileY * TILE_SIZE;
    entity.stepDestTileX = undefined;
    entity.stepDestTileY = undefined;
}

function faceMotionDelta(
    entity: GameEntity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
        entity.setDirection(dx > 0 ? 'right' : 'left');
    } else {
        entity.setDirection(dy > 0 ? 'down' : 'up');
    }
}

function faceFromWorldDeltaOrServer(
    entity: GameEntity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    serverDirection?: CreatureSnapshot['direction']
): void {
    faceMotionDelta(entity, fromX, fromY, toX, toY);
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && serverDirection) {
        entity.setDirection(mapDirection(serverDirection));
    }
}

function isSlideActive(slide: CreatureSlide | undefined): boolean {
    return slide?.active === true;
}

function configHasDeathAnimations(config: CharacterSpriteConfig): boolean {
    return Object.keys(config.animations).some((key) => key.startsWith('dead_'));
}

function applySpriteConfigToEntity(entity: GameEntity, config: CharacterSpriteConfig): void {
    const ctrl = entity.animController;
    const prevSheet = ctrl.config.spriteSheetUrl.replace(/^\//, '');
    const nextSheet = config.spriteSheetUrl.replace(/^\//, '');
    ctrl.config = { ...config, name: entity.name };
    if (nextSheet !== prevSheet) {
        ctrl.loadImage();
    }
}

function ensureEntityPresetConfig(entity: GameEntity): void {
    const fresh = createCreatureConfigForSpawn(entity.name);
    if (!configHasDeathAnimations(fresh)) return;
    if (configHasDeathAnimations(entity.animController.config)) return;
    applySpriteConfigToEntity(entity, fresh);
}

/**
 * Criaturas online — 1 tile por deslize (stepDurationMs do servidor, default 300 ms), meta sempre atualizada.
 * Pacotes durante deslize só atualizam a meta; o próximo passo começa ao chegar no SQM.
 */
export class ServerCreatureSync {
    private readonly entities = new Map<string, GameEntity>();
    private readonly slides = new Map<string, CreatureSlide>();
    private readonly serverTiles = new Map<string, ServerCreatureTile>();
    private readonly stepDurationMs = new Map<string, number>();
    private readonly chaseActiveUntil = new Map<string, number>();
    private readonly networkCommitted = new Map<string, NetworkCommittedTile>();
    private readonly motionBuffers = new Map<string, NetworkMotionBuffer>();
    private readonly loading = new Set<string>();

    isActive(): boolean {
        return this.entities.size > 0;
    }

    getEntities(): GameEntity[] {
        return [...this.entities.values()];
    }

    /** Tile autoritativo do servidor — ignora interpolação visual durante deslize. */
    getAuthoritativeTile(creatureId: string): { tileX: number; tileY: number; z: number } | null {
        const server = this.serverTiles.get(creatureId);
        if (server) {
            return { tileX: server.tileX, tileY: server.tileY, z: server.z };
        }
        const entity = this.entities.get(creatureId);
        if (!entity) return null;
        return { tileX: entity.tileX, tileY: entity.tileY, z: entity.worldZ };
    }

    applySync(creatures: CreatureSnapshot[], mapId: string, instanceId?: string): void {
        const activeIds = new Set<string>();
        const nowMs = performance.now();

        for (const snap of creatures) {
            if (snap.mapId !== mapId) continue;
            if ((snap.instanceId ?? undefined) !== (instanceId ?? undefined)) continue;
            if (snap.creatureType !== 'monster') continue;

            activeIds.add(snap.creatureId);
            this.upsertFromSnapshot(snap, nowMs);
        }

        for (const id of this.entities.keys()) {
            if (!activeIds.has(id)) {
                this.entities.delete(id);
                this.slides.delete(id);
                this.serverTiles.delete(id);
                this.stepDurationMs.delete(id);
                this.chaseActiveUntil.delete(id);
                this.networkCommitted.delete(id);
            }
        }
    }

    applyDamaged(
        creatureId: string,
        health: number,
        maxHealth: number,
        damage: number,
        options?: { showFloatingDamage?: boolean }
    ): GameEntity | undefined {
        const entity = this.entities.get(creatureId);
        if (!entity) return undefined;
        entity.combatMaxHealth = maxHealth;
        entity.combatHealth = health;
        if (options?.showFloatingDamage !== false) {
            entity.spawnFloatingDamage(damage, performance.now());
        }
        const server = this.serverTiles.get(creatureId);
        const desync = creatureVisualDesyncPx(
            entity.worldX,
            entity.worldY,
            server?.tileX ?? entity.tileX,
            server?.tileY ?? entity.tileY,
            TILE_SIZE
        );
        logCreatureSync('creature_damaged', creatureId, {
            health,
            maxHealth,
            damage,
            tileX: entity.tileX,
            tileY: entity.tileY,
            worldX: entity.worldX,
            worldY: entity.worldY,
            desyncPx: desync.max,
        });
        return entity;
    }

    /** Ataque não conectou no mob (servidor rejeitou ou bloqueio total). */
    applyAttackMiss(creatureId: string, nowMs: number = performance.now()): GameEntity | undefined {
        const entity = this.entities.get(creatureId);
        if (!entity || entity.isDead) return undefined;
        entity.spawnFloatingDamage(0, nowMs);
        return entity;
    }

    applyDied(
        creatureId: string,
        tile: { tileX: number; tileY: number; z: number }
    ): GameEntity | undefined {
        const entity = this.entities.get(creatureId);
        if (!entity) return undefined;

        const before = creatureVisualDesyncPx(
            entity.worldX,
            entity.worldY,
            tile.tileX,
            tile.tileY,
            TILE_SIZE
        );
        logCreatureSync('creature_died', creatureId, {
            authTileX: tile.tileX,
            authTileY: tile.tileY,
            authZ: tile.z,
            clientTileX: entity.tileX,
            clientTileY: entity.tileY,
            worldX: entity.worldX,
            worldY: entity.worldY,
            desyncPx: before.max,
        });

        entity.combatHealth = 0;
        this.slides.delete(creatureId);
        this.serverTiles.delete(creatureId);
        this.networkCommitted.delete(creatureId);
        snapEntityToTile(entity, tile.tileX, tile.tileY);
        entity.worldZ = tile.z;
        ensureEntityPresetConfig(entity);
        beginCreatureDeath(entity, performance.now());
        this.stepDurationMs.delete(creatureId);
        this.chaseActiveUntil.delete(creatureId);

        logCreatureSync('applyDied_snap', creatureId, {
            tileX: entity.tileX,
            tileY: entity.tileY,
            worldX: entity.worldX,
            worldY: entity.worldY,
            desyncPx: 0,
        });
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
        this.slides.delete(payload.creatureId);
        this.networkCommitted.set(payload.creatureId, {
            tileX: payload.tileX,
            tileY: payload.tileY,
        });
        this.serverTiles.set(payload.creatureId, {
            tileX: payload.tileX,
            tileY: payload.tileY,
            z: payload.z,
            stepDurationMs: MONSTER_STEP_MS,
        });
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
        if (!entity || entity.isDead || entity.combatHealth <= 0) return;

        const duration = Math.max(16, stepDurationMs);
        entity.worldZ = snap.z;

        this.serverTiles.set(snap.creatureId, {
            tileX: snap.tileX,
            tileY: snap.tileY,
            z: snap.z,
            direction: snap.direction,
            stepDurationMs: duration,
        });

        const committed =
            this.networkCommitted.get(snap.creatureId) ??
            (() => {
                const foot = visualTileOf(entity);
                return { tileX: foot.tileX, tileY: foot.tileY };
            })();

        const tileChanged =
            snap.tileX !== committed.tileX || snap.tileY !== committed.tileY;

        if (!tileChanged) {
            const slide = this.slides.get(snap.creatureId);
            if (isSlideActive(slide)) {
                slide!.durationMs = duration;
            } else {
                const visual = visualTileOf(entity);
                if (visual.tileX === snap.tileX && visual.tileY === snap.tileY) {
                    entity.setDirection(mapDirection(snap.direction));
                }
            }
            return;
        }

        const targetWorldX = snap.tileX * TILE_SIZE;
        const targetWorldY = snap.tileY * TILE_SIZE;
        const stepLag = tileManhattanDelta(
            committed.tileX,
            committed.tileY,
            snap.tileX,
            snap.tileY
        );

        if (stepLag > MAX_CATCHUP_LAG_TILES) {
            this.slides.delete(snap.creatureId);
            snapEntityToTile(entity, snap.tileX, snap.tileY);
            entity.worldZ = snap.z;
            entity.setDirection(mapDirection(snap.direction));
            this.networkCommitted.set(snap.creatureId, {
                tileX: snap.tileX,
                tileY: snap.tileY,
            });
            logCreatureSync('creature_moved', snap.creatureId, {
                tileX: snap.tileX,
                tileY: snap.tileY,
                worldX: entity.worldX,
                worldY: entity.worldY,
                snapped: true,
                stepLag,
            });
            return;
        }

        const slide = this.slides.get(snap.creatureId);
        const retargeted = isSlideActive(slide);

        if (
            retargeted &&
            slide!.toX === targetWorldX &&
            slide!.toY === targetWorldY
        ) {
            slide!.durationMs = duration;
            this.networkCommitted.set(snap.creatureId, {
                tileX: snap.tileX,
                tileY: snap.tileY,
            });
            return;
        }

        const fromX = entity.worldX;
        const fromY = entity.worldY;
        const slideDuration = duration * Math.max(1, stepLag);

        if (retargeted) {
            if (!slide!.queued) slide!.queued = [];
            slide!.queued.push({
                toX: targetWorldX,
                toY: targetWorldY,
                durationMs: slideDuration,
                direction: snap.direction
            });
        } else {
            this.slides.set(snap.creatureId, {
                fromX,
                fromY,
                toX: targetWorldX,
                toY: targetWorldY,
                startedAtMs: nowMs,
                durationMs: slideDuration,
                active: true,
            });
            pushNetworkMotionSegment(
                this.ensureMotionBuffer(snap.creatureId),
                fromX,
                fromY,
                targetWorldX,
                targetWorldY,
                nowMs,
                slideDuration
            );
        }

        entity.tileX = snap.tileX;
        entity.tileY = snap.tileY;
        entity.worldZ = snap.z;
        entity.stepDestTileX = snap.tileX;
        entity.stepDestTileY = snap.tileY;
        faceFromWorldDeltaOrServer(
            entity,
            fromX,
            fromY,
            targetWorldX,
            targetWorldY,
            snap.direction
        );
        this.stepDurationMs.set(snap.creatureId, slideDuration);
        this.chaseActiveUntil.set(
            snap.creatureId,
            nowMs + slideDuration + CHASE_IDLE_GRACE_MS
        );
        this.networkCommitted.set(snap.creatureId, {
            tileX: snap.tileX,
            tileY: snap.tileY,
        });

        logCreatureSync('creature_moved', snap.creatureId, {
            tileX: snap.tileX,
            tileY: snap.tileY,
            worldX: entity.worldX,
            worldY: entity.worldY,
            retargeted,
            stepLag,
            desyncPx: creatureVisualDesyncPx(
                entity.worldX,
                entity.worldY,
                snap.tileX,
                snap.tileY,
                TILE_SIZE
            ).max,
        });
    }

    getMaxVisualDesyncPx(): number {
        let max = 0;
        for (const entity of this.entities.values()) {
            if (entity.isDead) continue;
            const server = this.serverTiles.get(entity.id);
            const refX = server?.tileX ?? entity.tileX;
            const refY = server?.tileY ?? entity.tileY;
            const { max: d } = creatureVisualDesyncPx(
                entity.worldX,
                entity.worldY,
                refX,
                refY,
                TILE_SIZE
            );
            max = Math.max(max, d);
        }
        return max;
    }

    tick(nowMs: number, renderDelayMs = 0): void {

        for (const [id, entity] of this.entities.entries()) {
            if (entity.isDead) {
                tickCreatureCorpse(entity, nowMs);
                continue;
            }

            const slide = this.slides.get(id);
            const duration = this.stepDurationMs.get(id) ?? MONSTER_STEP_MS;
            let sliding = false;

            if (isSlideActive(slide)) {
                const elapsed = nowMs - slide!.startedAtMs;
                const t = Math.min(1, elapsed / slide!.durationMs);
                sliding = t < 1;

                if (renderDelayMs > 0) {
                    const buf = this.ensureMotionBuffer(id);
                    const sample = sampleNetworkMotion(
                        buf,
                        nowMs - renderDelayMs,
                        entity.worldX,
                        entity.worldY
                    );
                    entity.worldX = sample.x;
                    entity.worldY = sample.y;
                    sliding = sample.moving || t < 1;
                } else {
                    entity.worldX = slide!.fromX + (slide!.toX - slide!.fromX) * t;
                    entity.worldY = slide!.fromY + (slide!.toY - slide!.fromY) * t;
                }

                faceMotionDelta(entity, slide!.fromX, slide!.fromY, slide!.toX, slide!.toY);

                if (t >= 1) {
                    if (renderDelayMs <= 0) {
                        entity.worldX = slide!.toX;
                        entity.worldY = slide!.toY;
                    }
                    
                    if (slide!.queued && slide!.queued.length > 0) {
                        const { toX, toY, durationMs, direction } = slide!.queued.shift()!;
                        slide!.fromX = slide!.toX;
                        slide!.fromY = slide!.toY;
                        slide!.toX = toX;
                        slide!.toY = toY;
                        
                        slide!.startedAtMs = nowMs;
                        
                        slide!.durationMs = durationMs;
                        
                        if (slide!.queued.length > 0) {
                            slide!.durationMs /= 1.5;
                        }

                        if (renderDelayMs > 0) {
                            pushNetworkMotionSegment(
                                this.ensureMotionBuffer(id),
                                slide!.fromX,
                                slide!.fromY,
                                slide!.toX,
                                slide!.toY,
                                nowMs,
                                slide!.durationMs
                            );
                        }
                        
                        faceFromWorldDeltaOrServer(
                            entity,
                            slide!.fromX,
                            slide!.fromY,
                            slide!.toX,
                            slide!.toY,
                            direction
                        );
                        
                        const newElapsed = nowMs - slide!.startedAtMs;
                        if (newElapsed > 0 && renderDelayMs <= 0) {
                            const newT = Math.min(1, newElapsed / slide!.durationMs);
                            entity.worldX = slide!.fromX + (slide!.toX - slide!.fromX) * newT;
                            entity.worldY = slide!.fromY + (slide!.toY - slide!.fromY) * newT;
                        }
                    } else {
                        slide!.active = false;
                        entity.stepDestTileX = undefined;
                        entity.stepDestTileY = undefined;
                        this.catchUpTowardServerIfNeeded(entity, id, nowMs);
                    }
                }
            }

            const server = this.serverTiles.get(id);
            const visual = visualTileOf(entity);
            const behindServer =
                server !== undefined &&
                (visual.tileX !== server.tileX || visual.tileY !== server.tileY);
            const chaseUntil = this.chaseActiveUntil.get(id);
            const chasing =
                sliding ||
                behindServer ||
                isSlideActive(slide) ||
                (chaseUntil !== undefined && nowMs < chaseUntil);

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
        this.slides.clear();
        this.serverTiles.clear();
        this.stepDurationMs.clear();
        this.chaseActiveUntil.clear();
        this.networkCommitted.clear();
        this.motionBuffers.clear();
        this.loading.clear();
    }

    /** Atualiza JSON/spritesheet das criaturas já instanciadas (ex.: após `loadCreaturePresets`). */
    reloadSpriteConfigsFromPresets(): void {
        for (const entity of this.entities.values()) {
            const fresh = createCreatureConfigForSpawn(entity.name);
            const hadDeath = configHasDeathAnimations(entity.animController.config);
            const hasDeath = configHasDeathAnimations(fresh);
            applySpriteConfigToEntity(entity, fresh);

            if (entity.isDead && !hadDeath && hasDeath) {
                refreshCreatureDeathVisual(entity);
            }
        }
    }

    resetFrameClock(): void {
    }

    snapAllToAuthoritativeTiles(): void {
        const nowMs = performance.now();
        for (const entity of this.entities.values()) {
            if (entity.isDead) continue;
            this.slides.delete(entity.id);
            const server = this.serverTiles.get(entity.id);
            if (server) {
                snapEntityToTile(entity, server.tileX, server.tileY);
                entity.worldZ = server.z;
            } else {
                snapEntityToTile(entity, entity.tileX, entity.tileY);
            }
            snapNetworkMotionBuffer(
                this.ensureMotionBuffer(entity.id),
                entity.worldX,
                entity.worldY,
                nowMs
            );
            this.chaseActiveUntil.delete(entity.id);
            this.networkCommitted.delete(entity.id);
            if (!entity.isDead) {
                entity.setState('idle');
            }
        }
    }

    private ensureMotionBuffer(creatureId: string): NetworkMotionBuffer {
        let buf = this.motionBuffers.get(creatureId);
        if (!buf) {
            buf = createNetworkMotionBuffer();
            this.motionBuffers.set(creatureId, buf);
        }
        return buf;
    }

    /** Se a meta autoritativa ainda está à frente do último passo de rede, continua o deslize. */
    private catchUpTowardServerIfNeeded(
        entity: GameEntity,
        creatureId: string,
        nowMs: number
    ): void {
        if (isSlideActive(this.slides.get(creatureId))) return;

        const server = this.serverTiles.get(creatureId);
        if (!server) return;

        const committed = this.networkCommitted.get(creatureId);
        if (
            committed &&
            committed.tileX === server.tileX &&
            committed.tileY === server.tileY
        ) {
            entity.tileX = server.tileX;
            entity.tileY = server.tileY;
            const visual = visualTileOf(entity);
            if (visual.tileX === server.tileX && visual.tileY === server.tileY && server.direction) {
                entity.setDirection(mapDirection(server.direction));
            }
            return;
        }

        const from = committed ?? visualTileOf(entity);
        const stepLag = tileManhattanDelta(from.tileX, from.tileY, server.tileX, server.tileY);
        if (stepLag === 0) return;

        if (stepLag > MAX_CATCHUP_LAG_TILES) {
            this.slides.delete(creatureId);
            snapEntityToTile(entity, server.tileX, server.tileY);
            entity.worldZ = server.z;
            if (server.direction) {
                entity.setDirection(mapDirection(server.direction));
            }
            this.networkCommitted.set(creatureId, {
                tileX: server.tileX,
                tileY: server.tileY,
            });
            return;
        }

        const next = pickNextCardinalStepToward(
            from.tileX,
            from.tileY,
            server.tileX,
            server.tileY
        );
        if (!next) return;

        const fromX = entity.worldX;
        const fromY = entity.worldY;
        const toX = next.tileX * TILE_SIZE;
        const toY = next.tileY * TILE_SIZE;
        const duration = stepLag > 1 ? server.stepDurationMs / 1.5 : server.stepDurationMs;

        entity.tileX = next.tileX;
        entity.tileY = next.tileY;
        entity.worldZ = server.z;
        entity.stepDestTileX = next.tileX;
        entity.stepDestTileY = next.tileY;

        const dir = directionForCardinalStep(from.tileX, from.tileY, next.tileX, next.tileY);
        faceFromWorldDeltaOrServer(entity, fromX, fromY, toX, toY, dir);

        this.slides.set(creatureId, {
            fromX,
            fromY,
            toX,
            toY,
            startedAtMs: nowMs,
            durationMs: duration,
            active: true,
        });
        pushNetworkMotionSegment(
            this.ensureMotionBuffer(creatureId),
            fromX,
            fromY,
            toX,
            toY,
            nowMs,
            duration
        );
        this.stepDurationMs.set(creatureId, duration);
        this.chaseActiveUntil.set(creatureId, nowMs + duration + CHASE_IDLE_GRACE_MS);
        this.networkCommitted.set(creatureId, { tileX: next.tileX, tileY: next.tileY });
    }

    private upsertFromSnapshot(
        snap: CreatureSnapshot,
        nowMs: number
    ): void {
        let entity = this.entities.get(snap.creatureId);
        const isNew = !entity;
        if (!entity) {
            this.createEntity(snap);
            entity = this.entities.get(snap.creatureId);
            if (!entity) {
                entity = this.buildEntityImmediate(snap);
                this.entities.set(snap.creatureId, entity);
            }
        }

        const duration = snap.stepDurationMs ?? MONSTER_STEP_MS;
        this.serverTiles.set(snap.creatureId, {
            tileX: snap.tileX,
            tileY: snap.tileY,
            z: snap.z,
            direction: snap.direction,
            stepDurationMs: duration,
        });

        entity.worldZ = snap.z;
        this.applyCombatState(entity, snap, nowMs);

        if (isNew) {
            entity.setDirection(mapDirection(snap.direction));
            this.slides.delete(snap.creatureId);
            snapEntityToTile(entity, snap.tileX, snap.tileY);
            this.networkCommitted.set(snap.creatureId, {
                tileX: snap.tileX,
                tileY: snap.tileY,
            });
            if (!entity.isDead) {
                entity.setState('idle');
            }
        } else {
            const visual = visualTileOf(entity);
            const lag = tileManhattanDelta(visual.tileX, visual.tileY, snap.tileX, snap.tileY);
            if (lag > MAX_CATCHUP_LAG_TILES) {
                this.slides.delete(snap.creatureId);
                snapEntityToTile(entity, snap.tileX, snap.tileY);
                this.networkCommitted.set(snap.creatureId, {
                    tileX: snap.tileX,
                    tileY: snap.tileY,
                });
                entity.setDirection(mapDirection(snap.direction));
                if (!entity.isDead) {
                    entity.setState('idle');
                }
            }
        }
    }

    private buildEntityImmediate(snap: CreatureSnapshot): GameEntity {
        const config = createCreatureConfigForSpawn(snap.name);
        if (!configHasDeathAnimations(config)) {
            console.warn(
                `[ServerCreatureSync] Preset incompleto para "${snap.name}" — morte pode não animar. Verifique creature_presets.json.`
            );
        }
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
        this.serverTiles.set(snap.creatureId, {
            tileX: snap.tileX,
            tileY: snap.tileY,
            z: snap.z,
            direction: snap.direction,
            stepDurationMs: MONSTER_STEP_MS,
        });
        this.networkCommitted.set(snap.creatureId, {
            tileX: snap.tileX,
            tileY: snap.tileY,
        });
        snapNetworkMotionBuffer(
            this.ensureMotionBuffer(snap.creatureId),
            entity.worldX,
            entity.worldY,
            performance.now()
        );
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
