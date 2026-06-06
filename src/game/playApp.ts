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
    collectCombatTargetRingDrawable,
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
import { loadItemCatalog } from '../game-data/itemCatalog';
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
import { MONSTER_STEP_MS } from '../../shared/creatureChase';
import { GameNetClient } from '../net/gameNetClient';
import { RemotePlayerSpriteManager } from '../net/remotePlayerSprites';
import { ServerCreatureSync } from '../net/serverCreatureSync';
import { appearanceFromCharacter } from '../world/playerAppearance';
import { createEnterTicket } from '../shared/enterTicket';
import type { CharacterRow } from '../shared/types';
import { updateCharacterLocation, updateCharacterProgress } from '../shared/characterStore';
import { fetchWsTicket, isServerWsTicketEnabled } from '../shared/wsTicketClient';
import { updateCharacterStatsUi } from './ui/characterStatsUi';
import { normalizeCharacterProgress } from './experience';
import { shouldCelebrateSessionLevelUp } from './playProgress';
import { getPlayBorderConfig, loadPlayBorderConfig } from './playBorderConfig';
import { resetPlayCombatInput, tickPlayCombat, getPlayCombatHoverId, getPlayCombatTargetId, updatePlayCombatHover, handlePlayCombatTargetClick, clearPlayCombatTarget, type PlayCombatServerBridge } from './playCombat';
import { ensureCombatTargetRingLoaded } from './combatTargetRing';
import { tickOfflineMonsterDeathAndRespawn } from './creatureDeathLifecycle';
import { loadRuntimeVocations } from '../game-data/vocationRegistry';
import {
    isServerAuthoritativeCreatures,
    isServerAuthoritativePosition,
} from './serverAuthority';
import { setupPageVisibilityHandlers } from './pageVisibility';

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
const serverCreatures = new ServerCreatureSync();

const CREATURE_SYNC_LOADING_TIMEOUT_MS = 3000;
let playBootStartedAt = 0;
let pendingCreatureSyncLoading = false;
let creatureSyncLoadingTimer: ReturnType<typeof setTimeout> | null = null;
let teardownPageVisibility: (() => void) | null = null;

function resolveGameServerUrl(): string | null {
    const env = import.meta.env.VITE_GAME_SERVER_WS;
    if (env === 'false' || env === '0') return null;
    if (env && env.length > 0) return env;
    if (import.meta.env.DEV) return `ws://localhost:${DEFAULT_WS_PORT}`;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
}

function isMultiplayerConfigured(): boolean {
    return Boolean(resolveGameServerUrl());
}

function isPlayJoinDebugEnabled(): boolean {
    try {
        return localStorage.getItem('debug.play.join') === '1';
    } catch {
        return false;
    }
}

function logPlayJoinTimeline(event: string, detail?: Record<string, unknown>): void {
    if (!isPlayJoinDebugEnabled()) return;
    const elapsed =
        playBootStartedAt > 0 ? Math.round(performance.now() - playBootStartedAt) : 0;
    if (detail) {
        console.log(`[play.join +${elapsed}ms] ${event}`, detail);
    } else {
        console.log(`[play.join +${elapsed}ms] ${event}`);
    }
}

function releaseCreatureSyncLoading(): void {
    if (!pendingCreatureSyncLoading) return;
    pendingCreatureSyncLoading = false;
    if (creatureSyncLoadingTimer) {
        clearTimeout(creatureSyncLoadingTimer);
        creatureSyncLoadingTimer = null;
    }
    hideLoading();
    logPlayJoinTimeline('hideLoading (creature sync ready)');
}

function beginCreatureSyncLoadingGate(): void {
    pendingCreatureSyncLoading = true;
    showLoading('Sincronizando criaturas…');
    creatureSyncLoadingTimer = setTimeout(() => {
        logPlayJoinTimeline('creature sync timeout — releasing loading');
        releaseCreatureSyncLoading();
    }, CREATURE_SYNC_LOADING_TIMEOUT_MS);
}

function usesServerCreatures(): boolean {
    return isServerAuthoritativeCreatures(Boolean(gameNet?.isConnected())) && Boolean(currentMapId);
}

function stripLocalMonsters(): void {
    for (let i = npcs.length - 1; i >= 0; i--) {
        if (npcs[i].type === 'monster') {
            npcs.splice(i, 1);
        }
    }
}

/** Entidades locais + mobs autoritativos do servidor (quando online). */
function getPlayEntities(): GameEntity[] {
    if (usesServerCreatures()) {
        return [...npcs.filter((n) => n.type === 'npc'), ...serverCreatures.getEntities()];
    }
    return npcs;
}

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

function isTerrainWalkable(
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
        return queryWalkable(createCollisionContext(), worldX, worldY, z);
    } catch (err) {
        console.error('Erro em isTerrainWalkable:', err);
        return { walkable: false, speed: 0, isStair: false };
    }
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
        const result = isTerrainWalkable(worldX, worldY, z);
        if (!result.walkable) return result;

        // Impede o jogador de passar por cima de NPCs/mobs
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
    const spawns = isMultiplayerConfigured()
        ? worldSpawns.filter((s) => s.type === 'npc')
        : worldSpawns;
    const localMonsters = spawns.filter((s) => s.type === 'monster').length;
    logPlayJoinTimeline('respawnEntities', {
        multiplayer: isMultiplayerConfigured(),
        serverConnected: Boolean(gameNet?.isConnected()),
        localMonsters,
        localNpcs: spawns.filter((s) => s.type === 'npc').length,
    });
    respawnEntitiesFromSpawns({
        spawns,
        npcs,
        mapSize: activeMapSize,
        tileSize: TILE_SIZE_SCREEN,
    });
}

/** Recarrega presets (visualSize/drawScale) e respawna NPCs — útil após editar mob no Studio. */
async function reloadCreaturePresetsForPlay(): Promise<void> {
    await loadItemCatalog();
    await loadCreaturePresets();
    if (worldSpawns.length > 0) respawnEntities();
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
        level: char.level ?? 1,
        experience: char.experience ?? 0,
    });
}

async function saveCurrentCharacterLocation(): Promise<void> {
    if (isServerAuthoritativePosition()) return;
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
    void flushProgressSave();
}

function triggerPlayAttackAnimation(): void {
    activeCharacterController.setState('attack');
    activeCharacterController.onAnimationEndCallback = () => {
        if (gridMovement.stepping) {
            activeCharacterController.setState('walk');
        } else {
            activeCharacterController.setState('idle');
        }
    };
}

function setupPlayCombatControls(): void {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!activeCharacter) return;
        handlePlayCombatTargetClick({
            clientX: e.clientX,
            clientY: e.clientY,
            canvas,
            camera,
            npcs: getPlayEntities(),
            playerZ: player.worldZ,
            tileSize: TILE_SIZE_SCREEN,
        });
    });

    canvas.addEventListener('pointerdown', (e) => {
        const isTouch = e.pointerType === 'touch';
        const isCoarseTap = coarsePointer && e.button === 0 && e.pointerType === 'mouse';
        if (!isTouch && !isCoarseTap) return;
        if (!activeCharacter) return;

        const selected = handlePlayCombatTargetClick({
            clientX: e.clientX,
            clientY: e.clientY,
            canvas,
            camera,
            npcs: getPlayEntities(),
            playerZ: player.worldZ,
            tileSize: TILE_SIZE_SCREEN,
        });
        if (selected) e.preventDefault();
    });

    if (!coarsePointer) {
        canvas.addEventListener('mousemove', (e) => {
            updatePlayCombatHover({
                clientX: e.clientX,
                clientY: e.clientY,
                canvas,
                camera,
                npcs: getPlayEntities(),
                playerZ: player.worldZ,
                tileSize: TILE_SIZE_SCREEN,
                enabled: true,
            });
        });
        canvas.addEventListener('mouseleave', () => {
            updatePlayCombatHover({
                clientX: 0,
                clientY: 0,
                canvas,
                camera,
                npcs: getPlayEntities(),
                playerZ: player.worldZ,
                tileSize: TILE_SIZE_SCREEN,
                enabled: false,
            });
        });
    }
}

function faceTowardEntity(target: GameEntity): void {
    const foot = target.getFootTile(TILE_SIZE_SCREEN);
    const dx = foot.tileX - player.tileX;
    const dy = foot.tileY - player.tileY;
    if (Math.abs(dx) > Math.abs(dy)) {
        activeCharacterController.setDirection(dx > 0 ? 'right' : 'left');
    } else {
        activeCharacterController.setDirection(dy > 0 ? 'down' : 'up');
    }
}

let pendingProgressSave: { level: number; experience: number } | null = null;
let progressSaveTimerId: number | null = null;
/** Level conhecido nesta sessão — banner só quando sobe acima deste valor. */
let playSessionLevel = 1;

function applyPlayProgressUpdate(level: number, experience: number): void {
    if (!activeCharacter) return;

    const leveledUp = shouldCelebrateSessionLevelUp(playSessionLevel, level);

    activeCharacter.experience = experience;
    activeCharacter.level = level;
    characterSpeed.level = level;
    playSessionLevel = level;

    updateCharacterStatsUi(activeCharacter, { flashLevel: leveledUp });
    if (leveledUp) {
        refreshPlayerMovementSpeed(performance.now());
    }
    scheduleProgressSave(leveledUp);
}

function scheduleProgressSave(immediate = false): void {
    if (!activeCharacter) return;
    pendingProgressSave = {
        level: activeCharacter.level ?? 1,
        experience: activeCharacter.experience ?? 0,
    };
    if (immediate) {
        void flushProgressSave();
        return;
    }
    if (progressSaveTimerId !== null) {
        window.clearTimeout(progressSaveTimerId);
    }
    progressSaveTimerId = window.setTimeout(() => {
        progressSaveTimerId = null;
        void flushProgressSave();
    }, 2000);
}

async function flushProgressSave(): Promise<void> {
    if (!activeCharacter || !pendingProgressSave) return;
    const snapshot = { ...pendingProgressSave };
    pendingProgressSave = null;
    try {
        await updateCharacterProgress(activeCharacter.id, snapshot);
        activeCharacter.level = snapshot.level;
        activeCharacter.experience = snapshot.experience;
        if (activeCharacter.outfitConfig) {
            const config = activeCharacter.outfitConfig as CharacterSpriteConfig & {
                level?: number;
                experience?: number;
            };
            config.level = snapshot.level;
            config.experience = snapshot.experience;
        }
    } catch (err) {
        console.error('Failed to save character progress:', err);
    }
}

function setupLocationAutosave(): void {
    if (isServerAuthoritativePosition()) return;
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
    await flushProgressSave();
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

function isPlayerOccupyingTile(tx: number, ty: number, z: number): boolean {
    if (player.worldZ !== z) return false;
    if (player.tileX === tx && player.tileY === ty) return true;
    if (
        gridMovement.stepping &&
        gridMovement.destTileX === tx &&
        gridMovement.destTileY === ty
    ) {
        return true;
    }
    return false;
}

function canCommitPlayerStepToTile(destTileX: number, destTileY: number, z: number): boolean {
    const wx = destTileX * TILE_SIZE_SCREEN;
    const wy = destTileY * TILE_SIZE_SCREEN;
    return isWalkable(wx, wy, z).walkable;
}

function isEntityAtTile(tx: number, ty: number, z: number, excludeId?: string): boolean {
    if (excludeId !== 'player' && isPlayerOccupyingTile(tx, ty, z)) {
        return true;
    }
    for (const npc of getPlayEntities()) {
        if (npc.id === excludeId || npc.isDead) continue;
        if (npc.occupiesTile(tx, ty, z, TILE_SIZE_SCREEN)) {
            return true;
        }
    }
    return false;
}

function update(): void {
    const nowMs = performance.now();
    const playEntities = getPlayEntities();
    const aiEntities = usesServerCreatures() ? npcs.filter((n) => n.type === 'npc') : npcs;

    if (aiEntities.length > 0) {
        NpcAI.tickNpcAI({
            nowMs,
            npcs: aiEntities,
            player,
            TILE_SIZE_SCREEN,
            MAP_SIZE: activeMapSize,
            isEntityAtTile,
            queryWalkable: (ctx, px, py, z) => queryWalkable(ctx, px, py, z),
            createCollisionContext: () => createCollisionContext(),
        });
    }

    if (usesServerCreatures()) {
        serverCreatures.tick(nowMs);
    } else {
        tickOfflineMonsterDeathAndRespawn(npcs, nowMs, TILE_SIZE_SCREEN);
    }
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
        isTerrainWalkable: (x, y, z) => isTerrainWalkable(x, y, z),
        canCommitStepToTile: canCommitPlayerStepToTile,
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

    if (activeCharacter) {
        tickPlayCombat({
            nowMs,
            stepping: gridMovement.stepping,
            npcs: playEntities,
            player,
            character: activeCharacter,
            characterSpeed,
            server: buildPlayCombatServerBridge(),
            callbacks: {
                faceToward: faceTowardEntity,
                onAttackSwing: triggerPlayAttackAnimation,
                onDamage: (target, damage) => {
                    target.spawnFloatingDamage(damage, nowMs);
                },
                onMonsterKilled: (target, xpReward) => {
                    target.speak(`+${xpReward} XP`, 1800);
                },
                onProgressUpdated: ({ experience, level }) => {
                    applyPlayProgressUpdate(level, experience);
                },
            },
        });
    }
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
    const nowMs = performance.now();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
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
            ...collectCombatTargetRingDrawable(
                getPlayEntities(),
                getPlayCombatTargetId(),
                z,
                camState,
                TILE_SIZE_SCREEN,
                nowMs
            ),
            ...collectNpcDepthDrawables(getPlayEntities(), z, camState, TILE_SIZE_SCREEN, {
                drawNames: true,
                highlightEntityId: getPlayCombatHoverId(),
                nowMs,
            }),
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
            name: activeCharacter?.name || activeCharacterController.config.name || 'Jogador',
            zoom,
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

function clearPlayMovementInput(): void {
    for (const key of Object.keys(keys)) {
        keys[key] = false;
    }
    gridMovement.stepping = false;
    resetGridMovementInputState(gridMovement);
}

function handlePlayPageHidden(): void {
    clearPlayMovementInput();
}

function handlePlayPageVisible(): void {
    serverCreatures.resetFrameClock();
    serverCreatures.snapAllToAuthoritativeTiles();
    remoteSprites.snapAllToAuthoritativeTiles();
    if (gameNet?.isConnected()) {
        gameNet.requestRoomResync();
    }
    void reloadCreaturePresetsForPlay();
}

function loop(): void {
    update();
    draw();
    requestAnimationFrame(loop);
}

function resize(): void {
    const container = document.getElementById('canvasContainer')!;
    const w = Math.floor(container.clientWidth);
    const h = Math.floor(container.clientHeight);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.imageSmoothingEnabled = false;
}

function resolveGameServerUrlForPlay(): string | null {
    return resolveGameServerUrl();
}

function buildPlayCombatServerBridge(): PlayCombatServerBridge | undefined {
    if (!resolveGameServerUrlForPlay()) return undefined;
    return {
        wsConnected: gameNet?.isConnected() ?? false,
        multiplayerConfigured: true,
        sendAttack: (creatureId) => {
            if (gameNet?.isConnected() && currentMapId) {
                gameNet.sendAttack(creatureId, currentMapId, gameNet.getNetworkInstanceId());
            }
        },
    };
}

function syncProgressToServer(): void {
    if (!activeCharacter || !gameNet?.isConnected()) return;
    const progress = normalizeCharacterProgress(activeCharacter.experience, activeCharacter.level);
    activeCharacter.experience = progress.experience;
    activeCharacter.level = progress.level;
    characterSpeed.level = progress.level;
    gameNet.sendProgressSync(progress.level, progress.experience);
}

function setupNetwork(
    char: CharacterRow,
    accountId: string,
    options?: {
        initialTicket?: string;
    }
): void {
    const url = resolveGameServerUrl();
    if (!url) return;
    const localAppearance = appearanceFromCharacter(char);
    let ticket: string | undefined = options?.initialTicket;

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
            steppingDestTileX: gridMovement.stepping ? gridMovement.destTileX : undefined,
            steppingDestTileY: gridMovement.stepping ? gridMovement.destTileY : undefined,
            level: activeCharacter?.level,
            experience: activeCharacter?.experience,
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
        onStatusChange: (status) => {
            if (status === 'connected') {
                logPlayJoinTimeline('ws connected — stripLocalMonsters');
                stripLocalMonsters();
            } else if (status === 'disconnected') {
                logPlayJoinTimeline('ws disconnected — clear server creatures');
                serverCreatures.clear();
                respawnEntities();
            }
        },
        onWelcome: () => {
            logPlayJoinTimeline('welcome received');
            syncProgressToServer();
        },
        onCreatureSync: ({ mapId, instanceId, creatures }) => {
            if (!currentMapId || mapId !== currentMapId) return;
            logPlayJoinTimeline('onCreatureSync', {
                count: creatures.length,
                sample: creatures.slice(0, 3).map((c) => ({
                    id: c.creatureId,
                    tile: `${c.tileX},${c.tileY}`,
                    direction: c.direction,
                })),
            });
            stripLocalMonsters();
            serverCreatures.applySync(
                creatures,
                mapId,
                instanceId ?? gameNet?.getNetworkInstanceId()
            );
            releaseCreatureSyncLoading();
        },
        onCreatureMoved: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            serverCreatures.applyMoved(
                msg,
                msg.stepDurationMs ?? MONSTER_STEP_MS,
                performance.now()
            );
        },
        onCreatureDamaged: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            serverCreatures.applyDamaged(
                msg.creatureId,
                msg.health,
                msg.maxHealth,
                msg.damage
            );
        },
        onCreatureDied: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            const entity = serverCreatures.applyDied(msg.creatureId);
            if (
                entity &&
                msg.killerPlayerId &&
                msg.killerPlayerId === gameNet?.getLocalPlayerId()
            ) {
                entity.speak(`+${msg.xpReward} XP`, 1800);
            }
        },
        onCreatureRespawned: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            serverCreatures.applyRespawned(msg);
        },
        onPlayerProgress: (msg) => {
            applyPlayProgressUpdate(msg.level, msg.experience);
        },
    });

    if (ticket !== undefined) {
        logPlayJoinTimeline('connect (prefetched ticket)');
        gameNet.connect();
    } else {
        void refreshTicket().finally(() => {
            logPlayJoinTimeline('connect (ticket fetched)');
            gameNet!.connect();
        });
    }
}

export async function startPlay(character: CharacterRow, accountId: string): Promise<void> {
    activeCharacter = character;
    resetPlayCombatInput();
    ensureCombatTargetRingLoaded();

    await loadRuntimeVocations();

    const progress = normalizeCharacterProgress(character.experience, character.level);
    character.experience = progress.experience;
    character.level = progress.level;
    characterSpeed.level = progress.level;
    playSessionLevel = progress.level;

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
    playBootStartedAt = performance.now();
    logPlayJoinTimeline('boot start');

    const ticketPromise = isMultiplayerConfigured()
        ? resolveEnterTicket(character, accountId).catch((err) => {
              console.error('[playApp] falha ao prefetch ticket WS:', err);
              return undefined;
          })
        : Promise.resolve<string | undefined>(undefined);

    await reloadCreaturePresetsForPlay();
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
        if (e.key === 'Escape') {
            clearPlayCombatTarget();
        }
    });
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('resize', resize);
    resize();

    const prefetchedTicket = await ticketPromise;
    logPlayJoinTimeline('prefetch ticket ready', { hasTicket: Boolean(prefetchedTicket) });

    if (isMultiplayerConfigured()) {
        beginCreatureSyncLoadingGate();
    } else {
        hideLoading();
        logPlayJoinTimeline('hideLoading (offline)');
    }

    setupLocationAutosave();
    setupPlayZoomControls();
    setupPlayCombatControls();

    teardownPageVisibility?.();
    teardownPageVisibility = setupPageVisibilityHandlers({
        onHidden: handlePlayPageHidden,
        onVisible: handlePlayPageVisible,
    });

    setupNetwork(character, accountId, { initialTicket: prefetchedTicket });
    loop();
}
