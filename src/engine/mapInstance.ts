/**
 * Dungeons instanciadas — Fase 1 (single-player, em memória).
 *
 * O JSON em public/maps/ é o TEMPLATE. Cada entrada gera um clone isolado na RAM.
 * Não persiste entre F5; não compartilha estado com outros jogadores.
 */

import { getMapEntry } from './mapRegistry';
import { cloneWorldMap } from './worldMap';
import { cloneLayerMap } from './mapPaintLayers';
import type { LoadedMapResult } from './worldLoader';
import type { CreatureSpawn, PortalData, SpawnPoint } from './types';

const MAX_INSTANCES_IN_MEMORY = 8;

export interface OverworldReturnContext {
    mapId: string;
    x: number;
    y: number;
    z: number;
}

interface InstanceRecord {
    templateMapId: string;
    data: LoadedMapResult;
    createdAt: number;
}

let activeInstanceId: string | null = null;
const instances = new Map<string, InstanceRecord>();
let overworldReturn: OverworldReturnContext | null = null;

function generateInstanceId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `inst_${crypto.randomUUID()}`;
    }
    return `inst_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function cloneEntityIds<T extends { id: string }>(items: T[], instanceId: string): T[] {
    const suffix = instanceId.slice(-8);
    return items.map((item) => ({
        ...item,
        id: `${item.id}_${suffix}`,
    }));
}

/** Deep clone de um mapa já carregado/sanitizado. */
export function cloneLoadedMapResult(
    source: LoadedMapResult,
    instanceId: string
): LoadedMapResult {
    return {
        worldMap: cloneWorldMap(source.worldMap),
        grassOverlay: cloneLayerMap(source.grassOverlay ?? {}),
        borderOverlay: cloneLayerMap(source.borderOverlay ?? {}),
        spawn: { ...source.spawn },
        name: source.name,
        mapId: source.mapId,
        size: source.size,
        metadata: JSON.parse(JSON.stringify(source.metadata ?? {})),
        houses: JSON.parse(JSON.stringify(source.houses ?? {})),
        spawns: cloneEntityIds(source.spawns ?? [], instanceId) as CreatureSpawn[],
        portals: cloneEntityIds(source.portals ?? [], instanceId) as PortalData[],
    };
}

function pruneOldInstances(): void {
    if (instances.size <= MAX_INSTANCES_IN_MEMORY) return;
    const sorted = [...instances.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (instances.size > MAX_INSTANCES_IN_MEMORY) {
        const [id] = sorted.shift()!;
        if (id === activeInstanceId) continue;
        instances.delete(id);
    }
}

/**
 * Cria uma nova instância a partir do template (fetch + sanitize já feitos pelo caller).
 */
export function createMapInstanceFromTemplate(
    templateMapId: string,
    template: LoadedMapResult
): { instanceId: string; data: LoadedMapResult } {
    const instanceId = generateInstanceId();
    const data = cloneLoadedMapResult(template, instanceId);
    data.mapId = templateMapId;

    instances.set(instanceId, {
        templateMapId,
        data,
        createdAt: Date.now(),
    });
    activeInstanceId = instanceId;
    pruneOldInstances();

    console.log(
        `[MapInstance] Nova instância ${instanceId} do template "${templateMapId}" (${instances.size} em RAM)`
    );

    return { instanceId, data };
}

/** Descarta a instância ativa da memória. */
export function disposeActiveMapInstance(): void {
    if (!activeInstanceId) return;
    instances.delete(activeInstanceId);
    console.log(`[MapInstance] Instância descartada: ${activeInstanceId}`);
    activeInstanceId = null;
}

export function getActiveMapInstanceId(): string | null {
    return activeInstanceId;
}

export function isInsideMapInstance(): boolean {
    return activeInstanceId !== null;
}

/** Guarda de onde o jogador entrou na dungeon (mapa overworld não-instanciado). */
export function captureOverworldReturnIfNeeded(
    currentMapId: string | undefined,
    playerPos: SpawnPoint
): void {
    if (!currentMapId || isInsideMapInstance()) return;
    const entry = getMapEntry(currentMapId);
    if (!entry || entry.instanced) return;
    overworldReturn = {
        mapId: currentMapId,
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
    };
}

export function getOverworldReturnContext(): OverworldReturnContext | null {
    return overworldReturn;
}

export function clearOverworldReturnContext(): void {
    overworldReturn = null;
}

export function getActiveInstanceShortLabel(): string {
    if (!activeInstanceId) return '';
    return activeInstanceId.slice(-8);
}
