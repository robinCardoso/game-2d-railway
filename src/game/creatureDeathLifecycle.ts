import type { GameEntity } from '../character/entity';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import {
    estimateCorpseVisibleMs,
    MONSTER_CORPSE_MIN_MS,
    MONSTER_RESPAWN_MS,
} from '../../shared/creatureDeath';
import { armMonsterWakeDelay } from '../../shared/creatureChase';

function hasAnimation(config: CharacterSpriteConfig, key: string): boolean {
    return Boolean(config.animations[key]);
}

function resolveDeathAnimation(entity: GameEntity): { state: 'dead' | 'idle'; durationMs: number } {
    const ctrl = entity.animController;
    const dir = ctrl.currentDirection;
    const deadKey = `dead_${dir}`;

    if (hasAnimation(ctrl.config, deadKey)) {
        const anim = ctrl.config.animations[deadKey]!;
        return {
            state: 'dead',
            durationMs: Math.ceil((anim.frames / Math.max(1, anim.speedFps)) * 1000),
        };
    }

    for (const fallbackDir of ['down', 'left', 'right', 'up'] as const) {
        const key = `dead_${fallbackDir}`;
        if (hasAnimation(ctrl.config, key)) {
            ctrl.setDirection(fallbackDir);
            const anim = ctrl.config.animations[key]!;
            return {
                state: 'dead',
                durationMs: Math.ceil((anim.frames / Math.max(1, anim.speedFps)) * 1000),
            };
        }
    }

    return { state: 'idle', durationMs: MONSTER_CORPSE_MIN_MS };
}

/** Inicia morte: para IA/movimento, tenta outfit `dead_*`, marca timestamps. */
export function beginCreatureDeath(entity: GameEntity, nowMs: number): void {
    if (entity.isDead && entity.deathAtMs !== undefined) return;
    entity.isDead = true;
    entity.deathAtMs = nowMs;
    entity.corpseHidden = false;
    entity.isChasing = false;
    entity.stepDestTileX = undefined;
    entity.stepDestTileY = undefined;
    entity.reactAfterMs = undefined;

    const deathAnim = resolveDeathAnimation(entity);
    entity.corpseVisibleUntilMs = nowMs + estimateCorpseVisibleMs(deathAnim);
    entity.respawnAtMs = nowMs + MONSTER_RESPAWN_MS;
    entity.setState(deathAnim.state);
    entity.animController.onAnimationEndCallback = undefined;
}

export function getCreatureRespawnAtMs(entity: GameEntity): number | undefined {
    return entity.respawnAtMs;
}

export function shouldDrawCreatureCorpse(entity: GameEntity, nowMs: number): boolean {
    if (!entity.isDead) return true;
    if (entity.corpseHidden) return false;
    const until = entity.corpseVisibleUntilMs ?? entity.deathAtMs;
    if (until === undefined) return false;
    return nowMs < until;
}

/** Atualiza animação do corpo; retorna false quando o corpo deve sumir. */
export function tickCreatureCorpse(entity: GameEntity, nowMs: number): boolean {
    if (!entity.isDead) return true;

    if (shouldDrawCreatureCorpse(entity, nowMs)) {
        entity.update(nowMs);
        return true;
    }

    entity.corpseHidden = true;
    return false;
}

/** Respawn local (offline) no ponto de spawn original. */
export function respawnCreatureAtSpawn(entity: GameEntity, nowMs: number, tileSize: number): void {
    entity.isDead = false;
    entity.corpseHidden = false;
    entity.deathAtMs = undefined;
    entity.corpseVisibleUntilMs = undefined;
    entity.respawnAtMs = undefined;
    entity.tileX = entity.spawnX;
    entity.tileY = entity.spawnY;
    entity.syncWorldToTile(tileSize);
    entity.combatHealth = entity.combatMaxHealth;
    entity.isChasing = false;
    entity.lastAggroMoveTime = 0;
    entity.lastSeenPlayerTileX = undefined;
    entity.lastSeenPlayerTileY = undefined;
    entity.reactAfterMs = undefined;
    entity.wakeUntilMs = undefined;
    entity.stepDestTileX = undefined;
    entity.stepDestTileY = undefined;
    entity.setState('idle');
    entity.animController.onAnimationEndCallback = undefined;
    armMonsterWakeDelay(entity, nowMs);
    entity.update(nowMs);
}

export function tickOfflineMonsterDeathAndRespawn(
    npcs: GameEntity[],
    nowMs: number,
    tileSize: number
): void {
    for (const npc of npcs) {
        if (npc.type !== 'monster' || !npc.isDead) continue;

        tickCreatureCorpse(npc, nowMs);

        const respawnAt = npc.respawnAtMs;
        if (respawnAt !== undefined && nowMs >= respawnAt) {
            respawnCreatureAtSpawn(npc, nowMs, tileSize);
        }
    }
}
