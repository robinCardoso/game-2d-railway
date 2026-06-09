import type { WorldMap } from '../../engine';
import type { LayerMap } from '../../engine/mapPaintLayers';

/** Resolução interna alta — exibido menor via CSS para borda circular mais suave. */
const MINIMAP_CANVAS_SIZE = 192;
const MINIMAP_ZOOM_STEPS = [7, 10, 14, 18, 22] as const;
const MINIMAP_ZOOM_KEY = 'play.hud.minimap.zoomIndex';

export interface PlayMinimapEntity {
    tileX: number;
    tileY: number;
    kind: 'monster' | 'npc' | 'remote';
}

export interface PlayMinimapFrame {
    worldMap: WorldMap;
    grassOverlay?: LayerMap;
    mapSize: number;
    playerTileX: number;
    playerTileY: number;
    playerFloor: number;
    entities?: PlayMinimapEntity[];
}

type FrameProvider = () => PlayMinimapFrame | null;

let frameProvider: FrameProvider | null = null;
let zoomIndex = 2;
let backgroundDirty = true;
let lastDrawKey = '';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function readZoomIndex(): number {
    try {
        const raw = localStorage.getItem(MINIMAP_ZOOM_KEY);
        if (raw !== null) {
            const n = Number.parseInt(raw, 10);
            if (n >= 0 && n < MINIMAP_ZOOM_STEPS.length) return n;
        }
    } catch {
        /* ignore */
    }
    return 2;
}

function saveZoomIndex(): void {
    try {
        localStorage.setItem(MINIMAP_ZOOM_KEY, String(zoomIndex));
    } catch {
        /* ignore */
    }
}

function getRadius(): number {
    return MINIMAP_ZOOM_STEPS[zoomIndex];
}

function tileColor(
    frame: PlayMinimapFrame,
    x: number,
    y: number,
    floor: number
): string {
    if (x < 0 || y < 0 || x >= frame.mapSize || y >= frame.mapSize) {
        return '#05070c';
    }
    const grassId = frame.grassOverlay?.[floor]?.[y]?.[x];
    if (grassId !== undefined && grassId !== -1) {
        return '#2d6b35';
    }
    const tid = frame.worldMap[floor]?.[y]?.[x];
    if (tid === undefined || tid === -1) {
        return '#0c1018';
    }
    return '#4a5d72';
}

function updateZoomButtons(): void {
    const zoomIn = document.getElementById('playMinimapZoomIn') as HTMLButtonElement | null;
    const zoomOut = document.getElementById('playMinimapZoomOut') as HTMLButtonElement | null;
    if (zoomIn) zoomIn.disabled = zoomIndex >= MINIMAP_ZOOM_STEPS.length - 1;
    if (zoomOut) zoomOut.disabled = zoomIndex <= 0;
}

function stepMinimapZoom(delta: 1 | -1): void {
    const next = Math.max(0, Math.min(MINIMAP_ZOOM_STEPS.length - 1, zoomIndex + delta));
    if (next === zoomIndex) return;
    zoomIndex = next;
    saveZoomIndex();
    backgroundDirty = true;
    lastDrawKey = '';
    updateZoomButtons();
}

function drawEntityDot(
    context: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    _radius: number,
    step: number,
    color: string,
    size = 3
): void {
    const center = MINIMAP_CANVAS_SIZE / 2;
    const cx = center + dx * step;
    const cy = center + dy * step;
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx, cy, size, 0, Math.PI * 2);
    context.fill();
}

function applyCircularEdgeSoftening(context: CanvasRenderingContext2D): void {
    const cx = MINIMAP_CANVAS_SIZE / 2;
    const cy = MINIMAP_CANVAS_SIZE / 2;
    const clipR = MINIMAP_CANVAS_SIZE / 2 - 0.5;

    context.save();
    context.globalCompositeOperation = 'destination-in';
    const mask = context.createRadialGradient(cx, cy, clipR * 0.55, cx, cy, clipR);
    mask.addColorStop(0, 'rgba(255, 255, 255, 1)');
    mask.addColorStop(0.82, 'rgba(255, 255, 255, 1)');
    mask.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = mask;
    context.beginPath();
    context.arc(cx, cy, clipR, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function drawMinimapFrame(frame: PlayMinimapFrame): void {
    if (!ctx || !canvas) return;

    const radius = getRadius();
    const step = MINIMAP_CANVAS_SIZE / (radius * 2 + 1);
    const floor = frame.playerFloor;
    const px = frame.playerTileX;
    const py = frame.playerTileY;
    const center = MINIMAP_CANVAS_SIZE / 2;
    const clipR = center - 1;

    ctx.clearRect(0, 0, MINIMAP_CANVAS_SIZE, MINIMAP_CANVAS_SIZE);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, MINIMAP_CANVAS_SIZE, MINIMAP_CANVAS_SIZE);

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, clipR, 0, Math.PI * 2);
    ctx.clip();

    const tileSize = step + 0.35;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const tx = px + dx;
            const ty = py + dy;
            ctx.fillStyle = tileColor(frame, tx, ty, floor);
            const sx = center + dx * step - step / 2;
            const sy = center + dy * step - step / 2;
            ctx.fillRect(sx, sy, tileSize, tileSize);
        }
    }

    for (const entity of frame.entities ?? []) {
        if (entity.tileX === px && entity.tileY === py) continue;
        const dx = entity.tileX - px;
        const dy = entity.tileY - py;
        const color =
            entity.kind === 'monster' ? '#ef4444' : entity.kind === 'npc' ? '#3b82f6' : '#a855f7';
        drawEntityDot(ctx, dx, dy, 0, step, color, Math.max(2.5, step * 0.22));
    }

    ctx.restore();
    applyCircularEdgeSoftening(ctx);
}

export function setPlayMinimapFrameProvider(provider: FrameProvider): void {
    frameProvider = provider;
}

export function markPlayMinimapDirty(): void {
    backgroundDirty = true;
    lastDrawKey = '';
}

export function initPlayHudMinimap(): void {
    canvas = document.getElementById('playMinimapCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.width = MINIMAP_CANVAS_SIZE;
    canvas.height = MINIMAP_CANVAS_SIZE;
    ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.imageSmoothingEnabled = true;
    }

    zoomIndex = readZoomIndex();
    updateZoomButtons();

    document.getElementById('playMinimapZoomIn')?.addEventListener('click', () => stepMinimapZoom(1));
    document.getElementById('playMinimapZoomOut')?.addEventListener('click', () => stepMinimapZoom(-1));
}

export function tickPlayHudMinimap(): void {
    if (!frameProvider || !ctx) return;
    const frame = frameProvider();
    if (!frame) return;

    const entityKey = (frame.entities ?? [])
        .map((e) => `${e.kind}:${e.tileX},${e.tileY}`)
        .join(';');
    const key = [
        frame.playerTileX,
        frame.playerTileY,
        frame.playerFloor,
        zoomIndex,
        frame.mapSize,
        backgroundDirty ? 'd' : '',
        entityKey,
    ].join(':');

    if (!backgroundDirty && key === lastDrawKey) return;

    drawMinimapFrame(frame);
    backgroundDirty = false;
    lastDrawKey = key;
}
