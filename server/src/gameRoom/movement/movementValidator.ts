import {
    applyDirection,
    direction8FromTiles,
    type Direction8,
} from '../../../../shared/movement/direction8.js';
import {
    canAdjacentStep,
    type TilePos,
} from '../../../../shared/tileWalkable.js';

export interface ValidatePlayerStepInput {
    from: TilePos;
    direction8: Direction8;
    isWalkable: (tileX: number, tileY: number, z: number) => boolean;
    isOccupied?: (tileX: number, tileY: number, z: number) => boolean;
}

export interface ValidatePlayerStepResult {
    ok: boolean;
    to: TilePos;
    code?: 'INVALID_STEP' | 'NOT_WALKABLE' | 'TILE_OCCUPIED';
}

export function validatePlayerStep(
    input: ValidatePlayerStepInput
): ValidatePlayerStepResult {
    const to = applyDirection(input.from, input.direction8);

    if (
        !canAdjacentStep(input.from, to, input.isWalkable)
    ) {
        return { ok: false, to, code: 'INVALID_STEP' };
    }

    if (!input.isWalkable(to.tileX, to.tileY, to.z)) {
        return { ok: false, to, code: 'NOT_WALKABLE' };
    }

    if (input.isOccupied?.(to.tileX, to.tileY, to.z)) {
        return { ok: false, to, code: 'TILE_OCCUPIED' };
    }

    return { ok: true, to };
}

/** Valida passo tile→tile (legado ou anti-cheat). */
export function validatePlayerStepToTile(
    from: TilePos,
    to: TilePos,
    isWalkable: (tileX: number, tileY: number, z: number) => boolean,
    isOccupied?: (tileX: number, tileY: number, z: number) => boolean
): ValidatePlayerStepResult {
    const dir = direction8FromTiles(from, to);
    if (!dir) {
        return { ok: false, to, code: 'INVALID_STEP' };
    }
    return validatePlayerStep({ from, direction8: dir, isWalkable, isOccupied });
}
