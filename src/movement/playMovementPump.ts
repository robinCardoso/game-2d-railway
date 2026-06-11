/**
 * Movement pump — teclas só registram intenção; envio WS é 1 passo por vez com seq+direction8.
 */

import type { Direction8 } from '../../shared/movement/direction8';
import { toProtocolDirection8 } from '../../shared/movement/direction8';
import type { TilePos } from '../../shared/tileWalkable';
import type { ClientMovementPrediction } from './clientMovementPrediction';
import {
    clearPendingFromSeq,
    getPendingPredictionCount,
    recordPredictedMove,
} from './clientMovementPrediction';
import {
    buildMovementKeyState,
    getDestTileForDirection,
    getNetworkStepDurationMs,
    primeMovementFacingKeys,
    tryStartGridStep,
    type GridDirection,
    type GridMovementController,
    type GridPlayerMotion,
    type TileGridDeps,
} from './gridMovement';
import { isBlockedTileCoolingDown } from './blockedMoveTiles';
import { resolveInputDirection8 } from './inputDirection8';
import type { MovementInputBuffer } from './movementInputBuffer';
import { consumeMovementInput, peekMovementInput, pushMovementInput } from './movementInputBuffer';

/** Alinhado com `MOVE_RATE_LIMIT_TOLERANCE` do servidor. */
export const PUMP_SEND_INTERVAL_FACTOR = 0.8;

/**
 * Passos em voo antes de bloquear novo envio (estilo Tibia: cliente pode estar
 * ~1 tile à frente do último ack sem parar a animação).
 */
export const MAX_MOVE_PIPELINE_DEPTH = 2;

export interface MovementPumpNetBridge {
    isConnected(): boolean;
    sendMoveIntent(intent: {
        seq: number;
        direction8: Direction8;
        stepDurationMs?: number;
    }): void;
}

export interface PlayMovementPumpContext {
    nowMs: number;
    keys: Record<string, boolean>;
    player: GridPlayerMotion;
    gridMovement: GridMovementController;
    prediction: ClientMovementPrediction;
    movementInputBuffer: MovementInputBuffer;
    tileGridDeps: TileGridDeps;
    net: MovementPumpNetBridge | null;
    positionCorrectionSlideActive: boolean;
    movementTooFastThrottleUntilMs: number;
    pumpSendCooldownUntilMs: number;
    resolveOutgoingStepDurationMs: () => number;
    validateOutgoingMove?: (from: TilePos, to: TilePos) => boolean;
    onSeqAssigned?: (seq: number) => void;
    onStepSent?: (stepDurationMs: number, nowMs: number) => void;
}

function resolvePumpDirection(
    ctrl: GridMovementController,
    keys: Record<string, boolean>,
    inputBuffer: MovementInputBuffer,
    nowMs: number
): GridDirection | null {
    primeMovementFacingKeys(ctrl, keys);
    const keyState = buildMovementKeyState(keys);
    const liveDir = resolveInputDirection8(ctrl, keyState, nowMs);
    if (ctrl.stepping) {
        // Só enfileira virada de direção — mesma tecla durante o deslize não vira 2º passo no keyup.
        if (
            liveDir &&
            ctrl.activeStepDirection &&
            liveDir !== ctrl.activeStepDirection &&
            peekMovementInput(inputBuffer) !== liveDir
        ) {
            pushMovementInput(inputBuffer, liveDir);
        }
        return null;
    }
    return liveDir ?? consumeMovementInput(inputBuffer);
}

export function canMovementPumpSend(ctx: PlayMovementPumpContext): boolean {
    if (!ctx.net?.isConnected()) return false;
    if (ctx.gridMovement.stepping) return false;
    if (ctx.positionCorrectionSlideActive) return false;
    if (getPendingPredictionCount(ctx.prediction) >= MAX_MOVE_PIPELINE_DEPTH) {
        return false;
    }
    if (ctx.nowMs < ctx.movementTooFastThrottleUntilMs) return false;
    if (ctx.nowMs < ctx.pumpSendCooldownUntilMs) return false;
    return true;
}

/**
 * Envia no máximo 1 movimento por tick quando há intenção e o pipeline não está cheio.
 * @returns true se um passo autoritativo foi iniciado neste frame.
 */
export function tickPlayMovementPump(ctx: PlayMovementPumpContext): boolean {
    if (!canMovementPumpSend(ctx)) return false;

    const dir = resolvePumpDirection(
        ctx.gridMovement,
        ctx.keys,
        ctx.movementInputBuffer,
        ctx.nowMs
    );
    if (!dir) return false;

    const from: TilePos = {
        tileX: ctx.player.tileX,
        tileY: ctx.player.tileY,
        z: ctx.player.worldZ,
    };
    const dest = getDestTileForDirection(
        from.tileX,
        from.tileY,
        ctx.tileGridDeps.mapSize,
        dir
    );
    if (!dest) return false;
    if (dest.tileX === from.tileX && dest.tileY === from.tileY) return false;

    const to: TilePos = { tileX: dest.tileX, tileY: dest.tileY, z: from.z };
    if (isBlockedTileCoolingDown(to.tileX, to.tileY, to.z, ctx.nowMs)) {
        return false;
    }
    if (ctx.validateOutgoingMove && !ctx.validateOutgoingMove(from, to)) {
        return false;
    }

    const direction8 = toProtocolDirection8(dir);
    const seq = recordPredictedMove(ctx.prediction, from, to, ctx.nowMs);
    ctx.onSeqAssigned?.(seq);

    const stepDurationMs = Math.max(
        16,
        Math.round(ctx.resolveOutgoingStepDurationMs() || getNetworkStepDurationMs(ctx.gridMovement))
    );

    const started = tryStartGridStep(
        ctx.gridMovement,
        ctx.player,
        dir,
        ctx.nowMs,
        ctx.tileGridDeps
    );
    if (!started) {
        clearPendingFromSeq(ctx.prediction, seq);
        return false;
    }

    ctx.net!.sendMoveIntent({ seq, direction8, stepDurationMs });
    ctx.onStepSent?.(stepDurationMs, ctx.nowMs);

    return true;
}
