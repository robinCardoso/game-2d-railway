/**
 * Movimento por grid (tileSize da engine, ex. 32×32) com deslize visual entre tiles.
 *
 * - `tileX` / `tileY`: célula lógica — só atualiza quando o deslize **termina**.
 * - `worldX` / `worldY`: posição desenhada (interpolação durante o passo).
 *
 * Enquanto `stepping === true`, nenhum novo passo começa.
 * Ao terminar o deslize, se a tecla ainda estiver pressionada, o próximo passo
 * inicia no mesmo frame (sem pausa extra entre tiles).
 *
 * Acorde WASD (W+D, W+A, S+D, S+A): diagonal só após `DIAGONAL_CHORD_DELAY_MS`
 * com ambas as teclas pressionadas — evita passo diagonal em clique acidental.
 * Q / E continuam com diagonal imediata.
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

/** Tempo mínimo com W+D (etc.) antes de iniciar passo diagonal (ms). */
export const DIAGONAL_CHORD_DELAY_MS = 100;

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
    /** Tile de destino — commit em `tileX`/`tileY` só ao concluir o deslize. */
    destTileX: number;
    destTileY: number;
    /** Face travada durante o deslize — teclas novas não mudam sprite até concluir. */
    activeStepFacing: CardinalDirection | null;
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
        destTileX: 0,
        destTileY: 0,
        activeStepFacing: null,
    };
}

/** Face do sprite durante o passo em andamento (null se parado). */
export function getActiveStepFacing(
    ctrl: GridMovementController
): CardinalDirection | null {
    return ctrl.activeStepFacing;
}

function facingForStep(dir: GridDirection): CardinalDirection {
    switch (dir) {
        case 'north':
            return 'north';
        case 'south':
            return 'south';
        case 'east':
            return 'east';
        case 'west':
            return 'west';
        case 'northwest':
            if (lastMovementFacingKey === 'a') return 'west';
            if (lastMovementFacingKey === 'w') return 'north';
            return 'north';
        case 'northeast':
            if (lastMovementFacingKey === 'd') return 'east';
            if (lastMovementFacingKey === 'w') return 'north';
            return 'north';
        case 'southwest':
            if (lastMovementFacingKey === 'a') return 'west';
            if (lastMovementFacingKey === 's') return 'south';
            return 'south';
        case 'southeast':
            if (lastMovementFacingKey === 'd') return 'east';
            if (lastMovementFacingKey === 's') return 'south';
            return 'south';
    }
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
    /** W+A sem Q */
    chordNorthwest: boolean;
    /** W+D sem E */
    chordNortheast: boolean;
    chordSouthwest: boolean;
    chordSoutheast: boolean;
    explicitNorthwest: boolean;
    explicitNortheast: boolean;
}

type DiagonalChord = 'northwest' | 'northeast' | 'southwest' | 'southeast';

const chordHeldSinceMs: Partial<Record<DiagonalChord, number>> = {};

export function buildMovementKeyState(keys: Record<string, boolean>): MovementKeyState {
    const w = !!(keys['w'] || keys['arrowup']);
    const s = !!(keys['s'] || keys['arrowdown']);
    const a = !!(keys['a'] || keys['arrowleft']);
    const d = !!(keys['d'] || keys['arrowright']);
    const q = !!keys['q'];
    const e = !!keys['e'];

    const chordNorthwest = w && a;
    const chordNortheast = w && d;
    const chordSouthwest = s && a;
    const chordSoutheast = s && d;

    const northwest = q || chordNorthwest;
    const northeast = e || chordNortheast;
    const southwest = chordSouthwest;
    const southeast = chordSoutheast;

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
        chordNorthwest,
        chordNortheast,
        chordSouthwest,
        chordSoutheast,
        explicitNorthwest: q,
        explicitNortheast: e,
    };
}

function updateChordHoldTiming(keys: MovementKeyState, nowMs: number): void {
    const pairs: [DiagonalChord, boolean][] = [
        ['northwest', keys.chordNorthwest],
        ['northeast', keys.chordNortheast],
        ['southwest', keys.chordSouthwest],
        ['southeast', keys.chordSoutheast],
    ];
    for (const [chord, held] of pairs) {
        if (held) {
            if (chordHeldSinceMs[chord] === undefined) {
                chordHeldSinceMs[chord] = nowMs;
            }
        } else {
            delete chordHeldSinceMs[chord];
        }
    }
}

function isChordDiagonalReady(chord: DiagonalChord, nowMs: number): boolean {
    const since = chordHeldSinceMs[chord];
    return since !== undefined && nowMs - since >= DIAGONAL_CHORD_DELAY_MS;
}

function cardinalFromFacingKey(): GridDirection | null {
    if (lastMovementFacingKey === 'w') return 'north';
    if (lastMovementFacingKey === 's') return 'south';
    if (lastMovementFacingKey === 'a') return 'west';
    if (lastMovementFacingKey === 'd') return 'east';
    return null;
}

function resolveDirection(keys: MovementKeyState, nowMs: number): GridDirection | null {
    updateChordHoldTiming(keys, nowMs);

    if (keys.explicitNorthwest) return 'northwest';
    if (keys.explicitNortheast) return 'northeast';

    const pendingChords: DiagonalChord[] = [];

    if (keys.chordNorthwest) {
        if (isChordDiagonalReady('northwest', nowMs)) return 'northwest';
        pendingChords.push('northwest');
    }
    if (keys.chordNortheast) {
        if (isChordDiagonalReady('northeast', nowMs)) return 'northeast';
        pendingChords.push('northeast');
    }
    if (keys.chordSouthwest) {
        if (isChordDiagonalReady('southwest', nowMs)) return 'southwest';
        pendingChords.push('southwest');
    }
    if (keys.chordSoutheast) {
        if (isChordDiagonalReady('southeast', nowMs)) return 'southeast';
        pendingChords.push('southeast');
    }

    if (pendingChords.length > 1) return null;

    if (pendingChords.length === 1) {
        const fallback = cardinalFromFacingKey();
        if (fallback) return fallback;
    }

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

/** Atualiza `lastMovementFacingKey` antes do tick (sem mudar sprite). */
export function primeMovementFacingKeys(keys: Record<string, boolean>): void {
    updateLastMovementFacingKey(keys);
}

/** Limpa estado de facing e acordes (teleporte, correção de rede). */
export function resetGridMovementInputState(): void {
    prevMovementFacingKeys = {};
    lastMovementFacingKey = null;
    for (const k of Object.keys(chordHeldSinceMs) as DiagonalChord[]) {
        delete chordHeldSinceMs[k];
    }
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

function commitTilePosition(player: GridPlayerMotion, tx: number, ty: number): void {
    player.tileX = tx;
    player.tileY = ty;
}

/**
 * Garante que visual e tile lógico coincidem antes de aceitar um novo passo.
 * @returns false enquanto o deslize ainda não terminou.
 */
function ensureStepComplete(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    tileSize: number
): boolean {
    if (ctrl.stepping) return false;

    const settledX = player.tileX * tileSize;
    const settledY = player.tileY * tileSize;
    if (player.worldX !== settledX || player.worldY !== settledY) {
        player.worldX = settledX;
        player.worldY = settledY;
    }
    return true;
}

function beginStep(
    ctrl: GridMovementController,
    player: GridPlayerMotion,
    tileSize: number,
    ntx: number,
    nty: number,
    nowMs: number,
    instant: boolean,
    stepDurationMs: number,
    dir: GridDirection
): void {
    const dest = tileToWorld(ntx, nty, tileSize);
    ctrl.destTileX = ntx;
    ctrl.destTileY = nty;
    ctrl.activeStepFacing = facingForStep(dir);

    if (instant) {
        commitTilePosition(player, ntx, nty);
        ctrl.stepping = false;
        ctrl.activeStepFacing = null;
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
        commitTilePosition(player, ctrl.destTileX, ctrl.destTileY);
        player.worldX = ctrl.toX;
        player.worldY = ctrl.toY;
        ctrl.stepping = false;
        ctrl.activeStepFacing = null;
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
        beginStep(ctrl, player, tileSize, tx, nty, nowMs, true, stepMs, dir);
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
    beginStep(ctrl, player, tileSize, ntx, nty, nowMs, false, stepMs, dir);

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
            ctrl.activeStepFacing = null;
            syncGridPlayerVisual(player, tileSize, ntx, deckTy);
            ctrl.destTileX = ntx;
            ctrl.destTileY = deckTy;
        }
    }

    return true;
}

/**
 * Atualiza movimento por frame.
 * Novo passo só após o deslize anterior concluir (tile lógico + visual alinhados).
 */
export function tickGridMovement(params: TickGridMovementParams): boolean {
    const { player, controller: ctrl, keys: k, nowMs, deps } = params;

    if (ctrl.stepping) {
        const done = advanceStepVisual(ctrl, player, nowMs);
        if (!done) return false;
    }

    if (!ensureStepComplete(ctrl, player, deps.tileSize)) {
        return false;
    }

    const dir = resolveDirection(k, nowMs);
    if (!dir) return false;

    return tryStartStep(ctrl, player, dir, nowMs, deps);
}
