import '../style.css';
import {
    consumeWorldEntryFailsafeRelease,
    finishWorldEntryOverlay,
    isWorldEntryOverlayVisible,
    isWorldEntryPending,
    resetWorldEntryOverlay,
    setWorldEntryStage,
    showWorldEntryOverlay,
    WORLD_ENTRY_FAILSAFE_EVENT,
} from '../world-entry/worldEntryOverlay';

const WORLD_ENTRY_FAILSAFE_MS = 15000;
import {
    resolveSpriteDirectionForState,
    type Direction,
} from '../character/spriteAnimation';
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
    type DepthDrawable,
} from '../engine/depthSortDraw';
import { DepthSortFingerprintCache } from '../engine/depthSortCache';
import { floorHasVisibleContentInView } from '../engine/floorViewportVisibility';
import { drawRegistryTile, isMapBorderTile } from '../engine/tileDraw';
import { SpriteAnimationController } from '../character/spriteAnimation';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import {
    buildMovementKeyState,
    createGridMovementController,
    getNetworkStepDurationMs,
    hasMovementKeyInput,
    resetGridMovementInputState,
    setGridStepDuration,
    syncGridPlayerVisual,
} from '../movement/gridMovement';
import {
    clearMovementInputBuffer,
    createMovementInputBuffer,
} from '../movement/movementInputBuffer';
import {
    clearAutoWalk,
    createAutoWalkState,
    setAutoWalkGoal,
    tickAutoWalkDirection,
} from '../movement/autoWalk';
import {
    direction8FromTiles,
    toProtocolDirection8,
    type Direction8,
} from '../../shared/movement/direction8';
import {
    beginPositionCorrectionSlide,
    createPositionCorrectionSlide,
    tickPositionCorrectionSlide,
} from '../movement/positionCorrectionSlide';
import {
    clearPendingFromSeq,
    confirmServerSeq,
    confirmServerTile,
    createClientMovementPrediction,
    getPendingPredictionCount,
    reconcileMovementPrediction,
    recordPredictedMove,
    resetClientMovementPrediction,
    type ClientMovementPrediction,
} from '../movement/clientMovementPrediction';
import type { RemotePlayerDepthEntry } from '../engine/depthSortDraw';
import { PlayerMovement } from '../movement/playerMovement';
import { NpcAI } from '../character/npcAI';
import { GameEntity } from '../character/entity';
import { respawnEntitiesFromSpawns } from '../character/respawnEntities';
import { loadCreaturePresets } from '../editor/creaturePresets';
import { loadItemCatalog } from '../game-data/itemCatalog';
import { assetLoader } from '../game-data/assetLoader';
import { createDefaultCharacterSpeed, type CharacterSpeedState } from '../character/movementSpeed';
import { SpeedBuffManager } from '../character/speedBuffs';
import { resolveFullStepDuration } from '../character/characterMovement';
import { createEmptyLayerMap, getLayerCell, type LayerMap } from '../engine/mapPaintLayers';
import { collectBorderDrawTileIdsCached, getBorderMaskTileIndexCached, invalidateBorderDrawCache } from '../engine/autoBorderEngine';
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
import { canAdjacentStep, type TilePos } from '../../shared/tileWalkable';
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
import { updatePlayHudCharacterPortrait } from './ui/playHudCharacterCard';
import {
    markPlayMinimapDirty,
    setPlayMinimapFrameProvider,
    tickPlayHudMinimap,
} from './ui/playHudMinimap';
import { updatePlayHudPing, updatePlayHudStatus, resetPlayHudStatusCache } from './ui/playHudStatusUi';
import { calculateEquipmentSpeedBonus } from '../character/equipment/equipment';
import type { CharacterInventoryDocument } from '../../shared/inventory';
import { applyPlayInventorySnapshot, initPlayHudInventory } from './ui/playHudInventory';
import { bindPlayChatNetwork, createPlayChatNetHandlers } from './chat/playChatController';
import { getPlayDefaultZoom, getPlayHudQuality, getNetworkRenderDelayMs, getPlayRenderOptions } from './ui/playHudSettings';
import {
    PLAY_DEFAULT_ZOOM_CHANGED_EVENT,
    PLAY_ZOOM_SESSION_KEY,
    PLAY_ZOOM_STEPS,
    snapPlayZoom,
} from './playZoom';
import { loadClientGameRates, resetPlayExpRateState, setPlayExpRateFromServer } from '../game-data/gameRates';
import { getExpProgress, normalizeCharacterProgress } from './experience';
import { updatePlayHudExpRateBanner } from './playExpRateUi';
import { serverStateStore } from '../net/serverStateStore';
import { shouldCelebrateSessionLevelUp } from './playProgress';
import { getPlayBorderConfig, loadPlayBorderConfig } from './playBorderConfig';
import {
    resetPlayCombatInput,
    tickPlayCombat,
    getPlayCombatHoverId,
    getPlayCombatTargetId,
    getPlayCombatTarget,
    updatePlayCombatHover,
    handlePlayCombatTargetClick,
    clearPlayCombatTarget,
    requestPlayBasicAttack,
    type PlayCombatServerBridge,
} from './playCombat';
import { loadSpellCatalog } from '../game-data/spellCatalog';
import { getPlaySpellBarState, initPlaySpellBar, loadPlaySpellBarFromServer, setPlaySpellBarSyncHandler } from './ui/playSpellBar';
import {
    initPlayLearnedSpells,
    loadPlayLearnedSpellsFromServer,
} from './playLearnedSpells';
import {
    setPlayCombatHubBridge,
    tickPlayCombatHub,
    refreshPlayCombatHubSpells,
    resetPlayCombatHubCooldownTracking,
} from './ui/playCombatHub';
import { bindPlaySpellModalCharacter, refreshPlaySpellModal } from './ui/playSpellModal';
import { resetPlaySpellCooldowns, tryCastSpellFromSlot } from './playSpellCast';
import type { SpellBarSlot } from './ui/playSpellBar';
import { toast } from '../utils/popup';
import { ensureCombatTargetRingLoaded } from './combatTargetRing';
import { ensureSpellCastSpritesLoaded } from './spellCastEffectSprites';
import { drawSpellCastEffects, resetSpellCastEffects } from './spellCastEffects';
import {
    setPlayPerfMonitorContext,
    tickPlayPerformanceMonitorFrame,
} from './debug/playPerformanceMonitor';
import { appendPlayStressDepthDrawables, getPlayStressLevel } from './debug/playStressTest';
import {
    applyPlayCameraFollow,
    computePlayCameraTarget,
    createPlayCameraJuiceState,
    snapPlayCamera,
    tickPlayScreenShake,
    triggerPlayScreenShake,
} from './playCameraJuice';
import { tickOfflineMonsterDeathAndRespawn } from './creatureDeathLifecycle';
import { loadRuntimeVocations, getVocationById } from '../game-data/vocationRegistry';
import { calculateStatsForLevel } from '../engine/character/calculateStats';
import type { VocationId } from '../../shared/types/character';
import {
    isServerAuthoritativeCreatures,
    isServerAuthoritativePosition,
} from './serverAuthority';
import { detectRuntimePlatform } from './runtime/platform';
import {
    createMobileJoystick,
    updateMobileJoystick,
} from './movement/mobileDirection8';
import { coalesceLifecycleHandler, type AppLifecycleController } from './runtime/appLifecycle';
import { setupWebLifecycle } from './runtime/webLifecycle';
import { setupElectronLifecycle } from './runtime/electronLifecycle';
import { setupCapacitorLifecycle } from './runtime/capacitorLifecycle';
import { ResyncController } from '../net/resyncController';
import type { ClientDiagnosticsController } from './debug/clientDiagnostics';
import { createClientDiagnostics } from './debug/clientDiagnostics';
import { createLocalPlayerFloatingText } from './localPlayerFloatingText';
import { getSpriteTilePlacement } from '../character/spriteDraw';
import type { PlayMinimapEntity } from './ui/playHudMinimap';

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
    health: 100,
    maxHealth: 100,
    mana: 50,
    maxMana: 50,
};
const camera = { x: 0, y: 0, zoom: 1.0 };

const keys: Record<string, boolean> = {};
const gridMovement = createGridMovementController();
const npcs: GameEntity[] = [];
const speedBuffs = new SpeedBuffManager();
const characterSpeed: CharacterSpeedState = createDefaultCharacterSpeed();

function syncPlayEquipmentSpeedBonus(inventory: CharacterInventoryDocument): void {
    characterSpeed.equipmentBonus = calculateEquipmentSpeedBonus(inventory.equipment);
}

let activeCharacterController: SpriteAnimationController;
let gameNet: GameNetClient | null = null;

function isPlayWsAuthoritative(): boolean {
    return isServerAuthoritativePosition(gameNet?.isConnected() ?? false);
}
const remoteSprites = new RemotePlayerSpriteManager();
const serverCreatures = new ServerCreatureSync();
const localPlayerFloats = createLocalPlayerFloatingText();

const CREATURE_SYNC_LOADING_TIMEOUT_MS = 3000;
let playBootStartedAt = 0;
let pendingCreatureSyncLoading = false;
let creatureSyncLoadingTimer: ReturnType<typeof setTimeout> | null = null;
let teardownPageVisibility: (() => void) | null = null;
let appLifecycleController: AppLifecycleController | null = null;
let resyncController: ResyncController | null = null;
let clientDiagnostics: ClientDiagnosticsController | null = null;

/** Buffer reutilizado no Y-sort do draw — evita alocar arrays a cada andar/frame. */
const playDepthDrawBuffer: DepthDrawable[] = [];
const playRemoteDepthBuffer: RemotePlayerDepthEntry[] = [];
const playDepthSortCache = new DepthSortFingerprintCache();
const positionCorrectionSlide = createPositionCorrectionSlide();
let movementPrediction: ClientMovementPrediction = createClientMovementPrediction({
    tileX: player.tileX,
    tileY: player.tileY,
    z: player.worldZ,
});
/** Último tile confirmado pelo servidor (`player_moved` com seq ou resync). */
let lastServerAck = {
    tileX: player.tileX,
    tileY: player.tileY,
    z: player.worldZ,
    seq: 0,
};
const playCameraJuice = createPlayCameraJuiceState();
let lastLoopMs = 0;
/** Após `MOVEMENT_TOO_FAST` — evita spam de `move` sem teleporte visual. */
let movementTooFastThrottleUntilMs = 0;
const movementInputBuffer = createMovementInputBuffer();
const autoWalkState = createAutoWalkState();
let pendingOutboundMoveSeq: number | undefined;
let frameDepthDrawables = 0;
let frameSortHits = 0;
let frameSortMisses = 0;


import { getClientRuntimeConfig } from './runtime/runtimeEnv';

function resolveGameServerUrl(): string | null {
    const runtime = getClientRuntimeConfig();
    if (runtime.wsBaseUrl) {
        return runtime.wsBaseUrl;
    }

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

function notifyWorldEntryFailsafeIfNeeded(): void {
    if (!consumeWorldEntryFailsafeRelease()) return;
    toast.info(
        'Conexão ou carregamento demorou mais que o normal. Alguns elementos podem aparecer em instantes.'
    );
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
    setWorldEntryStage('sync', 'done');
    finishWorldEntryOverlay();
    hideLoading();
    notifyWorldEntryFailsafeIfNeeded();
    logPlayJoinTimeline('hideLoading (creature sync ready)');
}

function beginCreatureSyncLoadingGate(): void {
    pendingCreatureSyncLoading = true;
    setWorldEntryStage('sync', 'active', 'Sincronizando criaturas do mundo...');
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
    const entry = currentMapId ? getMapById(currentMapId) : undefined;
    const baseName = entry?.name ?? currentMapId ?? '—';
    const label = isInsideMapInstance()
        ? `${baseName} · #${getActiveInstanceShortLabel()}`
        : baseName;
    if (statusMapNameEl) statusMapNameEl.textContent = label;
    const mobileMap = document.getElementById('statusMapNameMobile');
    if (mobileMap) mobileMap.textContent = label;
}

function syncPlayHudVitals(): void {
    if (!activeCharacter) return;
    const progress = getExpProgress(activeCharacter.experience ?? 0, activeCharacter.level ?? 1);
    updatePlayHudStatus({
        health: player.health,
        maxHealth: player.maxHealth,
        mana: player.mana,
        maxMana: player.maxMana,
        xpCurrent: progress.currentInLevel,
        xpRequired: progress.requiredForNext,
    });
    updatePlayHudPing(serverStateStore.lastPingMs);
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
    if (usesServerCreatures()) {
        serverCreatures.reloadSpriteConfigsFromPresets();
    }
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
    const zoom = camera.zoom || 1;
    const target = computePlayCameraTarget(player.worldX, player.worldY, canvas, zoom);
    snapPlayCamera(camera, target.x, target.y);
    resetClientMovementPrediction(movementPrediction, player.tileX, player.tileY, player.worldZ);
    resetLastServerAck(player.tileX, player.tileY, player.worldZ);
    editingFloor = player.worldZ;
    refreshPlayerMovementSpeed();
    respawnEntities();
    markPlayMinimapDirty();
    resetPortalTriggerState();
    updateActiveMapHud();
    invalidateBorderDrawCache();
    playDepthSortCache.clear();
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
    if (isPlayWsAuthoritative()) return;
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
    const facing = resolveSpriteDirectionForState(
        activeCharacterController.config,
        'attack',
        activeCharacterController.currentDirection
    );
    activeCharacterController.setDirection(facing);
    activeCharacterController.setState('attack', { force: true });
    activeCharacterController.onAnimationEndCallback = () => {
        if (gridMovement.stepping) {
            activeCharacterController.setState('walk');
        } else {
            activeCharacterController.setState('idle');
        }
    };
}

function triggerPlayCastAnimation(): void {
    const facing = resolveSpriteDirectionForState(
        activeCharacterController.config,
        'cast',
        activeCharacterController.currentDirection
    );
    activeCharacterController.setDirection(facing);
    activeCharacterController.setState('cast', { force: true });
    activeCharacterController.onAnimationEndCallback = () => {
        if (gridMovement.stepping) {
            activeCharacterController.setState('walk');
        } else {
            activeCharacterController.setState('idle');
        }
    };
}

function buildPlayCombatCallbacks(nowMs: number) {
    return {
        faceToward: faceTowardEntity,
        onAttackSwing: triggerPlayAttackAnimation,
        onCastSwing: triggerPlayCastAnimation,
        onDamage: (target: GameEntity, damage: number) => {
            target.spawnFloatingDamage(damage, nowMs);
        },
        onMonsterKilled: (_target: GameEntity, xpReward: number) => {
            localPlayerFloats.spawnXp(xpReward, nowMs);
        },
        onProgressUpdated: ({ experience, level }: { experience: number; level: number }) => {
            applyPlayProgressUpdate(level, experience);
        },
    };
}

function tryPlaySpellSlot(slot: SpellBarSlot): void {
    if (!activeCharacter) return;
    const nowMs = performance.now();
    tryCastSpellFromSlot(slot, {
        nowMs,
        player,
        character: activeCharacter,
        characterSpeed,
        npcs: getPlayEntities(),
        playerMana: player,
        callbacks: buildPlayCombatCallbacks(nowMs),
        server: buildPlayCombatServerBridge(),
    });
    syncPlayHudVitals();
}

function tryPlayBasicAttack(): void {
    if (!activeCharacter) return;
    if (!getPlayCombatTarget()) {
        toast.info('Selecione um alvo (clique direito no monstro).');
        return;
    }
    const nowMs = performance.now();
    const ok = requestPlayBasicAttack({
        nowMs,
        npcs: getPlayEntities(),
        player,
        character: activeCharacter,
        characterSpeed,
        callbacks: buildPlayCombatCallbacks(nowMs),
        server: buildPlayCombatServerBridge(),
        remotes: getRemoteTargetables(),
    });
    if (!ok && getPlayCombatTarget()) {
        toast.info('Aguarde o cooldown ou aproxime-se do alvo.');
    }
}

function getRemoteTargetables(): import('./playCombat').PlayCombatTargetable[] {
    if (!currentMapId || !gameNet) return [];
    return gameNet.getRemotePlayers(currentMapId, gameNet.getNetworkInstanceId()).map(p => ({
        id: p.playerId,
        tileX: p.tileX,
        tileY: p.tileY,
        z: p.z
    }));
}

function setupMobilePlayJoystick(): void {
    if (detectRuntimePlatform() !== 'capacitor') return;

    const joystick = createMobileJoystick();
    let activePointerId: number | null = null;
    const origin = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        if (relY < rect.height * 0.55) return;
        activePointerId = e.pointerId;
        origin.x = e.clientX;
        origin.y = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
        if (activePointerId !== e.pointerId) return;
        const dx = (e.clientX - origin.x) / 48;
        const dy = (e.clientY - origin.y) / 48;
        const dir = updateMobileJoystick(joystick, dx, dy, true);
        if (!dir) return;
        keys.w = dir === 'north' || dir === 'northwest' || dir === 'northeast';
        keys.s = dir === 'south' || dir === 'southwest' || dir === 'southeast';
        keys.a = dir === 'west' || dir === 'northwest' || dir === 'southwest';
        keys.d = dir === 'east' || dir === 'northeast' || dir === 'southeast';
        keys.q = dir === 'northwest';
        keys.e = dir === 'northeast';
        keys.z = dir === 'southwest';
        keys.c = dir === 'southeast';
    };

    const onPointerUp = (e: PointerEvent) => {
        if (activePointerId !== e.pointerId) return;
        activePointerId = null;
        updateMobileJoystick(joystick, 0, 0, false);
        clearPlayMovementInput();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
}

function setupPlayCombatControls(): void {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    canvas.addEventListener('click', (e) => {
        if (!e.shiftKey || !activeCharacter) return;
        const rect = canvas.getBoundingClientRect();
        const zoom = camera.zoom || 1;
        const worldX = (e.clientX - rect.left) / zoom + camera.x;
        const worldY = (e.clientY - rect.top) / zoom + camera.y;
        const goalX = Math.floor(worldX / TILE_SIZE_SCREEN);
        const goalY = Math.floor(worldY / TILE_SIZE_SCREEN);
        if (goalX === player.tileX && goalY === player.tileY) {
            clearAutoWalk(autoWalkState);
            return;
        }
        setAutoWalkGoal(
            autoWalkState,
            { tileX: player.tileX, tileY: player.tileY, z: player.worldZ },
            { tileX: goalX, tileY: goalY, z: player.worldZ },
            (x, y, z) => isTerrainWalkableAtTile(x, y, z)
        );
    });

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
            remotes: getRemoteTargetables(),
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
            remotes: getRemoteTargetables(),
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
                remotes: getRemoteTargetables(),
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

/** Tile lógico do alvo — evita jitter do deslize visual (getFootTile) ao mirar no combate. */
function faceTowardEntity(target: { tileX: number; tileY: number }): void {
    const dx = target.tileX - player.tileX;
    const dy = target.tileY - player.tileY;
    if (dx === 0 && dy === 0) return;

    let dir: Direction;
    if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > Math.abs(dx)) {
        dir = dy > 0 ? 'down' : 'up';
    } else if (dx !== 0) {
        dir = dx > 0 ? 'right' : 'left';
    } else {
        dir = dy > 0 ? 'down' : 'up';
    }

    const animState =
        activeCharacterController.currentState === 'attack' ? 'attack' : 'idle';
    dir = resolveSpriteDirectionForState(
        activeCharacterController.config,
        animState,
        dir
    );
    activeCharacterController.setDirection(dir);
}

let pendingProgressSave: { level: number; experience: number } | null = null;
let progressSaveTimerId: number | null = null;
/** Level conhecido nesta sessão — banner só quando sobe acima deste valor. */
let playSessionLevel = 1;

function applyPlayProgressUpdate(
    level: number,
    experience: number,
    options?: { health?: number; maxHealth?: number; leveledUp?: boolean }
): void {
    if (!activeCharacter) return;

    const leveledUp =
        options?.leveledUp === true ||
        shouldCelebrateSessionLevelUp(playSessionLevel, level);

    activeCharacter.experience = experience;
    activeCharacter.level = level;
    characterSpeed.level = level;
    playSessionLevel = level;

    const vocationId = (activeCharacter.vocation as VocationId) || 'knight';
    const vocationConfig = getVocationById(vocationId);
    const stats = calculateStatsForLevel(vocationConfig, level);
    player.maxHealth = options?.maxHealth ?? stats.health;
    player.maxMana = stats.mana;

    if (options?.health !== undefined) {
        player.health = options.health;
    } else if (leveledUp) {
        player.health = player.maxHealth;
        player.mana = stats.mana;
    } else {
        player.health = Math.min(player.health, player.maxHealth);
        player.mana = Math.min(player.mana, stats.mana);
    }

    updateCharacterStatsUi(activeCharacter, { flashLevel: leveledUp });
    if (leveledUp) {
        refreshPlayerMovementSpeed(performance.now());
        refreshPlaySpellModal();
        if (activeCharacter) {
            void loadPlayLearnedSpellsFromServer(
                activeCharacter.id,
                activeCharacter.vocation,
                level
            ).then(() => refreshPlaySpellModal());
        }
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
    if (isPlayWsAuthoritative()) return;
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
    if (isWorldEntryOverlayVisible()) {
        setWorldEntryStage('map', 'active', msg);
        return;
    }

    const el = document.getElementById('loadingScreen');
    const m = document.getElementById('loadingMsg');
    if (m) m.textContent = msg;
    if (el) el.style.display = 'flex';
}

function hideLoading(): void {
    if (isWorldEntryOverlayVisible()) return;

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

function isTerrainWalkableAtTile(tx: number, ty: number, z: number): boolean {
    return isTerrainWalkable(tx * TILE_SIZE_SCREEN, ty * TILE_SIZE_SCREEN, z).walkable;
}

/** Alinha validação de `move` WS com o servidor (terreno + canto) e criaturas no destino. */
function validateOutgoingNetworkMove(from: TilePos, to: TilePos): boolean {
    if (!canAdjacentStep(from, to, isTerrainWalkableAtTile)) {
        return false;
    }
    const wx = to.tileX * TILE_SIZE_SCREEN;
    const wy = to.tileY * TILE_SIZE_SCREEN;
    return isWalkable(wx, wy, to.z).walkable;
}

function validateSteppingDestForNetwork(tileX: number, tileY: number, z: number): boolean {
    const wx = tileX * TILE_SIZE_SCREEN;
    const wy = tileY * TILE_SIZE_SCREEN;
    return isWalkable(wx, wy, z).walkable;
}

/** Alinha tile lógico + visual ao tile autoritativo (sem slide). */
function snapLocalPlayerToAuthoritativeTile(tileX: number, tileY: number, z: number): void {
    player.worldZ = clampFloorZ(z);
    gridMovement.stepping = false;
    gridMovement.activeStepFacing = null;
    gridMovement.activeStepDirection = null;
    resetGridMovementInputState(gridMovement);
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN, tileX, tileY);
}

/**
 * Corrige divergência cliente/servidor após ack ou rejeição.
 * Ignora se o deslize atual já vai terminar no tile do servidor.
 */
function reconcileLocalTileToAuthoritative(tileX: number, tileY: number, z: number): void {
    const steppingTowardAck =
        gridMovement.stepping &&
        gridMovement.destTileX === tileX &&
        gridMovement.destTileY === tileY &&
        player.worldZ === z;
    if (steppingTowardAck) return;

    if (
        player.tileX === tileX &&
        player.tileY === tileY &&
        player.worldZ === z &&
        !gridMovement.stepping
    ) {
        return;
    }

    snapLocalPlayerToAuthoritativeTile(tileX, tileY, z);
    previousPlayerTileKey = getPlayerTileKey();
}

function updateLastServerAck(
    tileX: number,
    tileY: number,
    z: number,
    seq?: number
): void {
    if (seq !== undefined && seq < lastServerAck.seq) return;
    lastServerAck = {
        tileX,
        tileY,
        z,
        seq: seq ?? lastServerAck.seq,
    };
}

function resetLastServerAck(tileX: number, tileY: number, z: number): void {
    lastServerAck = { tileX, tileY, z, seq: 0 };
}

/** Rollback sem slide ao último tile confirmado pelo servidor (predição, não tile local). */
function rollbackLocalPlayerToLastServerAck(): void {
    const { serverTileX, serverTileY, serverZ } = movementPrediction;
    snapLocalPlayerToAuthoritativeTile(serverTileX, serverTileY, serverZ);
    previousPlayerTileKey = getPlayerTileKey();
}

/** direction8 do passo pendente — fallback se grid ainda não commitou facing. */
function resolveOutboundDirection8(): Direction8 | undefined {
    if (!isPlayWsAuthoritative() || pendingOutboundMoveSeq === undefined) {
        return undefined;
    }
    const gridDir =
        gridMovement.lastCompletedStepDirection ?? gridMovement.activeStepDirection;
    if (gridDir) {
        return toProtocolDirection8(gridDir);
    }
    const pending = movementPrediction.pending.find(
        (step) => step.seq === pendingOutboundMoveSeq
    );
    if (!pending) return undefined;
    return (
        direction8FromTiles(
            { tileX: pending.fromTileX, tileY: pending.fromTileY, z: pending.z },
            { tileX: pending.toTileX, tileY: pending.toTileY, z: pending.z }
        ) ?? undefined
    );
}

function handleMovementRejected(code: string, rejectedSeq?: number): void {
    if (rejectedSeq !== undefined) {
        clearPendingFromSeq(movementPrediction, rejectedSeq);
    } else {
        movementPrediction.pending.length = 0;
    }
    positionCorrectionSlide.active = false;
    pendingOutboundMoveSeq = undefined;
    gridMovement.stepping = false;
    gridMovement.activeStepFacing = null;
    gridMovement.activeStepDirection = null;

    const preserveHeldInput = code === 'TILE_OCCUPIED';
    if (!preserveHeldInput) {
        resetGridMovementInputState(gridMovement);
    }

    if (code === 'MOVEMENT_TOO_FAST') {
        clearMovementInputBuffer(movementInputBuffer);
        clearAutoWalk(autoWalkState);
        movementTooFastThrottleUntilMs = performance.now() + 120;
    } else if (code === 'INVALID_STEP') {
        movementTooFastThrottleUntilMs = performance.now() + 80;
    }

    rollbackLocalPlayerToLastServerAck();
    gameNet?.alignLastSyncedFromLocalState();
}

function shouldBlockLocalNewSteps(): boolean {
    if (!isPlayWsAuthoritative()) return false;
    if (!gameNet?.isConnected()) return false;
    if (positionCorrectionSlide.active) return true;
    if (performance.now() < movementTooFastThrottleUntilMs) return true;
    return getPendingPredictionCount(movementPrediction) >= 1;
}

function clearStalePendingMovement(nowMs: number): void {
    if (!isPlayWsAuthoritative()) return;
    const head = movementPrediction.pending[0];
    if (!head) return;
    if (nowMs - head.committedAtMs < 1000) return;
    movementPrediction.pending.length = 0;
    pendingOutboundMoveSeq = undefined;
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

function updatePlayCameraFollow(dtMs: number): void {
    const zoom = camera.zoom || 1;
    const manualOffsetX = (camera as { offsetX?: number }).offsetX || 0;
    const manualOffsetY = (camera as { offsetY?: number }).offsetY || 0;
    const target = computePlayCameraTarget(
        player.worldX,
        player.worldY,
        canvas,
        zoom,
        manualOffsetX,
        manualOffsetY
    );
    applyPlayCameraFollow(camera, target.x, target.y, getPlayHudQuality(), dtMs);
}

function update(dtMs: number): void {
    const nowMs = performance.now();
    clearStalePendingMovement(nowMs);
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
        serverCreatures.tick(nowMs, getNetworkRenderDelayMs());
    } else {
        tickOfflineMonsterDeathAndRespawn(npcs, nowMs, TILE_SIZE_SCREEN);
    }
    speedBuffs.tick(nowMs);

    const correctionSliding = tickPositionCorrectionSlide(positionCorrectionSlide, player, nowMs);
    let editingFloorResult = editingFloor;
    if (!correctionSliding) {
        if (
            autoWalkState.active &&
            !gridMovement.stepping &&
            !hasMovementKeyInput(buildMovementKeyState(keys)) &&
            !positionCorrectionSlide.active
        ) {
            const autoDir = tickAutoWalkDirection(
                autoWalkState,
                { tileX: player.tileX, tileY: player.tileY, z: player.worldZ },
                (x, y, z) => isTerrainWalkableAtTile(x, y, z)
            );
            if (autoDir) {
                const autoKeys = buildMovementKeyState({});
                switch (autoDir) {
                    case 'north':
                        autoKeys.north = true;
                        break;
                    case 'south':
                        autoKeys.south = true;
                        break;
                    case 'east':
                        autoKeys.east = true;
                        break;
                    case 'west':
                        autoKeys.west = true;
                        break;
                    case 'northwest':
                        autoKeys.northwest = true;
                        break;
                    case 'northeast':
                        autoKeys.northeast = true;
                        break;
                    case 'southwest':
                        autoKeys.southwest = true;
                        break;
                    case 'southeast':
                        autoKeys.southeast = true;
                        break;
                }
                Object.assign(keys, {
                    w: autoKeys.north,
                    s: autoKeys.south,
                    a: autoKeys.west,
                    d: autoKeys.east,
                    q: autoKeys.northwest,
                    e: autoKeys.northeast,
                    z: autoKeys.southwest,
                    c: autoKeys.southeast,
                });
            }
        }

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
            skipCameraUpdate: true,
            movementInputBuffer,
            blockNewSteps: shouldBlockLocalNewSteps(),
        });
        editingFloorResult = result.editingFloor;
    } else {
        activeCharacterController.setState('idle');
        activeCharacterController.update(nowMs, gridMovement.stepDurationMs);
    }
    updatePlayCameraFollow(dtMs);
    editingFloor = editingFloorResult;

    const currentTileKey = getPlayerTileKey();
    const enteredNewTile = currentTileKey !== previousPlayerTileKey;
    if (enteredNewTile && gameNet?.isConnected() && previousPlayerTileKey) {
        if (isPlayWsAuthoritative()) {
            const parts = previousPlayerTileKey.split('_').map(Number);
            const fromZ = parts[2] ?? player.worldZ;
            pendingOutboundMoveSeq = recordPredictedMove(
                movementPrediction,
                { tileX: parts[0]!, tileY: parts[1]!, z: fromZ },
                { tileX: player.tileX, tileY: player.tileY, z: player.worldZ },
                nowMs
            );
        } else {
            // Dev sem ticket: servidor aceita moves mas não há fila de predição — manter serverTile alinhado.
            confirmServerTile(
                movementPrediction,
                player.tileX,
                player.tileY,
                player.worldZ
            );
        }
    }
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
        remoteSprites.tick(nowMs, getNetworkRenderDelayMs());
    }
    gameNet?.syncPositionIfChanged();

    if (activeCharacter) {
        tickPlayCombat({
            nowMs,
            stepping: gridMovement.stepping,
            movementIntent: hasMovementKeyInput(buildMovementKeyState(keys)),
            npcs: playEntities,
            player,
            character: activeCharacter,
            characterSpeed,
            server: buildPlayCombatServerBridge(),
            remotes: getRemoteTargetables(),
            callbacks: buildPlayCombatCallbacks(nowMs),
        });
    }

    localPlayerFloats.tick(nowMs);
    syncPlayHudVitals();
    tickPlayHudMinimap();
    tickPlayCombatHub();
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
    const clamped = snapPlayZoom(nextZoom);
    camera.zoom = clamped;
    updatePlayZoomUi();
    try {
        localStorage.setItem(PLAY_ZOOM_SESSION_KEY, String(clamped));
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
        const saved = localStorage.getItem(PLAY_ZOOM_SESSION_KEY);
        if (saved) {
            const parsed = parseFloat(saved);
            if (!Number.isNaN(parsed) && parsed > 0) {
                setPlayZoom(parsed);
            }
        } else {
            setPlayZoom(getPlayDefaultZoom());
        }
    } catch {
        /* ignore */
    }
    updatePlayZoomUi();

    document.getElementById('playZoomIn')?.addEventListener('click', () => stepPlayZoom(1));
    document.getElementById('playZoomOut')?.addEventListener('click', () => stepPlayZoom(-1));

    window.addEventListener(PLAY_DEFAULT_ZOOM_CHANGED_EVENT, (event) => {
        const { detail } = event as CustomEvent<number>;
        if (typeof detail === 'number' && detail > 0) {
            setPlayZoom(detail);
        }
    });
}

function draw(dtMs: number): void {
    const zoom = camera.zoom || 1;
    const nowMs = performance.now();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = false;

    const shake = tickPlayScreenShake(playCameraJuice, dtMs);
    const camX = Math.round((camera.x + shake.x) * zoom) / zoom;
    const camY = Math.round((camera.y + shake.y) * zoom) / zoom;
    const camState = { x: camX, y: camY, zoom };

    const borderDrawCtx = getPlayBorderDrawContext();
    const borderMaskIndex = getBorderMaskTileIndexCached(
        borderDrawCtx.registry,
        borderDrawCtx.borderSetId
    );

    const { startX, endX, startY, endY } = computePlayViewportBounds(camX, camY, zoom);
    const viewW = canvas.width / zoom;
    const viewH = canvas.height / zoom;

    const remotePlayers =
        currentMapId && gameNet
            ? gameNet.getRemotePlayers(currentMapId, gameNet.getNetworkInstanceId())
            : [];
    const remoteEntries = remotePlayers.length
        ? remoteSprites.buildRemoteDepthEntries(remotePlayers, playRemoteDepthBuffer)
        : playRemoteDepthBuffer;
    if (remotePlayers.length === 0) {
        playRemoteDepthBuffer.length = 0;
    }

    const occupiedFloorZs = new Set<number>();
    for (const entity of getPlayEntities()) {
        occupiedFloorZs.add(entity.worldZ);
    }
    for (const remote of remotePlayers) {
        occupiedFloorZs.add(remote.z);
    }

    const renderOpts = getPlayRenderOptions();
    const playEntities = getPlayEntities();
    const viewport = { startX, endX, startY, endY };

    getAllFloorZs().forEach((z) => {
        if (
            !floorHasVisibleContentInView({
                z,
                startX,
                endX,
                startY,
                endY,
                playerWorldZ: player.worldZ,
                worldMap,
                grassOverlay: grassOverlayMap,
                itemsOverlay: itemsOverlayMap,
                occupiedFloorZs,
            })
        ) {
            return;
        }
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
        playDepthDrawBuffer.length = 0;

        collectItemDepthDrawables(
            {
                z,
                viewport,
                itemsOverlay: itemsOverlayMap,
                registry: TILE_TYPES,
                camera: camState,
                tileSize: TILE_SIZE_SCREEN,
                viewWidth: viewW,
                viewHeight: viewH,
                mapSize: activeMapSize,
                edgeFadePx: DEFAULT_ITEM_EDGE_FADE_PX,
                out: playDepthDrawBuffer,
            }
        );

        collectCombatTargetRingDrawable(
            playEntities,
            remoteEntries,
            getPlayCombatTargetId(),
            z,
            camState,
            TILE_SIZE_SCREEN,
            nowMs,
            playDepthDrawBuffer
        );

        collectNpcDepthDrawables(
            playEntities,
            z,
            camState,
            TILE_SIZE_SCREEN,
            {
                showMonsterNames: renderOpts.showMonsterNames,
                showHealthBars: renderOpts.showHealthBars,
                showFloatingDamage: renderOpts.showFloatingDamage,
                highlightEntityId: getPlayCombatHoverId(),
                nowMs,
                viewport,
            },
            playDepthDrawBuffer
        );

        if (remoteEntries.length > 0) {
            collectRemoteDepthDrawables(
                remoteEntries,
                z,
                camState,
                TILE_SIZE_SCREEN,
                nowMs,
                {
                    ...renderOpts,
                    viewport,
                },
                playDepthDrawBuffer
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
            health: player.health,
            maxHealth: player.maxHealth,
            mana: player.mana,
            maxMana: player.maxMana,
            showPlayerNames: renderOpts.showPlayerNames,
            showHealthBars: renderOpts.showHealthBars,
        });
        if (localDrawable) playDepthDrawBuffer.push(localDrawable);

        appendPlayStressDepthDrawables(
            playDepthDrawBuffer,
            getPlayStressLevel(),
            z,
            player.worldZ,
            player.worldX,
            player.worldY,
            TILE_SIZE_SCREEN
        );

        playDepthSortCache.sortIfDirty(z, playDepthDrawBuffer);
        frameDepthDrawables += playDepthDrawBuffer.length;
        ctx.globalAlpha = 1;
        drawDepthSorted(ctx, playDepthDrawBuffer);

        drawSpellCastEffects(ctx, {
            z,
            cameraX: camX,
            cameraY: camY,
            tileSize: TILE_SIZE_SCREEN,
            nowMs,
        });

        if (
            renderOpts.showFloatingDamage &&
            z === player.worldZ &&
            activeCharacterController?.isLoaded &&
            activeCharacterController.image
        ) {
            const rect = activeCharacterController.getSourceRect();
            const drawScale = activeCharacterController.config.drawScale ?? 1;
            const placement = getSpriteTilePlacement(
                player.worldX,
                player.worldY,
                camX,
                camY,
                TILE_SIZE_SCREEN,
                rect,
                drawScale,
                zoom
            );
            localPlayerFloats.draw(
                ctx,
                placement.drawX + placement.drawW / 2,
                placement.drawY,
                nowMs,
                getPlayHudQuality() === 'high' ? 'easeOut' : 'linear'
            );
        }

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

    const sortStats = playDepthSortCache.consumeSortStats();
    frameSortHits += sortStats.hits;
    frameSortMisses += sortStats.misses;

    ctx.restore();
}

function clearPlayMovementInput(): void {
    for (const key of Object.keys(keys)) {
        keys[key] = false;
    }
    gridMovement.stepping = false;
    gridMovement.activeStepDirection = null;
    resetGridMovementInputState(gridMovement);
    clearMovementInputBuffer(movementInputBuffer);
    clearAutoWalk(autoWalkState);
}

function snapPlayCameraToLocalPlayer(): void {
    const zoom = camera.zoom || 1;
    const manualOffsetX = (camera as { offsetX?: number }).offsetX || 0;
    const manualOffsetY = (camera as { offsetY?: number }).offsetY || 0;
    const target = computePlayCameraTarget(
        player.worldX,
        player.worldY,
        canvas,
        zoom,
        manualOffsetX,
        manualOffsetY
    );
    snapPlayCamera(camera, target.x, target.y);
}

function stabilizeLocalPlayerOnLifecyclePause(): void {
    positionCorrectionSlide.active = false;
    gridMovement.stepping = false;
    gridMovement.activeStepFacing = null;
    resetGridMovementInputState(gridMovement);
    resetClientMovementPrediction(movementPrediction, player.tileX, player.tileY, player.worldZ);
    resetLastServerAck(player.tileX, player.tileY, player.worldZ);
    syncGridPlayerVisual(player, TILE_SIZE_SCREEN);
    snapPlayCameraToLocalPlayer();
}

/** Perda de foco (blur / alt-tab) — só solta teclas; não realinha posição nem câmera. */
function handlePlayFocusLost(): void {
    clearPlayMovementInput();
}

function handlePlayFocusGained(): void {
    lastLoopMs = performance.now();
    snapPlayCameraToLocalPlayer();
}

function handlePlayPageHidden(): void {
    clearPlayMovementInput();
    stabilizeLocalPlayerOnLifecyclePause();
    if (gameNet?.isConnected()) {
        gameNet.syncPositionIfChanged();
    }
}

function handlePlayPageVisible(): void {
    stabilizeLocalPlayerOnLifecyclePause();
    lastLoopMs = performance.now();
    resyncController?.requestResync();
}

const MAX_PLAY_FRAME_DT_MS = 100;

function loop(): void {
    const frameStart = performance.now();
    const rawDtMs = lastLoopMs > 0 ? frameStart - lastLoopMs : 16;
    const dtMs = Math.min(rawDtMs, MAX_PLAY_FRAME_DT_MS);
    lastLoopMs = frameStart;
    frameDepthDrawables = 0;
    frameSortHits = 0;
    frameSortMisses = 0;

    update(dtMs);
    draw(dtMs);
    tickPlayPerformanceMonitorFrame(performance.now() - frameStart);

    const remoteCount =
        currentMapId && gameNet
            ? gameNet.getRemotePlayers(currentMapId, gameNet.getNetworkInstanceId()).length
            : 0;
    setPlayPerfMonitorContext({
        pingMs: serverStateStore.lastPingMs,
        visiblePlayers: remoteCount + (activeCharacter ? 1 : 0),
        visibleCreatures: getPlayEntities().filter((entity) => entity.type === 'monster').length,
        floatingDamages: localPlayerFloats.getActiveCount(),
        depthDrawables: frameDepthDrawables,
        sortCacheHits: frameSortHits,
        sortCacheMisses: frameSortMisses,
        stressLevel: getPlayStressLevel(),
        pendingPredictions: getPendingPredictionCount(movementPrediction),
        renderDelayMs: getNetworkRenderDelayMs(),
    });

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
        getCreatureAuthoritativeTile: (creatureId) => serverCreatures.getAuthoritativeTile(creatureId),
        sendCastSpell: (spellId, creatureId) => {
            if (gameNet?.isConnected() && currentMapId) {
                gameNet.sendCastSpell(spellId, creatureId, currentMapId, gameNet.getNetworkInstanceId());
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

    const chatHandlers = createPlayChatNetHandlers();

    setPlaySpellBarSyncHandler(() => {
        gameNet?.sendSpellBarSync(getPlaySpellBarState());
    });

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
            stepDurationMs: getNetworkStepDurationMs(gridMovement),
            direction8: resolveOutboundDirection8(),
            seq: isPlayWsAuthoritative() ? pendingOutboundMoveSeq : undefined,
            steppingDestTileX: gridMovement.stepping ? gridMovement.destTileX : undefined,
            steppingDestTileY: gridMovement.stepping ? gridMovement.destTileY : undefined,
            level: activeCharacter?.level,
            experience: activeCharacter?.experience,
            spellBar: getPlaySpellBarState(),
        }),
        isMovementStepping: () => gridMovement.stepping,
        authoritativeMovement: () => isPlayWsAuthoritative(),
        onPositionSynced: (pos) => {
            if (!isPlayWsAuthoritative()) {
                confirmServerTile(movementPrediction, pos.tileX, pos.tileY, pos.z);
                updateLastServerAck(pos.tileX, pos.tileY, pos.z);
            }
            pendingOutboundMoveSeq = undefined;
        },
        onMoveAck: (pos) => {
            if (pos.seq !== undefined && pos.seq < lastServerAck.seq) return;

            updateLastServerAck(pos.tileX, pos.tileY, pos.z, pos.seq);

            if (pos.seq !== undefined) {
                confirmServerSeq(
                    movementPrediction,
                    pos.seq,
                    pos.tileX,
                    pos.tileY,
                    pos.z
                );
                pendingOutboundMoveSeq = undefined;
            } else {
                confirmServerTile(movementPrediction, pos.tileX, pos.tileY, pos.z);
            }
            reconcileLocalTileToAuthoritative(pos.tileX, pos.tileY, pos.z);
        },
        validateOutgoingMove: validateOutgoingNetworkMove,
        validateSteppingDest: validateSteppingDestForNetwork,
        onMovementRejected: handleMovementRejected,
        onPositionCorrection: (pos) => {
            if (pos.mapId !== (currentMapId ?? char.spawnMapId)) return;
            const targetX = pos.tileX * TILE_SIZE_SCREEN;
            const targetY = pos.tileY * TILE_SIZE_SCREEN;
            const alreadyAligned =
                player.tileX === pos.tileX &&
                player.tileY === pos.tileY &&
                player.worldZ === pos.z &&
                Math.abs(player.worldX - targetX) < 0.5 &&
                Math.abs(player.worldY - targetY) < 0.5;
            if (alreadyAligned) {
                confirmServerTile(movementPrediction, pos.tileX, pos.tileY, pos.z);
                updateLastServerAck(pos.tileX, pos.tileY, pos.z);
                return;
            }
            const reconcile = reconcileMovementPrediction(
                movementPrediction,
                pos.tileX,
                pos.tileY,
                pos.z,
                player.tileX,
                player.tileY,
                player.worldZ
            );
            if (reconcile.droppedPending > 0) {
                console.debug(
                    `[Play] position_correction → rollback ${reconcile.clientAheadTiles} tile(s), ` +
                        `dropped ${reconcile.droppedPending} predicted step(s)`
                );
            }
            updateLastServerAck(pos.tileX, pos.tileY, pos.z);
            player.worldZ = clampFloorZ(pos.z);
            gridMovement.stepping = false;
            gridMovement.activeStepFacing = null;
            resetGridMovementInputState(gridMovement);
            beginPositionCorrectionSlide(
                positionCorrectionSlide,
                player,
                TILE_SIZE_SCREEN,
                pos.tileX,
                pos.tileY,
                performance.now()
            );
            snapPlayCameraToLocalPlayer();
        },
        onStatusChange: (status) => {
            if (status === 'connected') {
                setWorldEntryStage('network', 'done');
                logPlayJoinTimeline('ws connected — stripLocalMonsters');
                stripLocalMonsters();
            } else if (status === 'disconnected') {
                logPlayJoinTimeline('ws disconnected — clear server creatures');
                serverCreatures.clear();
                respawnEntities();
            }
        },
        onWelcome: ({ health, maxHealth, rateExp }) => {
            setPlayExpRateFromServer(rateExp);
            updatePlayHudExpRateBanner(rateExp);
            logPlayJoinTimeline('welcome received');
            player.health = health;
            player.maxHealth = maxHealth;
            if (activeCharacter) {
                updateCharacterStatsUi(activeCharacter, { flashLevel: false });
            }
            syncProgressToServer();
        },
        onServerError: ({ code, message, retryAfterMs }) => {
            chatHandlers.onServerError({ code, message, retryAfterMs });
            if (code === 'NO_PVP_MAP') {
                toast.info(message);
                return;
            }
            if (
                code === 'SPELL_NOT_EQUIPPED' ||
                code === 'SPELL_NOT_ALLOWED_FOR_VOCATION' ||
                code === 'SPELL_LEVEL_TOO_LOW' ||
                code === 'NOT_ENOUGH_MANA' ||
                code === 'SPELL_COOLDOWN' ||
                code === 'GROUP_COOLDOWN' ||
                code === 'OUT_OF_RANGE' ||
                code === 'SPELL_CAST_FAILED' ||
                code === 'SPELL_NOT_FOUND'
            ) {
                toast.info(message);
            }
        },
        onChatMessage: chatHandlers.onChatMessage,
        onInventoryUpdated: ({ inventory }) => {
            applyPlayInventorySnapshot(inventory);
            syncPlayEquipmentSpeedBonus(inventory);
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
        onAttackMiss: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            serverCreatures.applyAttackMiss(msg.creatureId, performance.now());
        },
        onCreatureDied: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            serverCreatures.applyDied(msg.creatureId, {
                tileX: msg.tileX,
                tileY: msg.tileY,
                z: msg.z,
            });
            if (
                msg.killerPlayerId &&
                msg.killerPlayerId === gameNet?.getLocalPlayerId()
            ) {
                localPlayerFloats.spawnXp(msg.xpReward, performance.now());
            }
        },
        onCreatureRespawned: (msg) => {
            if (!currentMapId || msg.mapId !== currentMapId) return;
            serverCreatures.applyRespawned(msg);
        },
        onPlayerProgress: (msg) => {
            applyPlayProgressUpdate(msg.level, msg.experience, {
                health: msg.health,
                maxHealth: msg.maxHealth,
                leveledUp: msg.leveledUp,
            });
        },
        onPlayerResources: (msg) => {
            if (msg.playerId !== gameNet?.getLocalPlayerId()) return;
            player.health = msg.health;
            player.maxHealth = msg.maxHealth;
            player.mana = msg.mana;
            player.maxMana = msg.maxMana;
            syncPlayHudVitals();
            if (activeCharacter) {
                updateCharacterStatsUi(activeCharacter, { flashLevel: false });
            }
        },
        onPlayerDamaged: (msg) => {
            const now = performance.now();
            const myPlayerId = gameNet?.getLocalPlayerId();
            if (msg.playerId === myPlayerId) {
                player.health = msg.health;
                player.maxHealth = msg.maxHealth;
                updateCharacterStatsUi(activeCharacter!, { flashLevel: false });
                localPlayerFloats.spawnDamage(msg.damage, now);
                if (getPlayHudQuality() === 'high' && msg.damage > 0) {
                    triggerPlayScreenShake(
                        playCameraJuice,
                        Math.min(8, 3 + msg.damage * 0.15)
                    );
                }
            } else {
                remoteSprites.spawnFloatingDamage(msg.playerId, msg.damage, now);
            }
        },
        onPlayerDied: (msg) => {
            const myPlayerId = gameNet?.getLocalPlayerId();
            if (msg.playerId === myPlayerId) {
                toast.info('Você morreu em PvP e renasceu no templo!');
            } else {
                const remote = gameNet?.getRemotePlayers(currentMapId ?? '')?.find(p => p.playerId === msg.playerId);
                if (remote) {
                    remote.health = 0;
                }
            }
        },
        onPlayerRespawned: (msg) => {
            const myPlayerId = gameNet?.getLocalPlayerId();
            if (msg.playerId === myPlayerId) {
                player.health = msg.health;
                player.maxHealth = msg.maxHealth;
                player.mana = msg.mana ?? player.mana;
                player.maxMana = msg.maxMana ?? player.maxMana;
                syncPlayHudVitals();
                if (activeCharacter) {
                    updateCharacterStatsUi(activeCharacter, { flashLevel: false });
                }
            } else {
                const remote = gameNet?.getRemotePlayers(currentMapId ?? '')?.find(
                    (p) => p.playerId === msg.playerId
                );
                if (remote) {
                    remote.tileX = msg.tileX;
                    remote.tileY = msg.tileY;
                    remote.z = msg.z;
                    remote.health = msg.health;
                    remote.maxHealth = msg.maxHealth;
                }
            }
        },
    });

    bindPlayChatNetwork(gameNet);

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

export interface PlayBootOptions {
    /** Dev/GM: carrega mapa específico em vez do mapa do personagem. */
    overrideMapId?: string;
}

export async function startPlay(
    character: CharacterRow,
    accountId: string,
    options?: PlayBootOptions
): Promise<void> {
    activeCharacter = character;
    resetPlayCombatInput();
    resetPlaySpellCooldowns();
    resetSpellCastEffects();
    resetPlayExpRateState();
    resetPlayHudStatusCache();
    resetPlayCombatHubCooldownTracking();
    ensureCombatTargetRingLoaded();
    ensureSpellCastSpritesLoaded();

    if (isWorldEntryPending()) {
        showWorldEntryOverlay(`Carregando ${character.name}...`, {
            immediate: true,
            failsafeMs: WORLD_ENTRY_FAILSAFE_MS,
        });
        setWorldEntryStage('character', 'active', `Carregando ${character.name}...`);
    } else {
        resetWorldEntryOverlay();
        showWorldEntryOverlay(`Carregando ${character.name}...`, {
            failsafeMs: WORLD_ENTRY_FAILSAFE_MS,
        });
        setWorldEntryStage('version', 'done');
        setWorldEntryStage('character', 'active', 'Carregando personagem...');
    }

    await assetLoader.initialize();
    await loadRuntimeVocations();
    await loadSpellCatalog();
    await loadClientGameRates();
    updatePlayHudExpRateBanner();

    const progress = normalizeCharacterProgress(character.experience, character.level);
    character.experience = progress.experience;
    character.level = progress.level;
    characterSpeed.level = progress.level;
    playSessionLevel = progress.level;

    initPlaySpellBar(character.id, character.vocation);
    initPlayLearnedSpells(character.vocation, progress.level);
    await Promise.all([
        loadPlaySpellBarFromServer(character.id, character.vocation),
        loadPlayLearnedSpellsFromServer(character.id, character.vocation, progress.level),
    ]);
    refreshPlayCombatHubSpells();
    bindPlaySpellModalCharacter(character);

    if (playCharNameEl) playCharNameEl.textContent = character.name;
    const mobileName = document.getElementById('playCharNameMobile');
    if (mobileName) mobileName.textContent = character.name;
    const panelName = document.getElementById('characterPanelName');
    if (panelName) panelName.textContent = character.name;
    updateCharacterStatsUi(character);
    void updatePlayHudCharacterPortrait(character);
    initPlayHudInventory(character.id, {
        onInventoryChange: syncPlayEquipmentSpeedBonus,
    });
    syncPlayHudVitals();

    const vocationId = (character.vocation as VocationId) || 'knight';
    const vocationConfig = getVocationById(vocationId);
    const stats = calculateStatsForLevel(vocationConfig, progress.level);
    player.maxHealth = stats.health;
    player.maxMana = stats.mana;
    player.health = stats.health;
    player.mana = stats.mana;

    const outfit = { ...character.outfitConfig } as CharacterSpriteConfig;
    // Sincroniza calibração em tempo real: JSON principal + arquivo lateral `.calibration.json`
    try {
        const { fetchCharacterConfigMerged } = await import('../character/characterCalibrationLoader');
        const realConfig = await fetchCharacterConfigMerged(outfit.spriteSheetUrl);
        if (realConfig) {
            Object.assign(outfit, realConfig);
            console.log('[playApp] Configuração de outfit carregada e atualizada com sucesso:', outfit);
        }
    } catch (e) {
        console.error('[playApp] Falha ao atualizar configuração do outfit:', e);
    }

    activeCharacterController = new SpriteAnimationController(outfit);
    setWorldEntryStage('character', 'done');

    await prepareMapRegistry();

    const overrideMapId =
        import.meta.env.DEV && options?.overrideMapId?.trim()
            ? options.overrideMapId.trim()
            : undefined;

    const entry =
        (overrideMapId ? getMapById(overrideMapId) : undefined) ??
        getMapById(character.mapId) ??
        getMapById(character.spawnMapId) ??
        getMapById('rookgaard') ??
        MAP_REGISTRY[0];
    if (!entry) throw new Error('Mapa inicial não encontrado.');

    const savedSpawn =
        overrideMapId || !character.position
            ? undefined
            : {
                  x: character.position.x,
                  y: character.position.y,
                  z: character.position.z,
              };

    setWorldEntryStage('map', 'active', 'Carregando mapa inicial...');
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
    setPlayMinimapFrameProvider(() => {
        const entities: PlayMinimapEntity[] = getPlayEntities().flatMap((entity) => {
            if (entity.type !== 'monster' && entity.type !== 'npc') return [];
            const foot = entity.getFootTile(TILE_SIZE_SCREEN);
            return [
                {
                    tileX: foot.tileX,
                    tileY: foot.tileY,
                    kind: entity.type as 'monster' | 'npc',
                },
            ];
        });
        if (currentMapId && gameNet) {
            for (const remote of gameNet.getRemotePlayers(
                currentMapId,
                gameNet.getNetworkInstanceId()
            )) {
                if (remote.z !== player.worldZ) continue;
                entities.push({
                    tileX: remote.tileX,
                    tileY: remote.tileY,
                    kind: 'remote',
                });
            }
        }
        return {
            worldMap,
            grassOverlay: grassOverlayMap,
            mapSize: activeMapSize,
            playerTileX: player.tileX,
            playerTileY: player.tileY,
            playerFloor: player.worldZ,
            entities,
        };
    });
    invalidateBorderDrawCache();
    playDepthSortCache.clear();
    setWorldEntryStage('map', 'done');

    setPlayCombatHubBridge({
        nowMs: () => performance.now(),
        onBasicAttack: () => tryPlayBasicAttack(),
        onSpellSlot: (slot) => tryPlaySpellSlot(slot),
    });

    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === 'Escape') {
            clearPlayCombatTarget();
            return;
        }
        if (e.key === '1' || e.key === '2' || e.key === '3') {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            tryPlaySpellSlot(Number(e.key) as SpellBarSlot);
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
        setWorldEntryStage('network', 'active', 'Conectando ao servidor...');
        beginCreatureSyncLoadingGate();
    } else {
        setWorldEntryStage('network', 'done');
        setWorldEntryStage('sync', 'done');
        finishWorldEntryOverlay();
        hideLoading();
        notifyWorldEntryFailsafeIfNeeded();
        logPlayJoinTimeline('hideLoading (offline)');
    }

    window.addEventListener(WORLD_ENTRY_FAILSAFE_EVENT, notifyWorldEntryFailsafeIfNeeded);

    setupLocationAutosave();
    setupPlayZoomControls();
    setupPlayCombatControls();
    setupMobilePlayJoystick();

    teardownPageVisibility?.();
    teardownPageVisibility = null;
    appLifecycleController?.dispose();
    appLifecycleController = null;

    // Configura resync controller
    resyncController = new ResyncController({
        isConnected: () => gameNet?.isConnected() ?? false,
        requestRoomResync: () => gameNet?.requestRoomResync(),
        snapCreaturesToAuthoritativeTiles: () => serverCreatures.snapAllToAuthoritativeTiles(),
        resetCreatureFrameClock: () => serverCreatures.resetFrameClock(),
        snapRemotePlayersToAuthoritativeTiles: () => remoteSprites.snapAllToAuthoritativeTiles(),
        reloadCreaturePresets: () => { void reloadCreaturePresetsForPlay(); },
    });

    clientDiagnostics?.dispose();
    clientDiagnostics = createClientDiagnostics({
        getGameNet: () => gameNet,
        getResyncController: () => resyncController,
        getMaxCreatureDesyncPx: () => serverCreatures.getMaxVisualDesyncPx(),
    });
    clientDiagnostics.mount();

    const onPlayBackground = coalesceLifecycleHandler(handlePlayPageHidden);
    const onPlayForeground = coalesceLifecycleHandler(handlePlayPageVisible);
    const onPlayFocusLost = coalesceLifecycleHandler(handlePlayFocusLost);
    const onPlayFocusGained = coalesceLifecycleHandler(handlePlayFocusGained);
    const lifecycleHandlers = {
        onBackground: onPlayBackground,
        onForeground: onPlayForeground,
        onFocusLost: onPlayFocusLost,
        onFocusGained: onPlayFocusGained,
    };

    const platform = detectRuntimePlatform();
    if (platform === 'electron') {
        appLifecycleController = setupElectronLifecycle(lifecycleHandlers);
    } else if (platform === 'capacitor') {
        appLifecycleController = setupCapacitorLifecycle(lifecycleHandlers);
    } else {
        appLifecycleController = setupWebLifecycle(lifecycleHandlers);
    }

    setupNetwork(character, accountId, { initialTicket: prefetchedTicket });
    loop();
}
