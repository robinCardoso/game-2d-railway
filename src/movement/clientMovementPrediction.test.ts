import { describe, expect, it } from 'vitest';
import {
    confirmServerTile,
    createClientMovementPrediction,
    reconcileMovementPrediction,
    recordPredictedMove,
} from './clientMovementPrediction';

describe('clientMovementPrediction', () => {
    it('registra passos previstos', () => {
        const pred = createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 });
        recordPredictedMove(pred, { tileX: 10, tileY: 10, z: 0 }, { tileX: 11, tileY: 10, z: 0 }, 100);
        expect(pred.pending).toHaveLength(1);
    });

    it('confirmServerTile remove passos confirmados', () => {
        const pred = createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 });
        recordPredictedMove(pred, { tileX: 10, tileY: 10, z: 0 }, { tileX: 11, tileY: 10, z: 0 }, 100);
        confirmServerTile(pred, 11, 10, 0);
        expect(pred.pending).toHaveLength(0);
    });

    it('reconcile limpa fila e reporta divergência', () => {
        const pred = createClientMovementPrediction({ tileX: 10, tileY: 10, z: 0 });
        recordPredictedMove(pred, { tileX: 10, tileY: 10, z: 0 }, { tileX: 11, tileY: 10, z: 0 }, 100);
        recordPredictedMove(pred, { tileX: 11, tileY: 10, z: 0 }, { tileX: 12, tileY: 10, z: 0 }, 200);

        const result = reconcileMovementPrediction(pred, 10, 10, 0, 12, 10, 0);
        expect(result.droppedPending).toBe(2);
        expect(result.clientAheadTiles).toBe(2);
        expect(pred.pending).toHaveLength(0);
    });
});
