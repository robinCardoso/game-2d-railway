/**
 * Fila de passos previstos pelo cliente — reconcilia com `position_correction`.
 * Movimento local continua instantâneo; rollback = snap autoritativo + limpar fila.
 */

export interface PredictedMove {
    seq: number;
    fromTileX: number;
    fromTileY: number;
    toTileX: number;
    toTileY: number;
    z: number;
    committedAtMs: number;
}

export interface ClientMovementPrediction {
    pending: PredictedMove[];
    nextSeq: number;
    serverTileX: number;
    serverTileY: number;
    serverZ: number;
}

export interface PredictionReconcileResult {
    serverTileX: number;
    serverTileY: number;
    serverZ: number;
    droppedPending: number;
    clientAheadTiles: number;
}

export function createClientMovementPrediction(initial: {
    tileX: number;
    tileY: number;
    z: number;
}): ClientMovementPrediction {
    return {
        pending: [],
        nextSeq: 1,
        serverTileX: initial.tileX,
        serverTileY: initial.tileY,
        serverZ: initial.z,
    };
}

export function resetClientMovementPrediction(
    pred: ClientMovementPrediction,
    tileX: number,
    tileY: number,
    z: number
): void {
    pred.pending.length = 0;
    pred.serverTileX = tileX;
    pred.serverTileY = tileY;
    pred.serverZ = z;
}

/** Registra passo concluído localmente (tile commit). */
export function recordPredictedMove(
    pred: ClientMovementPrediction,
    from: { tileX: number; tileY: number; z: number },
    to: { tileX: number; tileY: number; z: number },
    nowMs: number
): number {
    const seq = pred.nextSeq++;
    pred.pending.push({
        seq,
        fromTileX: from.tileX,
        fromTileY: from.tileY,
        toTileX: to.tileX,
        toTileY: to.tileY,
        z: to.z,
        committedAtMs: nowMs,
    });
    if (pred.pending.length > 24) {
        pred.pending.splice(0, pred.pending.length - 24);
    }
    return seq;
}

/** Servidor confirmou tile (via resync / state implícito) — descarta passos já absorvidos. */
export function confirmServerTile(
    pred: ClientMovementPrediction,
    tileX: number,
    tileY: number,
    z: number
): void {
    pred.serverTileX = tileX;
    pred.serverTileY = tileY;
    pred.serverZ = z;

    while (pred.pending.length > 0) {
        const head = pred.pending[0]!;
        if (head.toTileX === tileX && head.toTileY === tileY && head.z === z) {
            pred.pending.shift();
            continue;
        }
        if (head.fromTileX === tileX && head.fromTileY === tileY && head.z === z) {
            break;
        }
        pred.pending.shift();
    }
}

/** `position_correction` — servidor é fonte de verdade; limpa fila e mede divergência. */
export function reconcileMovementPrediction(
    pred: ClientMovementPrediction,
    serverTileX: number,
    serverTileY: number,
    serverZ: number,
    clientTileX: number,
    clientTileY: number,
    clientZ: number
): PredictionReconcileResult {
    const droppedPending = pred.pending.length;
    pred.pending.length = 0;
    pred.serverTileX = serverTileX;
    pred.serverTileY = serverTileY;
    pred.serverZ = serverZ;

    const clientAheadTiles =
        clientTileX !== serverTileX ||
        clientTileY !== serverTileY ||
        clientZ !== serverZ
            ? Math.abs(clientTileX - serverTileX) + Math.abs(clientTileY - serverTileY)
            : 0;

    return {
        serverTileX,
        serverTileY,
        serverZ,
        droppedPending,
        clientAheadTiles,
    };
}

export function getPendingPredictionCount(pred: ClientMovementPrediction): number {
    return pred.pending.length;
}
