import { describe, expect, it, vi } from 'vitest';
import {
    clearBlockedMoveTiles,
    markBlockedTile,
} from './blockedMoveTiles';
import { createClientMovementPrediction } from './clientMovementPrediction';
import { createGridMovementController } from './gridMovement';
import {
    consumeMovementInput,
    createMovementInputBuffer,
    movementInputBufferSize,
} from './movementInputBuffer';
import { canMovementPumpSend, tickPlayMovementPump } from './playMovementPump';

describe('playMovementPump', () => {
    const player = {
        worldX: 320,
        worldY: 320,
        worldZ: 0,
        tileX: 10,
        tileY: 10,
    };

    it('não envia enquanto stepping', () => {
        const gridMovement = createGridMovementController();
        gridMovement.stepping = true;
        const sendMoveIntent = vi.fn();
        const ctx = {
            nowMs: 0,
            keys: { w: true },
            player,
            gridMovement,
            prediction: createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 }),
            movementInputBuffer: createMovementInputBuffer(),
            tileGridDeps: {
                tileSize: 32,
                mapSize: 256,
                minFloorZ: 0,
                maxFloorZ: 7,
                isWalkablePixels: () => ({ walkable: true }),
                isStairHoleAtTile: () => false,
                getStepDurationMs: () => 200,
            },
            net: { isConnected: () => true, sendMoveIntent },
            pumpSendCooldownUntilMs: 0,
            resolveOutgoingStepDurationMs: () => 200,
            positionCorrectionSlideActive: false,
            movementTooFastThrottleUntilMs: 0,
        };
        expect(canMovementPumpSend(ctx)).toBe(false);
        expect(tickPlayMovementPump(ctx)).toBe(false);
        expect(sendMoveIntent).not.toHaveBeenCalled();
    });

    it('envia seq+direction8 quando há intenção e fila vazia', () => {
        const gridMovement = createGridMovementController();
        const sendMoveIntent = vi.fn();
        const started = tickPlayMovementPump({
            nowMs: 100,
            keys: { w: true },
            player: { ...player },
            gridMovement,
            prediction: createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 }),
            movementInputBuffer: createMovementInputBuffer(),
            tileGridDeps: {
                tileSize: 32,
                mapSize: 256,
                minFloorZ: 0,
                maxFloorZ: 7,
                isWalkablePixels: () => ({ walkable: true }),
                isStairHoleAtTile: () => false,
                getStepDurationMs: () => 200,
            },
            net: {
                isConnected: () => true,
                sendMoveIntent,
            },
            positionCorrectionSlideActive: false,
            movementTooFastThrottleUntilMs: 0,
            pumpSendCooldownUntilMs: 0,
            resolveOutgoingStepDurationMs: () => 200,
        });
        expect(started).toBe(true);
        expect(sendMoveIntent).toHaveBeenCalledWith(
            expect.objectContaining({
                seq: 1,
                direction8: 'north',
            })
        );
        expect(gridMovement.stepping).toBe(true);
    });

    it('não enfileira mesma direção durante deslize (evita 2 tiles por toque)', () => {
        const gridMovement = createGridMovementController();
        const movementInputBuffer = createMovementInputBuffer();
        const sendMoveIntent = vi.fn();
        const tileGridDeps = {
            tileSize: 32,
            mapSize: 256,
            minFloorZ: 0,
            maxFloorZ: 7,
            isWalkablePixels: () => ({ walkable: true }),
            isStairHoleAtTile: () => false,
            getStepDurationMs: () => 200,
        };
        const baseCtx = {
            keys: { w: true },
            player: { ...player },
            gridMovement,
            prediction: createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 }),
            movementInputBuffer,
            tileGridDeps,
            net: { isConnected: () => true, sendMoveIntent },
            positionCorrectionSlideActive: false,
            movementTooFastThrottleUntilMs: 0,
            pumpSendCooldownUntilMs: 0,
            resolveOutgoingStepDurationMs: () => 200,
        };

        expect(tickPlayMovementPump({ ...baseCtx, nowMs: 100 })).toBe(true);
        expect(gridMovement.stepping).toBe(true);
        expect(gridMovement.activeStepDirection).toBe('north');
        expect(movementInputBufferSize(movementInputBuffer)).toBe(0);

        gridMovement.stepping = false;
        gridMovement.activeStepDirection = null;
        baseCtx.keys = {};
        baseCtx.prediction.pending.length = 0;

        expect(tickPlayMovementPump({ ...baseCtx, nowMs: 400 })).toBe(false);
        expect(sendMoveIntent).toHaveBeenCalledTimes(1);
        expect(consumeMovementInput(movementInputBuffer)).toBeNull();
    });

    it('não envia para tile em cooldown TILE_OCCUPIED', () => {
        clearBlockedMoveTiles();
        const gridMovement = createGridMovementController();
        const sendMoveIntent = vi.fn();
        markBlockedTile(10, 9, 0, 100);

        const started = tickPlayMovementPump({
            nowMs: 150,
            keys: { w: true },
            player: { ...player },
            gridMovement,
            prediction: createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 }),
            movementInputBuffer: createMovementInputBuffer(),
            tileGridDeps: {
                tileSize: 32,
                mapSize: 256,
                minFloorZ: 0,
                maxFloorZ: 7,
                isWalkablePixels: () => ({ walkable: true }),
                isStairHoleAtTile: () => false,
                getStepDurationMs: () => 200,
            },
            net: { isConnected: () => true, sendMoveIntent },
            positionCorrectionSlideActive: false,
            movementTooFastThrottleUntilMs: 0,
            pumpSendCooldownUntilMs: 0,
            resolveOutgoingStepDurationMs: () => 200,
        });

        expect(started).toBe(false);
        expect(sendMoveIntent).not.toHaveBeenCalled();
    });
});
