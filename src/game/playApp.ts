import '../style.css';
import {
    ENGINE_CONFIG,
    buildTileRegistry,
    clampFloorZ,
    createEmptyWorldMap,
    ensureAllFloors,
    getAllFloorZs,
    getTerrainSpeedModifierAt,
    isStairHoleAtTile as engineIsStairHoleAtTile,
    loadMapFromJson,
    queryWalkable,
    type CollisionQueryContext,
    type WorldMap,
} from '../engine';
import {
    collectItemDepthDrawables,
    DEFAULT_ITEM_EDGE_FADE_PX,
    collectLocalPlayerDepthDrawable,
    collectNpcDepthDrawables,
    collectRemoteDepthDrawables,
    drawDepthSorted,
    sortDepthDrawables,
} from '../engine/depthSortDraw';
import { drawRegistryTile, isMapBorderTile } from '../engine/tileDraw';
import { SpriteAnimationController } from '../character/spriteAnimation';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import {
    createGridMovementController,
    resetGridMovementInputState,
    setGridStepDuration,
    syncGridPlayerVisual,
} from '../movement/gridMovement';
import { PlayerMovement } from '../movement/playerMovement';
import { NpcAI } from '../character/npcAI';
import { GameEntity } from '../character/entity';
import { respawnEntitiesFromSpawns } from '../character/respawnEntities';
import { loadCreaturePresets } from '../editor/creaturePresets';
import { createDefaultCharacterSpeed, type CharacterSpeedState } from '../character/movementSpeed';
import { SpeedBuffManager } from '../character/speedBuffs';
import { resolveFullStepDuration } from '../character/characterMovement';
import { createEmptyLayerMap, getLayerCell, type LayerMap } from '../engine/mapPaintLayers';
import { collectBorderDrawTileIdsCached, buildBorderMaskTileIndex, invalidateBorderDrawCache } from '../engine/autoBorderEngine';
import { DEFAULT_GAME_DATA } from '../game-data/default';
import { getMapEntry, MAP_REGISTRY, type MapEntry } from '../engine/mapRegistry';
import { resolveEffectiveSpawn } from '../world/spawnResolver';
import { loadWorldMap, prepareMapRegistry, prepareTileRegistry } from '../world/worldBoot';
import {
    captureOverworldReturnIfNeeded,
    clearOverworldReturnContext,
    createMapInstanceFromTemplate,
    disposeActiveMapInstance,
    getActiveInstanceShortLabel,
    isInsideMapInstance,
} from '../engine/mapInstance';
import { DEFAULT_WS_PORT } from '../../shared/protocol';
import { GameNetClient } from '../net/gameNetClient';
import { RemotePlayerSpriteManager } from '../net/remotePlayerSprites';
import { appearanceFromCharacter } from '../world/playerAppearance';
import { createEnterTicket } from '../shared/enterTicket';
import type { CharacterRow } from '../shared/types';
import { updateCharacterLocation } from '../shared/characterStore';
import { fetchWsTicket, isServerWsTicketEnabled } from '../shared/wsTicketClient';
import { updateCharacterStatsUi } from './ui/characterStatsUi';
import { getPlayBorderConfig, loadPlayBorderConfig } from './playBorderConfig';

const TILE_SIZE_SCREEN = ENGINE_CONFIG.TILE_SIZE;
let TILE_TYPES = buildTileRegistry();
let activeMapSize: number = ENGINE_CONFIG.MAP_SIZE;
let worldMap: WorldMap = ensureAllFloors(createEmptyWorldMap());
let grassOverlayMap: LayerMap = createEmptyLayerMap();
let borderOverlayMap: LayerMap = createEmptyLayerMap();
let itemsOverlayMap: LayerMap = createEmptyLayerMap();
let worldSpawns: import('../engine/types').CreatureSpawn[] = [];
let currentMapId: string | undefined;
let isTransitioningMap = false;
let portalCooldownUntil = 0;
let previousPlayerTileKey = '';
let editingFloor = 0;

const player = {
    worldX: 50 * TILE_SIZE_SCREEN,
    worldY: 50 * TILE_SIZE_SCREEN,
    worldZ: 0,
    tileX: 50,
    tileY: 50,
};
const camera = { x: 0, y: 0, zoom: 1.0 };

const PLAY_ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
const PLAY_ZOOM_STORAGE_KEY = 'game2d_camera_zoom';
const keys: Record<string, boolean> = {};
const gridMovement = createGridMovementController();
const npcs: GameEntity[] = [];
const speedBuffs = new SpeedBuffManager();
const characterSpeed: CharacterSpeedState = createDefaultCharacterSpeed();

let activeCharacterController: SpriteAnimationController;
let gameNet: GameNetClient | null = null;
const remoteSprites = new RemotePlayerSpriteManager();

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const statusPosEl = document.getElementById('statusPos');
const statusZEl = document.getElementById('statusZ');
const statusMapNameEl = document.getElementById('statusMapName');
const playCharNameEl = document.getElementById('playCharName');

function setActiveMapSize(size: number): void {
    activeMapSize = Math.min(ENGINE_CONFIG.MAP_SIZE, Math.max(8, size));
}

function createCollisionContext(): CollisionQueryContext {
    return {
        worldMap,
        tileRegistry: TILE_TYPES,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
        minFloorZ: ENGINE_CONFIG.MIN_FLOOR_Z,
        maxFloorZ: ENGINE_CONFIG.MAX_FLOOR_Z,
        collisionEnabled: true,
        hasBoatEquipped: false,
        grassOverlay: grassOverlayMap,
        itemsOverlay: itemsOverlayMap,
    };
}

function isWalkable(
    worldX: number,
    worldY: number,
    z: number
): {
    walkable: boolean;
    speed: number;
    isStair: boolean;
    stairDir?: 'up' | 'down';
} {
    try {
        const result = queryWalkable(createCollisionContext(), worldX, worldY, z);
        if (!result.walkable) return result;

        // Impede o jogador de passar por cima de NPCs
        const tx = Math.floor(worldX / TILE_SIZE_SCREEN);
        const ty = Math.floor(worldY / TILE_SIZE_SCREEN);
        if (isEntityAtTile(tx, ty, z, 'player')) {
            return { walkable: false, speed: 0, isStair: false };
        }

        return result;
    } catch (err) {
        console.error('Erro em isWalkable:', err);
        return { walkable: false, speed: 0, isStair: false };
    }
}

function isStairHoleAtTile(tx: number, ty: number, z: number): boolean {
    return engineIsStairHoleAtTile(createCollisionContext(), tx, ty, z);
}

function getStepDurationForTile(tx: number, ty: number, z: number): number {
    const terrainModifier = getTerrainSpeedModifierAt(createCollisionContext(), tx, ty, z);
    return resolveFullStepDuration({
        stats: characterSpeed,
        role: 'Player',
        buffTotals: speedBuffs.getTotals(),
        terrainModifier,
    }).stepDurationMs;
}

function refreshPlayerMovementSpeed(nowMs = performance.now()): void {
    speedBuffs.tick(nowMs);
    const dur = getStepDurationForTile(player.tileX, player.tileY, player.worldZ);
    setGridStepDuration(gridMovement, dur);
}

function getPlayerTileKey(): string {
    return `${player.tileX}_${player.tileY}_${player.worldZ}`;
}

function resetPortalTriggerState(): void {
    previousPlayerTileKey = getPlayerTileKey();
    portalCooldownUntil = performance.now() + 700;
}

function updateActiveMapHud(): void {
    if (!statusMapNameEl) return;
    const entry = currentMapId ? getMapById(currentMapId) : undefined;
    const baseName = entry?.name ?? currentMapId ?? '—';
    if (isInsideMapInstance()) {
        statusMapNameEl.textContent = `${baseName} · #${getActiveInstanceShortLabel()}`;
    } else {
        statusMapNameEl.textContent = baseName;
    }
}

function respawnEntities(): void {
    respawnEntitiesFromSpawns({
        spawns: worldSpawns,
        npcs,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
    });
}

function applyLoadedMap(loaded: ReturnType<typeof loadMapFromJson>): void {
    const mapEntry = loaded.mapId ? getMapById(loaded.mapId) : undefined;
    if (!mapEntry?.instanced) {
        disposeActiveMapInstance();
        clearOverworldReturnContext();
    }
    const mapSize = loaded.size ?? activeMapSize;
    worldMap = ensureAllFloors(loaded.worldMap, mapSize);
    grassOverlayMap = loaded.grassOverlay ?? createEmptyLayerMap(mapSize);
    borderOverlayMap = loaded.borderOverlay ?? createEmptyLayerMap(mapSize);
    itemsOverlayMap = loaded.itemsOverlay ?? createEmptyLayerMap(mapSize);
    setActiveMapSize(mapSize);
    worldSpawns.length = 0;
    worldSpawns.push(...(loaded.spawns || []));
    currentMapId = loaded.mapId;
    player.tileX = loaded.spawn.x;
    player.tileY = loaded.spawn.y;
    player.worldZ = clampFloorZ(loaded.spawn.z);
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
    editingFloor = player.worldZ;
    refreshPlayerMovementSpeed();
    respawnEntities();
    resetPortalTriggerState();
    updateActiveMapHud();
    invalidateBorderDrawCache();
}

function getMapById(mapId: string): MapEntry | undefined {
    return getMapEntry(mapId);
}

function getPortalAt(mapId: string, position: { x: number; y: number; z: number }) {
    return DEFAULT_GAME_DATA.portals.find((portal) =>
        portal.fromMapId === mapId &&
        portal.from.x === position.x &&
        portal.from.y === position.y &&
        portal.from.z === position.z
    );
}

let activeCharacter: CharacterRow | null = null;

function getPlayerDirection(): 'north' | 'south' | 'east' | 'west' {
    const controllerDir = activeCharacterController?.currentDirection;
    if (controllerDir === 'up') return 'north';
    if (controllerDir === 'down') return 'south';
    if (controllerDir === 'left') return 'west';
    if (controllerDir === 'right') return 'east';
    return activeCharacter?.direction ?? 'south';
}

async function resolveEnterTicket(char: CharacterRow, accountId: string): Promise<string> {
    if (isServerWsTicketEnabled()) {
        const { ticket } = await fetchWsTicket(char.id);
        return ticket;
    }
    return createEnterTicket(char.id, accountId, char.name, {
        mapId: char.mapId ?? char.spawnMapId,
        tileX: char.position?.x ?? player.tileX,
        tileY: char.position?.y ?? player.tileY,
        z: char.position?.z ?? player.worldZ,
        direction: char.direction ?? 'south',
        appearance: appearanceFromCharacter(char),
    });
}

async function saveCurrentCharacterLocation(): Promise<void> {
    if (isServerWsTicketEnabled()) return;
    if (!activeCharacter || !currentMapId) return;
    const entry = getMapById(currentMapId);
    if (!entry || entry.instanced) {
        return;
    }
    const direction = getPlayerDirection();

    try {
        await updateCharacterLocation(activeCharacter.id, {
            mapId: currentMapId,
            position: {
                x: player.tileX,
                y: player.tileY,
                z: player.worldZ,
            },
            direction,
        });
        activeCharacter.mapId = currentMapId;
        activeCharacter.position = {
            x: player.tileX,
            y: player.tileY,
            z: player.worldZ,
        };
        activeCharacter.direction = direction;
    } catch (err) {
        console.error('Failed to save character location:', err);
    }
}

let locationAutosaveStarted = false;
let locationAutosaveIntervalId: number | null = null;

function handleBeforeUnload(): void {
    void saveCurrentCharacterLocation();
}

function setupLocationAutosave(): void {
    if (isServerWsTicketEnabled()) return;
    if (locationAutosaveStarted) return;
    locationAutosaveStarted = true;

    window.addEventListener('beforeunload', handleBeforeUnload);

    locationAutosaveIntervalId = window.setInterval(() => {
        void saveCurrentCharacterLocation();
    }, 10000);
}

/** Grava posição imediatamente (ex.: trocar personagem, sair do jogo). */
export async function flushCharacterLocationSave(): Promise<void> {
    await saveCurrentCharacterLocation();
}

export async function stopLocationAutosave(): Promise<void> {
    if (locationAutosaveStarted) {
        locationAutosaveStarted = false;
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (locationAutosaveIntervalId !== null) {
            window.clearInterval(locationAutosaveIntervalId);
            locationAutosaveIntervalId = null;
        }
    }
    await flushCharacterLocationSave();
}


async function transitionToMap(
    targetMapId: string,
    overrideSpawn?: { x: number; y: number; z: number }
): Promise<void> {
    if (isTransitioningMap) return;
    const entry = getMapById(targetMapId);
    if (!entry) return;
    isTransitioningMap = true;
    showLoading(`Carregando ${entry.name}…`);
    try {
        if (entry.instanced) {
            captureOverworldReturnIfNeeded(currentMapId, {
                x: player.tileX,
                y: player.tileY,
                z: player.worldZ,
            });
            disposeActiveMapInstance();
            const template = await loadWorldMap(entry, TILE_TYPES);
            const { data } = createMapInstanceFromTemplate(entry.id, template);
            applyLoadedMap({ ...data, mapId: entry.id, spawn: overrideSpawn ?? data.spawn });
        } else {
            disposeActiveMapInstance();
            clearOverworldReturnContext();
            const loaded = await loadWorldMap(entry, TILE_TYPES);
            applyLoadedMap({
                ...loaded,
                mapId: loaded.mapId ?? entry.id,
                spawn: overrideSpawn ?? loaded.spawn,
            });
        }
        if (overrideSpawn) {
            player.tileX = overrideSpawn.x;
            player.tileY = overrideSpawn.y;
            player.worldZ = clampFloorZ(overrideSpawn.z);
            syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
        }
        if (!entry.instanced) {
            void saveCurrentCharacterLocation();
        }
    } finally {
        isTransitioningMap = false;
        hideLoading();
    }
}

function showLoading(msg: string): void {
    const el = document.getElementById('loadingScreen');
    const m = document.getElementById('loadingMsg');
    if (m) m.textContent = msg;
    if (el) el.style.display = 'flex';
}

function hideLoading(): void {
    const el = document.getElementById('loadingScreen');
    if (el) {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 500);
    }
}

function isEntityAtTile(tx: number, ty: number, z: number, excludeId?: string): boolean {
    if (excludeId !== 'player' && player.tileX === tx && player.tileY === ty && player.worldZ === z) {
        return true;
    }
    for (const npc of npcs) {
        if (npc.id !== excludeId && npc.tileX === tx && npc.tileY === ty && npc.worldZ === z) {
            return true;
        }
    }
    return false;
}

function update(): void {
    const nowMs = performance.now();
    NpcAI.tickNpcAI({
        nowMs,
        npcs,
        player,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        isEntityAtTile,
        queryWalkable: (ctx, px, py, z) => queryWalkable(ctx, px, py, z),
        createCollisionContext: () => createCollisionContext(),
    });
    speedBuffs.tick(nowMs);
    const result = PlayerMovement.updateMovement({
        keys,
        player,
        gridMovement,
        activeCharacterController,
        camera,
        canvas,
        TILE_SIZE_SCREEN,
        MAP_SIZE: activeMapSize,
        ENGINE_CONFIG,
        editingFloor,
        isWalkable: (x, y, z) => isWalkable(x, y, z),
        isStairHoleAtTile,
        getStepDurationForTile,
        updateFloorButtons: () => {},
        refreshPlayerMovementSpeed,
        posXEl: document.getElementById('posX') as HTMLElement,
        posYEl: document.getElementById('posY') as HTMLElement,
        posZEl: document.getElementById('posZ') as HTMLElement,
    });
    editingFloor = result.editingFloor;

    const currentTileKey = getPlayerTileKey();
    const enteredNewTile = currentTileKey !== previousPlayerTileKey;
    if (enteredNewTile) previousPlayerTileKey = currentTileKey;

    if (
        enteredNewTile &&
        !isTransitioningMap &&
        performance.now() >= portalCooldownUntil &&
        currentMapId
    ) {
        const portal = getPortalAt(currentMapId, {
            x: player.tileX,
            y: player.tileY,
            z: player.worldZ,
        });
        if (portal && getMapEntry(portal.toMapId)) {
            void transitionToMap(portal.toMapId, {
                x: portal.to.x,
                y: portal.to.y,
                z: portal.to.z,
            });
        }
    }

    if (statusPosEl) statusPosEl.textContent = `${player.tileX}, ${player.tileY}`;
    if (statusZEl) statusZEl.textContent = String(player.worldZ);
    if (gameNet && currentMapId) {
        remoteSprites.sync(
            gameNet.getRemotePlayers(currentMapId, gameNet.getNetworkInstanceId())
        );
        remoteSprites.tick(nowMs);
    }
    gameNet?.syncPositionIfChanged();
}

function getPlayBorderDrawContext() {
    const borderConfig = getPlayBorderConfig();
    return {
        worldMap,
        grassOverlay: grassOverlayMap,
        borderOverlay: borderOverlayMap,
        registry: TILE_TYPES,
        fillTerrain: borderConfig.fillTerrain,
        borderSetId: borderConfig.borderSetId,
    };
}

function computePlayViewportBounds(camX: number, camY: number, zoom: number) {
    const startX = Math.max(0, Math.floor(camX / TILE_SIZE_SCREEN));
    const endX = Math.min(
        activeMapSize - 1,
        Math.floor((camX + canvas.width / zoom) / TILE_SIZE_SCREEN)
    );
    const startY = Math.max(0, Math.floor(camY / TILE_SIZE_SCREEN));
    const endY = Math.min(
        activeMapSize - 1,
        Math.floor((camY + canvas.height / zoom) / TILE_SIZE_SCREEN)
    );
    return { startX, endX, startY, endY };
}

function updatePlayZoomUi(): void {
    const zoom = camera.zoom || 1;
    const label = document.getElementById('playZoomLabel');
    const zoomIn = document.getElementById('playZoomIn') as HTMLButtonElement | null;
    const zoomOut = document.getElementById('playZoomOut') as HTMLButtonElement | null;
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    if (zoomIn) zoomIn.disabled = zoom >= PLAY_ZOOM_STEPS[PLAY_ZOOM_STEPS.length - 1] - 0.001;
    if (zoomOut) zoomOut.disabled = zoom <= PLAY_ZOOM_STEPS[0] + 0.001;
}

function setPlayZoom(nextZoom: number): void {
    const clamped = PLAY_ZOOM_STEPS.reduce((best, step) =>
        Math.abs(step - nextZoom) < Math.abs(best - nextZoom) ? step : best
    );
    camera.zoom = clamped;
    updatePlayZoomUi();
    try {
        localStorage.setItem(PLAY_ZOOM_STORAGE_KEY, String(clamped));
    } catch {
        /* ignore */
    }
}

function stepPlayZoom(delta: 1 | -1): void {
    const current = camera.zoom || 1;
    let idx = PLAY_ZOOM_STEPS.findIndex((z) => Math.abs(z - current) < 0.001);
    if (idx < 0) {
        idx = PLAY_ZOOM_STEPS.findIndex((z) => z > current);
        if (idx < 0) idx = PLAY_ZOOM_STEPS.length - 1;
        else if (delta < 0) idx -= 1;
    }
    const nextIdx = Math.max(0, Math.min(PLAY_ZOOM_STEPS.length - 1, idx + delta));
    if (PLAY_ZOOM_STEPS[nextIdx] !== current) {
        setPlayZoom(PLAY_ZOOM_STEPS[nextIdx]);
    }
}

function setupPlayZoomControls(): void {
    try {
        const saved = localStorage.getItem(PLAY_ZOOM_STORAGE_KEY);
        if (saved) {
            const parsed = parseFloat(saved);
            if (!Number.isNaN(parsed) && parsed > 0) {
                setPlayZoom(parsed);
            }
        }
    } catch {
        /* ignore */
    }
    updatePlayZoomUi();

    document.getElementById('playZoomIn')?.addEventListener('click', () => stepPlayZoom(1));
    document.getElementById('playZoomOut')?.addEventListener('click', () => stepPlayZoom(-1));
}

function draw(): void {
    const zoom = camera.zoom || 1;

    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = false;

    const camX = Math.round(camera.x * zoom) / zoom;
    const camY = Math.round(camera.y * zoom) / zoom;
    const camState = { x: camX, y: camY, zoom };

    const borderDrawCtx = getPlayBorderDrawContext();
    const borderMaskIndex = buildBorderMaskTileIndex(
        borderDrawCtx.registry,
        borderDrawCtx.borderSetId
    );

    const { startX, endX, startY, endY } = computePlayViewportBounds(camX, camY, zoom);
    const viewW = canvas.width / zoom;
    const viewH = canvas.height / zoom;

    getAllFloorZs().forEach((z) => {
        const isAbove = z > player.worldZ;
        let playerUnder = false;
        if (isAbove && worldMap[z]?.[player.tileY]?.[player.tileX] !== -1) {
            playerUnder = true;
        }
        ctx.globalAlpha = isAbove && playerUnder ? 0.3 : 1;

        const drawLayerTile = (
            tid: number | undefined,
            tx: number,
            ty: number,
            options?: { skipBorderTiles?: boolean }
        ) => {
            if (tid === undefined || tid === -1) return;
            const tile = TILE_TYPES[tid];
            if (options?.skipBorderTiles && isMapBorderTile(tile)) return;
            if (tile?.image?.complete) {
                drawRegistryTile(
                    ctx,
                    tile,
                    tx * TILE_SIZE_SCREEN - camX,
                    ty * TILE_SIZE_SCREEN - camY,
                    TILE_SIZE_SCREEN
                );
            }
        };

        // Pass 1: Draw ground layer
        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                drawLayerTile(worldMap[z]?.[y]?.[x], x, y, { skipBorderTiles: true });
                drawLayerTile(getLayerCell(grassOverlayMap, z, x, y), x, y);
                const grassTid = getLayerCell(grassOverlayMap, z, x, y);
                if (grassTid === ENGINE_CONFIG.EMPTY_TILE_ID) {
                    for (const borderTid of collectBorderDrawTileIdsCached(
                        borderDrawCtx,
                        z,
                        x,
                        y,
                        borderMaskIndex
                    )) {
                        drawLayerTile(borderTid, x, y);
                    }
                }
            }
        }

        // Pass 2: Y-sort — itens, NPCs, remotos e jogador local por profundidade (pé)
        const depthDrawables = [
            ...collectItemDepthDrawables({
                z,
                viewport: { startX, endX, startY, endY },
                itemsOverlay: itemsOverlayMap,
                registry: TILE_TYPES,
                camera: camState,
                tileSize: TILE_SIZE_SCREEN,
                viewWidth: viewW,
                viewHeight: viewH,
                mapSize: activeMapSize,
                edgeFadePx: DEFAULT_ITEM_EDGE_FADE_PX,
            }),
            ...collectNpcDepthDrawables(npcs, z, camState, TILE_SIZE_SCREEN),
        ];

        if (currentMapId && gameNet) {
            const remoteEntries = remoteSprites.buildRemoteDepthEntries(
                gameNet.getRemotePlayers(currentMapId, gameNet.getNetworkInstanceId())
            );
            depthDrawables.push(
                ...collectRemoteDepthDrawables(remoteEntries, z, camState, TILE_SIZE_SCREEN)
            );
        }

        const localDrawable = collectLocalPlayerDepthDrawable({
            worldX: player.worldX,
            worldY: player.worldY,
            worldZ: player.worldZ,
            z,
            camera: camState,
            tileSize: TILE_SIZE_SCREEN,
            getSourceRect: () => activeCharacterController.getSourceRect(),
            image: activeCharacterController.image,
            isLoaded: activeCharacterController.isLoaded,
            name: activeCharacterController.config.name,
            zoom,
            nameStyle: 'play',
        });
        if (localDrawable) depthDrawables.push(localDrawable);

        sortDepthDrawables(depthDrawables);
        ctx.globalAlpha = 1;
        drawDepthSorted(ctx, depthDrawables);

        // Portais (UI) após Y-sort
        if (currentMapId && z === player.worldZ) {
            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const portal = getPortalAt(currentMapId, { x, y, z });
                    if (!portal) continue;
                    const pulse = (Math.sin(Date.now() / 400) + 1) / 2;
                    ctx.fillStyle = `rgba(99, 102, 241, ${0.35 + pulse * 0.25})`;
                    ctx.fillRect(
                        x * TILE_SIZE_SCREEN - camX,
                        y * TILE_SIZE_SCREEN - camY,
                        TILE_SIZE_SCREEN,
                        TILE_SIZE_SCREEN
                    );
                }
            }
        }
    });

    ctx.restore();
}

function loop(): void {
    update();
    draw();
    requestAnimationFrame(loop);
}

function resize(): void {
    const container = document.getElementById('canvasContainer')!;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.imageSmoothingEnabled = false;
}

function resolveGameServerUrl(): string | null {
    const env = import.meta.env.VITE_GAME_SERVER_WS;
    if (env === 'false' || env === '0') return null;
    if (env && env.length > 0) return env;
    if (import.meta.env.DEV) return `ws://localhost:${DEFAULT_WS_PORT}`;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
}

function setupNetwork(char: CharacterRow, accountId: string): void {
    const url = resolveGameServerUrl();
    if (!url) return;
    const localAppearance = appearanceFromCharacter(char);
    let ticket: string | undefined;

    const refreshTicket = async (): Promise<string | undefined> => {
        try {
            const t = await resolveEnterTicket(char, accountId);
            ticket = t;
            return t;
        } catch (err) {
            console.error('[playApp] falha ao obter ticket WS:', err);
            return undefined;
        }
    };

    gameNet = new GameNetClient({
        url,
        getEnterTicket: () => ticket,
        refreshEnterTicket: isServerWsTicketEnabled() ? refreshTicket : undefined,
        getLocalState: () => ({
            name: char.name,
            mapId: currentMapId ?? char.spawnMapId,
            instanceId: gameNet?.getNetworkInstanceId(),
            tileX: player.tileX,
            tileY: player.tileY,
            z: player.worldZ,
            direction: getPlayerDirection(),
            appearance: localAppearance,
            stepDurationMs:
                gridMovement.lastCompletedStepDurationMs || gridMovement.stepDurationMs,
        }),
        isMovementStepping: () => gridMovement.stepping,
        onPositionCorrection: (pos) => {
            if (pos.mapId !== (currentMapId ?? char.spawnMapId)) return;
            player.tileX = pos.tileX;
            player.tileY = pos.tileY;
            player.worldZ = clampFloorZ(pos.z);
            gridMovement.stepping = false;
            gridMovement.activeStepFacing = null;
            resetGridMovementInputState(gridMovement);
            syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
        },
    });

    void refreshTicket().then((t) => {
        if (t) gameNet!.connect();
    });
}

export async function startPlay(character: CharacterRow, accountId: string): Promise<void> {
    activeCharacter = character;
    if (playCharNameEl) playCharNameEl.textContent = character.name;
    updateCharacterStatsUi(character);

    const outfit = { ...character.outfitConfig } as CharacterSpriteConfig;
    // Sincroniza a configuração do sprite em tempo real a partir do JSON oficial
    const jsonUrl = '/' + outfit.spriteSheetUrl.replace(/\.png$/i, '.json');
    try {
        const res = await fetch(jsonUrl);
        if (res.ok) {
            const realConfig = await res.json();
            Object.assign(outfit, realConfig);
            console.log('[playApp] Configuração de outfit carregada e atualizada com sucesso:', outfit);
        }
    } catch (e) {
        console.error('[playApp] Falha ao atualizar configuração do outfit:', e);
    }

    activeCharacterController = new SpriteAnimationController(outfit);

    await prepareMapRegistry();

    const entry =
        getMapById(character.mapId) ??
        getMapById(character.spawnMapId) ??
        getMapById('rookgaard') ??
        MAP_REGISTRY[0];
    if (!entry) throw new Error('Mapa inicial não encontrado.');

    const savedSpawn = character.position
        ? {
              x: character.position.x,
              y: character.position.y,
              z: character.position.z,
          }
        : undefined;

    showLoading('Carregando mundo…');
    await loadCreaturePresets();
    await loadPlayBorderConfig();
    TILE_TYPES = await prepareTileRegistry();
    const loaded = await loadWorldMap(entry, TILE_TYPES);
    const spawn = resolveEffectiveSpawn(
        loaded.worldMap,
        loaded.size,
        loaded.spawn,
        savedSpawn,
        loaded.grassOverlay
    );
    applyLoadedMap({
        ...loaded,
        mapId: entry.id,
        spawn,
    });
    invalidateBorderDrawCache();

    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('resize', resize);
    resize();
    hideLoading();

    setupLocationAutosave();
    setupPlayZoomControls();

    setupNetwork(character, accountId);
    loop();
}
