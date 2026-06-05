/**
 * Movimento por grid (tileSize da engine, ex. 64×64) com deslize visual entre tiles.
 *
 * - `tileX` / `tileY`: célula lógica (colisão, escadas, UI).
 * - `worldX` / `worldY`: posição desenhada (interpolação durante o passo).
 *
 * Enquanto `stepping === true`, nenhum novo passo começa.
 * Ao terminar o deslize, se a tecla ainda estiver pressionada, o próximo passo
 * inicia no mesmo frame (sem pausa extra entre tiles).
 */

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export type GridDirection =
    | CardinalDirection
    | 'northwest'
    | 'northeast'
    | 'southwest'
    | 'southeast';

/** Duração do deslize entre dois tiles (ms). Menor = mais rápido. */
export const DEFAULT_GRID_STEP_DURATION_MS = 100;

/** Passo diagonal percorre √2× mais pixels — mesma duração × este fator = velocidade visual igual. */
export const DIAGONAL_STEP_DURATION_FACTOR = Math.SQRT2;

export interface GridPlayerMotion {
    worldX: number;
    worldY: number;
    worldZ: number;
    tileX: number;
    tileY: number;
}

export interface GridMovementController {
    stepping: boolean;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    stepStartMs: number;
    stepDurationMs: number;
}

export function createGridMovementController(
    stepDurationMs: number = DEFAULT_GRID_STEP_DURATION_MS
): GridMovementController {
    return {
        stepping: false,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        stepStartMs: 0,
        stepDurationMs,
    };
}

/** Atualiza a duração do deslize (ex.: quando SPEED do personagem muda). */
export function setGridStepDuration(
    ctrl: GridMovementController,
    stepDurationMs: number
): void {
    ctrl.stepDurationMs = Math.max(16, stepDurationMs);
}

export interface TileGridDeps {
    tileSize: number;
    mapSize: number;
    minFloorZ: number;
    maxFloorZ: number;
    isWalkablePixels: (
        worldX: number,
        worldY: number,
        z: number
    ) => { walkable: boolean; isStair: boolean; stairDir?: 'up' | 'down' };
    isStairHoleAtTile: (tileX: number, tileY: number, z: number) => boolean;
    /** Duração do deslize para o tile de destino (stat + buffs + terreno). */
    getStepDurationMs: (tileX: number, tileY: number, z: number) => number;
}

export function syncGridPlayerVisual(
    player: GridPlayerMotion,
    tileSize: number,
    tileX?: number,
    tileY?: number
): void {
    if (tileX !== undefined) player.tileX = tileX;
    if (tileY !== undefined) player.tileY = tileY;
    player.worldX = player.tileX * tileSize;
    player.worldY = player.tileY * tileSize;
}

export function initGridPlayerPosition(
    player: GridPlayerMotion,
    tileSize: number
): void {
    const tx = Math.floor((player.worldX + tileSize / 2) / tileSize);
    const ty = Math.floor((player.worldY + tileSize / 2) / tileSize);
    syncGridPlayerVisual(player, tileSize, tx, ty);
}

function tileToWorld(tx: number, ty: number, tileSize: number) {
    return { x: tx * tileSize, y: ty * tileSize };
}

/**
 * Estado de teclas de movimento (WASD + setas + Q/E diagonais).
 * Layout Q/E/A/D: Q=NO, E=NE, S+A=SO, S+D=SE; também W+A, W+D, W+Q, W+E.
 */
export interface MovementKeyState {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
    northwest: boolean;
    northeast: boolean;
    southwest: boolean;
    southeast: boolean;
}

export function buildMovementKeyState(keys: Record<string, boolean>): MovementKeyState {
    const w = !!(keys['w'] || keys['arrowup']);
    const s = !!(keys['s'] || keys['arrowdown']);
    const a = !!(keys['a'] || keys['arrowleft']);
    const d = !!(keys['d'] || keys['arrowright']);
    const q = !!keys['q'];
    const e = !!keys['e'];

    const northwest = q || (w && a);
    const northeast = e || (w && d);
    const southwest = s && a;
    const southeast = s && d;

    const north = w && !s && !southwest && !southeast;
    const south = s && !w && !northwest && !northeast;
    const west =
        a && !d && !q && !e && !northeast && !southeast && !northwest;
    const east =
        d && !a && !q && !e && !northwest && !southwest && !northeast;

    return {
        north,
        south,
        east,
        west,
        northwest,
        northeast,
        southwest,
        southeast,
    };
}

function resolveDirection(keys: MovementKeyState): GridDirection | null {
    const nw = keys.northwest || (keys.north && keys.west);
    const ne = keys.northeast || (keys.north && keys.east);
    const sw = keys.southwest || (keys.south && keys.west);
    const se = keys.southeast || (keys.south && keys.east);

    const diagCount = [nw, ne, sw, se].filter(Boolean).length;
    if (diagCount > 1) return null;

    if (nw) return 'northwest';
    if (ne) return 'northeast';
    if (sw) return 'southwest';
    if (se) return 'southeast';

    const { north, south, east, west } = keys;
    if (!north && !south && !east && !west) return null;
    if (north && south) return null;
    if (east && west) return null;

    if (north) return 'north';
    if (south) return 'south';
    if (west) return 'west';
    if (east) return 'east';
    return null;
}

const MOVEMENT_FACING_KEYS = [
    'w',
    's',
    'a',
    'd',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright',
] as const;

type FacingKey = 'w' | 's' | 'a' | 'd';

let prevMovementFacingKeys: Record<string, boolean> = {};
let lastMovementFacingKey: FacingKey | null = null;

function normalizeFacingKey(key: string): FacingKey | null {
    switch (key) {
        case 'w':
        case 'arrowup':
            return 'w';
        case 's':
        case 'arrowdown':
            return 's';
        case 'a':
        case 'arrowleft':
            return 'a';
        case 'd':
        case 'arrowright':
            return 'd';
        default:
            return null;
    }
}

function movementAxisHeld(
    keys: Record<string, boolean>,
    axis: 'vertical' | 'horizontal'
): boolean {
    if (axis === 'vertical') {
        return !!(
            keys['w'] ||
            keys['arrowup'] ||
            keys['s'] ||
            keys['arrowdown']
        );
    }
    return !!(
        keys['a'] ||
        keys['arrowleft'] ||
        keys['d'] ||
        keys['arrowright']
    );
}

function updateLastMovementFacingKey(keys: Record<string, boolean>): void {
    for (const key of MOVEMENT_FACING_KEYS) {
        if (!keys[key] || prevMovementFacingKeys[key]) continue;

        const facing = normalizeFacingKey(key);
        if (!facing) continue;

        const vertAlready = movementAxisHeld(prevMovementFacingKeys, 'vertical');
        const horizAlready = movementAxisHeld(prevMovementFacingKeys, 'horizontal');
        const newIsVert = facing === 'w' || facing === 's';
        const newIsHoriz = facing === 'a' || facing === 'd';

        // Segunda tecla do diagonal não troca a face (D → +W mantém leste)
        if (newIsVert && horizAlready) continue;
        if (newIsHoriz && vertAlready) continue;

        lastMovementFacingKey = facing;
    }
    prevMovementFacingKeys = { ...keys };
}

/**
 * Direção do sprite (4 vias). A/D/W/S sozinhos viram a sprite.
 * Diagonal: mantém a face da última tecla WASD pressionada
 * (W+D → norte; D depois +W → leste; S+A → sul; A depois +S → oeste; etc.).
 */
export function resolveSpriteDirection(keys: Record<string, boolean>): CardinalDirection | null {
    updateLastMovementFacingKey(keys);

    const w = !!(keys['w'] || keys['arrowup']);
    const s = !!(keys['s'] || keys['arrowdown']);
    const a = !!(keys['a'] || keys['arrowleft']);
    const d = !!(keys['d'] || keys['arrowright']);
    const vertical = w || s;
    const horizontal = a || d;

    if (vertical && horizontal) {
        if (lastMovementFacingKey === 'w') return 'north';
        if (lastMovementFacingKey === 's') return 'south';
        if (lastMovementFacingKey === 'a') return 'west';
        if (lastMovementFacingKey === 'd') return 'east';
        return null;
    }

    if (w && !s) return 'north';
    if (s && !w) return 'south';
    if (a && !d) return 'west';
    if (d && !a) return 'east';
    return null;
}

function isDiagonalDirection(dir: GridDirection): boolean {
    return dir === 'northwest' || dir === 'northeast' || dir === 'southwest' || dir === 'southeast';
}

/** Impede “cortar canto” entre dois tiles bloqueados (estilo Tibia). */
function canStepToTile(
    tx: number,
    ty: number,
    ntx: number,
    nty: number,
    z: number,
    tileSize: number,
    deps: TileGridDeps
): boolean {
    const dest = tileToWorld(ntx, nty, tileSize);
    if (!deps.isWalkablePixels(dest.x, dest.y, z).walkable) return false;

    if (ntx === tx || nty === ty) return true;

    const sideX = tileToWorld(ntx, ty, tileSize);
    const sideY = tileToWorld(tx, nty, tileSize);
    if (!deps.isWalkablePixels(sideX.x, sideX.y, z).walkable) return false;
    if (!deps.isWalkablePixels(sideY.x, sideY.y, z).walkable) return false;
    return true;
}

function clampTile(v: number, mapSize: number): number {
    return Math.max(0, Math.min(mapSize - 1, v));
}

function beginStep(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    tileSize: number,
    ntx: number,
    nty: number,
    nowMs: number,
    instant: boolean,
    stepDurationMs: number
): void {
    const dest = tileToWorld(ntx, nty, tileSize);
    player.tileX = ntx;
    player.tileY = nty;

    if (instant) {
        ctrl.stepping = false;
        player.worldX = dest.x;
        player.worldY = dest.y;
        return;
    }

    ctrl.stepping = true;
    ctrl.stepDurationMs = Math.max(16, stepDurationMs);
    ctrl.fromX = player.worldX;
    ctrl.fromY = player.worldY;
    ctrl.toX = dest.x;
    ctrl.toY = dest.y;
    ctrl.stepStartMs = nowMs;
}

/** @returns `true` quando o deslize terminou neste frame. */
function advanceStepVisual(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    nowMs: number
): boolean {
    if (!ctrl.stepping) return true;

    const elapsed = nowMs - ctrl.stepStartMs;
    const t = Math.min(1, elapsed / ctrl.stepDurationMs);

    player.worldX = ctrl.fromX + (ctrl.toX - ctrl.fromX) * t;
    player.worldY = ctrl.fromY + (ctrl.toY - ctrl.fromY) * t;

    if (t >= 1) {
        player.worldX = ctrl.toX;
        player.worldY = ctrl.toY;
        ctrl.stepping = false;
        return true;
    }
    return false;
}

export interface TickGridMovementParams {
    player: GridPlayerMotion;
    controller: GridMovementController;
    keys: MovementKeyState;
    nowMs: number;
    deps: TileGridDeps;
}

function tryStartStep(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    dir: GridDirection,
    nowMs: number,
    deps: TileGridDeps
): boolean {
    const { tileSize, mapSize, minFloorZ, maxFloorZ } = deps;
    let { tileX: tx, tileY: ty } = player;
    player.worldZ = Math.max(minFloorZ, Math.min(maxFloorZ, player.worldZ));

    if (
        !isDiagonalDirection(dir) &&
        dir === 'south' &&
        player.worldZ > minFloorZ &&
        deps.isStairHoleAtTile(tx, ty, player.worldZ)
    ) {
        player.worldZ -= 1;
        const nty = clampTile(ty + 1, mapSize);
        const stepMs = deps.getStepDurationMs(tx, nty, player.worldZ);
        beginStep(ctrl, player, tileSize, tx, nty, nowMs, true, stepMs);
        return true;
    }

    let ntx = tx;
    let nty = ty;
    switch (dir) {
        case 'north':
            if (ty <= 0) return false;
            nty -= 1;
            break;
        case 'south':
            if (ty >= mapSize - 1) return false;
            nty += 1;
            break;
        case 'west':
            if (tx <= 0) return false;
            ntx -= 1;
            break;
        case 'east':
            if (tx >= mapSize - 1) return false;
            ntx += 1;
            break;
        case 'northwest':
            if (tx <= 0 || ty <= 0) return false;
            ntx -= 1;
            nty -= 1;
            break;
        case 'northeast':
            if (tx >= mapSize - 1 || ty <= 0) return false;
            ntx += 1;
            nty -= 1;
            break;
        case 'southwest':
            if (tx <= 0 || ty >= mapSize - 1) return false;
            ntx -= 1;
            nty += 1;
            break;
        case 'southeast':
            if (tx >= mapSize - 1 || ty >= mapSize - 1) return false;
            ntx += 1;
            nty += 1;
            break;
    }

    ntx = clampTile(ntx, mapSize);
    nty = clampTile(nty, mapSize);
    if (ntx === tx && nty === ty) return false;

    if (!canStepToTile(tx, ty, ntx, nty, player.worldZ, tileSize, deps)) {
        return false;
    }

    const dest = tileToWorld(ntx, nty, tileSize);
    let stepMs = deps.getStepDurationMs(ntx, nty, player.worldZ);
    if (isDiagonalDirection(dir)) {
        stepMs = Math.round(stepMs * DIAGONAL_STEP_DURATION_FACTOR);
    }
    beginStep(ctrl, player, tileSize, ntx, nty, nowMs, false, stepMs);

    const landed = deps.isWalkablePixels(dest.x, dest.y, player.worldZ);
    if (
        !isDiagonalDirection(dir) &&
        landed.isStair &&
        landed.stairDir === 'up' &&
        player.worldZ < maxFloorZ &&
        nty > 0
    ) {
        const deckTy = nty - 1;
        const upperZ = player.worldZ + 1;
        const upper = deps.isWalkablePixels(
            ntx * tileSize,
            deckTy * tileSize,
            upperZ
        );
        if (upper.walkable) {
            player.worldZ = upperZ;
            ctrl.stepping = false;
            syncGridPlayerVisual(player, tileSize, ntx, deckTy);
        }
    }

    return true;
}

/**
 * Atualiza movimento por frame.
 * Se o deslize acabou e a tecla segue pressionada, inicia o próximo passo no mesmo frame.
 */
export function tickGridMovement(params: TickGridMovementParams): boolean {
    const { player, controller: ctrl, keys: k, nowMs, deps } = params;

    if (ctrl.stepping) {
        const done = advanceStepVisual(ctrl, player, nowMs);
        if (!done) return false;
    }

    const dir = resolveDirection(k);
    if (!dir) return false;

    return tryStartStep(ctrl, player, dir, nowMs, deps);
}
