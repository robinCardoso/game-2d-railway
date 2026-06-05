import { ENGINE_CONFIG } from '../engine/config';
import type { RemotePlayerDepthEntry } from '../engine/depthSortDraw';
import type { PlayerSnapshot } from '../../shared/protocol';
import { SpriteAnimationController } from '../character/spriteAnimation';
import {
    DIAGONAL_STEP_DURATION_FACTOR,
    DEFAULT_GRID_STEP_DURATION_MS,
} from '../movement/gridMovement';
import {
    loadOutfitSpriteConfig,
    protocolDirectionToSprite,
} from '../world/playerAppearance';

const TILE_SIZE = ENGINE_CONFIG.TILE_SIZE;

/** Duração do deslize visual entre tiles (autoridade continua discreta no servidor). */
const REMOTE_STEP_DURATION_MS = Math.max(DEFAULT_GRID_STEP_DURATION_MS, 200);

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
    controller: SpriteAnimationController;
};

/**
 * Estado visual dos jogadores remotos: interpolação entre SQMs + walk/idle.
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
                    state.controller.setState('idle');
                }
            }

            const stepDuration = state.moving ? state.moveDurationMs : undefined;
            state.controller.update(nowMs, stepDuration);
        }
    }

    clear(): void {
        this.states.clear();
        this.loading.clear();
    }

    private applyNetworkPosition(
        state: RemoteVisualState,
        player: PlayerSnapshot,
        nowMs: number
    ): void {
        const dir = protocolDirectionToSprite(player.direction);
        state.controller.setDirection(dir);

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
        const duration = isDiagonal
            ? REMOTE_STEP_DURATION_MS * DIAGONAL_STEP_DURATION_FACTOR
            : REMOTE_STEP_DURATION_MS;

        state.fromX = state.visualX;
        state.fromY = state.visualY;
        state.toX = targetWorldX;
        state.toY = targetWorldY;
        state.tileX = player.tileX;
        state.tileY = player.tileY;
        state.z = player.z;
        state.moveStartedAt = nowMs;
        state.moveDurationMs = duration;
        state.moving = true;
        state.controller.setState('walk');
    }

    private createState(
        player: PlayerSnapshot,
        controller: SpriteAnimationController
    ): RemoteVisualState {
        const worldX = player.tileX * TILE_SIZE;
        const worldY = player.tileY * TILE_SIZE;
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
