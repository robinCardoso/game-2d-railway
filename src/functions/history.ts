import type { LayerMap } from '../engine/mapPaintLayers';
import { cloneLayerMap } from '../engine/mapPaintLayers';
import type { WorldMap } from '../engine/types';

export type { WorldMap };

export interface MapPaintSnapshot {
    base: WorldMap;
    grass: LayerMap;
    border: LayerMap;
    items: LayerMap;
}

export function cloneWorldMap(map: WorldMap): WorldMap {
    const clone: WorldMap = {};
    for (const key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) {
            const floor = map[key];
            clone[key] = floor.map((row) => [...row]);
        }
    }
    return clone;
}

export function cloneMapPaintSnapshot(snapshot: MapPaintSnapshot): MapPaintSnapshot {
    return {
        base: cloneWorldMap(snapshot.base),
        grass: cloneLayerMap(snapshot.grass),
        border: cloneLayerMap(snapshot.border),
        items: cloneLayerMap(snapshot.items),
    };
}

export class HistoryManager {
    private undoStack: MapPaintSnapshot[] = [];
    private redoStack: MapPaintSnapshot[] = [];
    private maxStates: number = 50;

    public saveState(base: WorldMap, grass: LayerMap = {}, border: LayerMap = {}, items: LayerMap = {}) {
        this.undoStack.push(
            cloneMapPaintSnapshot({ base, grass, border, items })
        );
        this.redoStack = [];

        if (this.undoStack.length > this.maxStates) {
            this.undoStack.shift();
        }
    }

    public undo(current: MapPaintSnapshot): MapPaintSnapshot | null {
        if (this.undoStack.length === 0) return null;

        this.redoStack.push(cloneMapPaintSnapshot(current));
        return this.undoStack.pop() ?? null;
    }

    public redo(current: MapPaintSnapshot): MapPaintSnapshot | null {
        if (this.redoStack.length === 0) return null;

        this.undoStack.push(cloneMapPaintSnapshot(current));
        return this.redoStack.pop() ?? null;
    }

    public clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    public canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    public canRedo(): boolean {
        return this.redoStack.length > 0;
    }
}
