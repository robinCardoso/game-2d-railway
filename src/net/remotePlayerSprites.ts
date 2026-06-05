import { ENGINE_CONFIG } from '../engine/config';
import type { RemotePlayerDepthEntry } from '../engine/depthSortDraw';
import { parseStepDurationMs, type PlayerSnapshot } from '../../shared/protocol';
import { SpriteAnimationController } from '../character/spriteAnimation';
import { DIAGONAL_STEP_DURATION_FACTOR } from '../movement/gridMovement';
import {
    loadOutfitSpriteConfig,
    protocolDirectionToSprite,
} from '../world/playerAppearance';

const TILE_SIZE = ENGINE_CONFIG.TILE_SIZE;

/** Fallback quando ainda não há histórico de pacotes. */
const REMOTE_STEP_DURATION_MS = 240;
const MIN_REMOTE_STEP_MS = 160;
const MAX_REMOTE_STEP_MS = 320;
/** Compensa latência de rede sobre o intervalo medido entre `player_moved`. */
const REMOTE_SMOOTHING_EXTRA_MS = 40;
/** Mantém walk após chegar no tile, esperando o próximo passo (evita “anda → trava”). */
const REMOTE_IDLE_GRACE_MS = 120;
/** Máximo com diagonal (√2 × MAX_REMOTE_STEP_MS). */
const MAX_REMOTE_STEP_WITH_DIAG_MS = 600;

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

type RemoteVisualState = {
    playerId: string;
    tileX: number;
    tileY: number;
    z: number;
    visualX: number;
    visualY: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    moveStartedAt: number;
    moveDurationMs: number;
    moving: boolean;
    /** Momento em que pode voltar a idle (após grace). */
    idleAfterMs: number;
    /** Timestamp do último pacote de movimento recebido. */
    lastMovePacketAt: number;
    controller: SpriteAnimationController;
};

/**
 * Estado visual dos jogadores remotos: interpolação entre SQMs + walk/idle contínuo.
 * O servidor manda tile discreto; o cliente suaviza o deslize e anima a outfit.
 */
export class RemotePlayerSpriteManager {
    private readonly states = new Map<string, RemoteVisualState>();
    private readonly loading = new Set<string>();

    sync(players: PlayerSnapshot[]): void {
        const nowMs = performance.now();
        const activeIds = new Set<string>();

        for (const player of players) {
            activeIds.add(player.playerId);
            void this.ensurePlayer(player);
            const state = this.states.get(player.playerId);
            if (state) {
                this.applyNetworkPosition(state, player, nowMs);
            }
        }

        for (const id of this.states.keys()) {
            if (!activeIds.has(id)) {
                this.states.delete(id);
            }
        }
    }

    buildRemoteDepthEntries(players: PlayerSnapshot[]): RemotePlayerDepthEntry[] {
        return players.map((player) => {
            const state = this.states.get(player.playerId);
            const fallbackX = player.tileX * TILE_SIZE;
            const fallbackY = player.tileY * TILE_SIZE;
            return {
                tileX: player.tileX,
                tileY: player.tileY,
                z: player.z,
                name: player.name,
                direction: player.direction,
                controller: state?.controller,
                worldX: state?.visualX ?? fallbackX,
                worldY: state?.visualY ?? fallbackY,
            };
        });
    }

    tick(nowMs: number): void {
        for (const state of this.states.values()) {
            if (state.moving) {
                const elapsed = nowMs - state.moveStartedAt;
                const t = Math.min(1, elapsed / state.moveDurationMs);
                state.visualX = state.fromX + (state.toX - state.fromX) * t;
                state.visualY = state.fromY + (state.toY - state.fromY) * t;

                if (t >= 1) {
                    state.visualX = state.toX;
                    state.visualY = state.toY;
                    state.moving = false;
                }
            }

            const walking = state.moving || nowMs < state.idleAfterMs;
            if (walking) {
                state.controller.setState('walk');
            } else if (nowMs >= state.idleAfterMs) {
                state.controller.setState('idle');
            }

            const stepDuration = walking ? state.moveDurationMs : undefined;
            state.controller.update(nowMs, stepDuration);
        }
    }

    clear(): void {
        this.states.clear();
        this.loading.clear();
    }

    private estimateStepDuration(state: RemoteVisualState, nowMs: number, isDiagonal: boolean): number {
        const packetInterval =
            state.lastMovePacketAt > 0 ? nowMs - state.lastMovePacketAt : REMOTE_STEP_DURATION_MS;
        const base = clamp(
            packetInterval + REMOTE_SMOOTHING_EXTRA_MS,
            MIN_REMOTE_STEP_MS,
            MAX_REMOTE_STEP_MS
        );
        return isDiagonal ? base * DIAGONAL_STEP_DURATION_FACTOR : base;
    }

    private applyNetworkPosition(
        state: RemoteVisualState,
        player: PlayerSnapshot,
        nowMs: number
    ): void {
        state.controller.setDirection(protocolDirectionToSprite(player.direction));

        const targetWorldX = player.tileX * TILE_SIZE;
        const targetWorldY = player.tileY * TILE_SIZE;
        const tileChanged =
            player.tileX !== state.tileX ||
            player.tileY !== state.tileY ||
            player.z !== state.z;

        if (!tileChanged) {
            return;
        }

        const dx = Math.abs(player.tileX - state.tileX);
        const dy = Math.abs(player.tileY - state.tileY);
        const isDiagonal = dx === 1 && dy === 1;
        const fromServer = parseStepDurationMs(player.stepDurationMs);
        const duration =
            fromServer !== undefined
                ? clamp(fromServer, MIN_REMOTE_STEP_MS, MAX_REMOTE_STEP_WITH_DIAG_MS)
                : this.estimateStepDuration(state, nowMs, isDiagonal);

        state.fromX = state.visualX;
        state.fromY = state.visualY;
        state.toX = targetWorldX;
        state.toY = targetWorldY;
        state.tileX = player.tileX;
        state.tileY = player.tileY;
        state.z = player.z;
        state.moveStartedAt = nowMs;
        state.moveDurationMs = duration;
        state.lastMovePacketAt = nowMs;
        state.idleAfterMs = nowMs + duration + REMOTE_IDLE_GRACE_MS;
        state.moving = true;
    }

    private createState(
        player: PlayerSnapshot,
        controller: SpriteAnimationController
    ): RemoteVisualState {
        const worldX = player.tileX * TILE_SIZE;
        const worldY = player.tileY * TILE_SIZE;
        const nowMs = performance.now();
        controller.setDirection(protocolDirectionToSprite(player.direction));
        controller.setState('idle');

        return {
            playerId: player.playerId,
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.z,
            visualX: worldX,
            visualY: worldY,
            fromX: worldX,
            fromY: worldY,
            toX: worldX,
            toY: worldY,
            moveStartedAt: 0,
            moveDurationMs: REMOTE_STEP_DURATION_MS,
            moving: false,
            idleAfterMs: nowMs,
            lastMovePacketAt: 0,
            controller,
        };
    }

    private async ensurePlayer(player: PlayerSnapshot): Promise<void> {
        if (!player.appearance) return;

        const existing = this.states.get(player.playerId);
        const sheet = player.appearance.spriteSheetUrl.replace(/^\//, '');

        if (existing) {
            const currentSheet = existing.controller.config.spriteSheetUrl.replace(/^\//, '');
            if (currentSheet === sheet) {
                return;
            }
            this.states.delete(player.playerId);
        }

        if (this.loading.has(player.playerId)) return;

        this.loading.add(player.playerId);
        try {
            const config = await loadOutfitSpriteConfig(player.appearance, player.name);
            const ctrl = new SpriteAnimationController(config);
            this.states.set(player.playerId, this.createState(player, ctrl));
        } catch (err) {
            console.warn('[RemotePlayerSprites] falha ao carregar outfit:', player.name, err);
        } finally {
            this.loading.delete(player.playerId);
        }
    }
}
