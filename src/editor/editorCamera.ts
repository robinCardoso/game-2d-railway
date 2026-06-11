/** Câmera livre do GM Studio — navegação sem avatar/jogador (estilo map editor). */

export interface EditorCameraState {
    viewTileX: number;
    viewTileY: number;
    viewZ: number;
    offsetX: number;
    offsetY: number;
}

export interface RenderCamera {
    x: number;
    y: number;
    offsetX?: number;
    offsetY?: number;
    zoom?: number;
}

const PAN_KEYS = {
    up: ['w', 'arrowup'],
    down: ['s', 'arrowdown'],
    left: ['a', 'arrowleft'],
    right: ['d', 'arrowright'],
} as const;

const CAMERA_PAN_PX_PER_SEC = 420;

export function createEditorCamera(initial?: Partial<EditorCameraState>): EditorCameraState {
    return {
        viewTileX: initial?.viewTileX ?? 50,
        viewTileY: initial?.viewTileY ?? 50,
        viewZ: initial?.viewZ ?? 0,
        offsetX: initial?.offsetX ?? 0,
        offsetY: initial?.offsetY ?? 0,
    };
}

export function focusEditorCameraOnTile(
    state: EditorCameraState,
    tileX: number,
    tileY: number,
    tileZ: number,
    mapSize: number,
    minZ: number,
    maxZ: number
): void {
    state.viewTileX = Math.max(0, Math.min(mapSize - 1, Math.floor(tileX)));
    state.viewTileY = Math.max(0, Math.min(mapSize - 1, Math.floor(tileY)));
    state.viewZ = Math.max(minZ, Math.min(maxZ, Math.floor(tileZ)));
    state.offsetX = 0;
    state.offsetY = 0;
}

export function panEditorCameraPixels(state: EditorCameraState, dx: number, dy: number): void {
    state.offsetX -= dx;
    state.offsetY -= dy;
}

export function tickEditorCameraPan(
    state: EditorCameraState,
    keys: Record<string, boolean>,
    deltaMs: number
): void {
    const scale = (deltaMs / 1000) * CAMERA_PAN_PX_PER_SEC;
    if (PAN_KEYS.up.some((k) => keys[k])) state.offsetY += scale;
    if (PAN_KEYS.down.some((k) => keys[k])) state.offsetY -= scale;
    if (PAN_KEYS.left.some((k) => keys[k])) state.offsetX += scale;
    if (PAN_KEYS.right.some((k) => keys[k])) state.offsetX -= scale;
}

export function syncEditorCameraToRenderCamera(
    state: EditorCameraState,
    camera: RenderCamera,
    canvas: HTMLCanvasElement,
    tileSize: number
): void {
    const zoom = camera.zoom ?? 1;
    const visibleW = canvas.width / zoom;
    const visibleH = canvas.height / zoom;
    const worldX = state.viewTileX * tileSize;
    const worldY = state.viewTileY * tileSize;
    camera.x = Math.floor(worldX - visibleW / 2 + state.offsetX);
    camera.y = Math.floor(worldY - visibleH / 2 + state.offsetY);
    camera.offsetX = state.offsetX;
    camera.offsetY = state.offsetY;
}

export function updateEditorCameraStatus(
    state: EditorCameraState,
    els: {
        posX?: HTMLElement | null;
        posY?: HTMLElement | null;
        posZ?: HTMLElement | null;
        statusPos?: HTMLElement | null;
        statusZ?: HTMLElement | null;
    }
): void {
    if (els.posX) els.posX.innerText = state.viewTileX.toString();
    if (els.posY) els.posY.innerText = state.viewTileY.toString();
    if (els.posZ) els.posZ.innerText = state.viewZ.toString();
    if (els.statusPos) els.statusPos.innerText = `${state.viewTileX}, ${state.viewTileY}`;
    if (els.statusZ) els.statusZ.innerText = state.viewZ.toString();
}
