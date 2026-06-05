import { getSpriteTilePlacement, type SpriteSourceRect, type SpriteTilePlacement } from '../character/spriteDraw';
import type { GameEntity } from '../character/entity';
import type { SpriteAnimationController } from '../character/spriteAnimation';
import { ENGINE_CONFIG } from './config';
import { getLayerCell, type LayerMap } from './mapPaintLayers';
import { drawRegistryTile, getTileDrawSize } from './tileDraw';
import type { RegistryTile, TileRegistry } from './types';

/** Margem em tiles para itens altos (ex. árvore 64×64) cujo pé sai do viewport antes da copa. */
const DEFAULT_ITEM_VIEWPORT_MARGIN_TILES = 2;

export interface FootSortKey {
    sortY: number;
    sortX: number;
}

export interface DepthDrawable {
    sortY: number;
    sortX: number;
    draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface DepthSortViewport {
    startX: number;
    endX: number;
    startY: number;
    endY: number;
}

export interface DepthSortCamera {
    x: number;
    y: number;
    zoom?: number;
}

export interface RemotePlayerDepthEntry {
    tileX: number;
    tileY: number;
    z: number;
    name: string;
    direction?: 'north' | 'south' | 'east' | 'west';
    controller?: SpriteAnimationController;
    /** Posição interpolada em pixels (preferida para desenho e depth sort). */
    worldX?: number;
    worldY?: number;
}

export function footSortKeyFromPlacement(
    placement: { drawX: number; drawY: number; drawW: number; drawH: number },
    cameraX: number,
    cameraY: number
): FootSortKey {
    return {
        sortY: placement.drawY + placement.drawH + cameraY,
        sortX: placement.drawX + placement.drawW / 2 + cameraX,
    };
}

export function getTileFootSortKey(tileX: number, tileY: number, tileSize: number): FootSortKey {
    const worldX = tileX * tileSize;
    const worldY = tileY * tileSize;
    return {
        sortY: worldY + tileSize,
        sortX: worldX + tileSize / 2,
    };
}

export function getRegistryTileFootSortKey(
    tile: RegistryTile,
    tileX: number,
    tileY: number,
    tileSize: number
): FootSortKey {
    const worldX = tileX * tileSize;
    const worldY = tileY * tileSize;
    const { w, h } = getTileDrawSize(tile, tileSize);
    const placement = getSpriteTilePlacement(worldX, worldY, 0, 0, tileSize, {
        sx: 0,
        sy: 0,
        sw: w,
        sh: h,
        ax: tile.anchorX ?? 0,
        ay: tile.anchorY ?? 0,
    });
    return {
        sortY: placement.drawY + placement.drawH,
        sortX: placement.drawX + placement.drawW / 2,
    };
}

export function getEntityFootSortKey(
    worldX: number,
    worldY: number,
    rect: SpriteSourceRect,
    tileSize: number,
    drawScale = 1
): FootSortKey {
    const placement = getSpriteTilePlacement(worldX, worldY, 0, 0, tileSize, rect, drawScale, 1);
    return {
        sortY: placement.drawY + placement.drawH,
        sortX: placement.drawX + placement.drawW / 2,
    };
}

export function sortDepthDrawables(drawables: DepthDrawable[]): void {
    drawables.sort((a, b) => a.sortY - b.sortY || a.sortX - b.sortX);
}

export function drawDepthSorted(ctx: CanvasRenderingContext2D, drawables: DepthDrawable[]): void {
    for (const entry of drawables) {
        entry.draw(ctx);
    }
}

function getRegistryTileScreenPlacement(
    tile: RegistryTile,
    tileX: number,
    tileY: number,
    tileSize: number,
    camera: DepthSortCamera
): SpriteTilePlacement {
    const { w, h } = getTileDrawSize(tile, tileSize);
    const screenX = tileX * tileSize - camera.x;
    const screenY = tileY * tileSize - camera.y;
    return getSpriteTilePlacement(screenX, screenY, 0, 0, tileSize, {
        sx: 0,
        sy: 0,
        sw: w,
        sh: h,
        ax: tile.anchorX ?? 0,
        ay: tile.anchorY ?? 0,
    });
}

function placementIntersectsView(
    placement: SpriteTilePlacement,
    viewW: number,
    viewH: number
): boolean {
    const right = placement.drawX + placement.drawW;
    const bottom = placement.drawY + placement.drawH;
    return right > 0 && placement.drawX < viewW && bottom > 0 && placement.drawY < viewH;
}

/** Alpha 0–1: suaviza itens que estão saindo pela borda da tela (0 = desliga fade). */
function computeEdgeFadeAlpha(
    placement: SpriteTilePlacement,
    viewW: number,
    viewH: number,
    fadePx: number
): number {
    if (fadePx <= 0) return 1;
    const insetLeft = placement.drawX;
    const insetRight = viewW - (placement.drawX + placement.drawW);
    const insetTop = placement.drawY;
    const insetBottom = viewH - (placement.drawY + placement.drawH);
    const minInset = Math.min(insetLeft, insetRight, insetTop, insetBottom);
    if (minInset >= fadePx) return 1;
    if (minInset <= 0) {
        return placementIntersectsView(placement, viewW, viewH) ? 0.35 : 0;
    }
    return minInset / fadePx;
}

export function collectItemDepthDrawables(options: {
    z: number;
    viewport: DepthSortViewport;
    itemsOverlay: LayerMap;
    registry: TileRegistry;
    camera: DepthSortCamera;
    tileSize: number;
    /** Largura/altura visível em px (já dividida pelo zoom, como no ctx.scale). */
    viewWidth?: number;
    viewHeight?: number;
    mapSize?: number;
    /** Tiles extras além do viewport para sprites que extrapolam a célula base. */
    viewportMarginTiles?: number;
    /** Fade gradual na borda em px; 0 = sem fade (só corrige o pop). */
    edgeFadePx?: number;
    shouldIncludeTile?: (tileId: number) => boolean;
}): DepthDrawable[] {
    const {
        z,
        viewport,
        itemsOverlay,
        registry,
        camera,
        tileSize,
        viewWidth = 0,
        viewHeight = 0,
        mapSize,
        viewportMarginTiles = DEFAULT_ITEM_VIEWPORT_MARGIN_TILES,
        edgeFadePx = 0,
        shouldIncludeTile,
    } = options;
    const emptyTileId = ENGINE_CONFIG.EMPTY_TILE_ID;
    const drawables: DepthDrawable[] = [];
    const { startX, endX, startY, endY } = viewport;
    const margin = Math.max(0, viewportMarginTiles);
    const maxIdx = mapSize !== undefined ? mapSize - 1 : Number.MAX_SAFE_INTEGER;

    const scanStartX = Math.max(0, startX - margin);
    const scanEndX = Math.min(maxIdx, endX + margin);
    const scanStartY = Math.max(0, startY - margin);
    const scanEndY = Math.min(maxIdx, endY + margin);
    const useScreenCull = viewWidth > 0 && viewHeight > 0;

    for (let y = scanStartY; y <= scanEndY; y++) {
        for (let x = scanStartX; x <= scanEndX; x++) {
            const tid = getLayerCell(itemsOverlay, z, x, y, emptyTileId);
            if (tid === emptyTileId || tid === -1) continue;
            if (shouldIncludeTile && !shouldIncludeTile(tid)) continue;
            const tile = registry[tid];
            if (!tile?.image?.complete) continue;

            const screenX = x * tileSize - camera.x;
            const screenY = y * tileSize - camera.y;
            const placement = getRegistryTileScreenPlacement(tile, x, y, tileSize, camera);

            if (useScreenCull && !placementIntersectsView(placement, viewWidth, viewHeight)) {
                continue;
            }

            const alpha = useScreenCull
                ? computeEdgeFadeAlpha(placement, viewWidth, viewHeight, edgeFadePx)
                : 1;
            if (alpha <= 0) continue;

            const { sortY, sortX } = getRegistryTileFootSortKey(tile, x, y, tileSize);

            drawables.push({
                sortY,
                sortX,
                draw: (drawCtx) => {
                    if (alpha < 1) {
                        drawCtx.save();
                        drawCtx.globalAlpha = alpha;
                        drawRegistryTile(drawCtx, tile, screenX, screenY, tileSize);
                        drawCtx.restore();
                        return;
                    }
                    drawRegistryTile(drawCtx, tile, screenX, screenY, tileSize);
                },
            });
        }
    }

    return drawables;
}

export function collectNpcDepthDrawables(
    npcs: GameEntity[],
    z: number,
    camera: DepthSortCamera,
    tileSize: number,
    options?: { drawNames?: boolean; nameStyle?: 'play' | 'studio' }
): DepthDrawable[] {
    const drawables: DepthDrawable[] = [];
    const zoom = camera.zoom ?? 1;
    const drawNames = options?.drawNames ?? false;
    const nameStyle = options?.nameStyle ?? 'play';

    for (const npc of npcs) {
        if (npc.worldZ !== z) continue;
        if (!npc.animController.isLoaded || !npc.animController.image) continue;

        const rect = npc.animController.getSourceRect();
        const drawScale = npc.animController.config.drawScale ?? 1;
        const { sortY, sortX } = getEntityFootSortKey(
            npc.worldX,
            npc.worldY,
            rect,
            tileSize,
            drawScale
        );

        drawables.push({
            sortY,
            sortX,
            draw: (drawCtx) => {
                npc.draw(drawCtx, camera, tileSize);
                if (!drawNames) return;

                const placement = npc.getDrawPlacement({ ...camera, zoom }, tileSize);
                const nameX = placement.drawX + placement.drawW / 2 - 10;
                const nameY = placement.drawY - 6;

                if (nameStyle === 'studio') {
                    drawCtx.font = "bold 11px 'Outfit', 'Courier New', monospace";
                    drawCtx.textAlign = 'center';
                    drawCtx.strokeStyle = '#000000';
                    drawCtx.lineWidth = 2.5;
                    drawCtx.strokeText(npc.name, nameX, nameY);
                    drawCtx.fillStyle = '#4ade80';
                    drawCtx.fillText(npc.name, nameX, nameY);
                } else {
                    drawCtx.fillStyle = '#4ade80';
                    drawCtx.font = 'bold 8px sans-serif';
                    drawCtx.textAlign = 'center';
                    drawCtx.fillText(npc.name, nameX, nameY);
                }
            },
        });
    }

    return drawables;
}

export function collectRemoteDepthDrawables(
    remotes: RemotePlayerDepthEntry[],
    z: number,
    camera: DepthSortCamera,
    tileSize: number,
    options?: { nameStyle?: 'play' | 'studio' }
): DepthDrawable[] {
    const drawables: DepthDrawable[] = [];
    const nameStyle = options?.nameStyle ?? 'play';

    const zoom = camera.zoom ?? 1;

    for (const remote of remotes) {
        if (remote.z !== z) continue;
        const worldX = remote.worldX ?? remote.tileX * tileSize;
        const worldY = remote.worldY ?? remote.tileY * tileSize;
        const ctrl = remote.controller;

        if (ctrl?.isLoaded && ctrl.image) {
            const rect = ctrl.getSourceRect();
            const drawScale = ctrl.config.drawScale ?? 1;
            const { sortY, sortX } = getEntityFootSortKey(worldX, worldY, rect, tileSize, drawScale);
            drawables.push({
                sortY,
                sortX,
                draw: (drawCtx) => {
                    const placement = getSpriteTilePlacement(
                        worldX,
                        worldY,
                        camera.x,
                        camera.y,
                        tileSize,
                        rect,
                        drawScale,
                        zoom
                    );
                    drawCtx.drawImage(
                        ctrl.image!,
                        rect.sx,
                        rect.sy,
                        rect.sw,
                        rect.sh - 0.5,
                        placement.drawX,
                        placement.drawY,
                        placement.drawW,
                        placement.drawH
                    );

                    const nameX = placement.drawX + placement.drawW / 2;
                    const nameY = placement.drawY - (nameStyle === 'studio' ? 6 : 4);
                    if (nameStyle === 'studio') {
                        drawCtx.font = "bold 11px 'Outfit', 'Courier New', monospace";
                        drawCtx.textAlign = 'center';
                        drawCtx.strokeStyle = '#000000';
                        drawCtx.lineWidth = 2.5;
                        drawCtx.strokeText(remote.name, nameX - 10, nameY);
                        drawCtx.fillStyle = '#fda4af';
                        drawCtx.fillText(remote.name, nameX - 10, nameY);
                    } else {
                        drawCtx.fillStyle = '#fda4af';
                        drawCtx.font = 'bold 8px sans-serif';
                        drawCtx.textAlign = 'center';
                        drawCtx.fillText(remote.name, nameX, nameY);
                    }
                },
            });
            continue;
        }

        const { sortY, sortX } = getEntityFootSortKey(
            worldX,
            worldY,
            { sx: 0, sy: 0, sw: tileSize, sh: tileSize },
            tileSize
        );
        const rx = worldX - camera.x;
        const ry = worldY - camera.y;

        drawables.push({
            sortY,
            sortX,
            draw: (drawCtx) => {
                drawCtx.fillStyle = 'rgba(244, 114, 182, 0.45)';
                drawCtx.fillRect(rx + 10, ry + 10, tileSize - 20, tileSize - 20);
                drawCtx.strokeStyle = '#fda4af';
                drawCtx.lineWidth = 2;
                drawCtx.strokeRect(rx + 10, ry + 10, tileSize - 20, tileSize - 20);

                if (nameStyle === 'studio') {
                    drawCtx.font = "bold 11px 'Outfit', 'Courier New', monospace";
                    drawCtx.textAlign = 'center';
                    drawCtx.strokeStyle = '#000000';
                    drawCtx.lineWidth = 2.5;
                    drawCtx.strokeText(remote.name, rx + tileSize / 2 - 10, ry - 6);
                    drawCtx.fillStyle = '#fda4af';
                    drawCtx.fillText(remote.name, rx + tileSize / 2 - 10, ry - 6);
                } else {
                    drawCtx.fillStyle = '#fda4af';
                    drawCtx.font = 'bold 8px sans-serif';
                    drawCtx.textAlign = 'center';
                    drawCtx.fillText(remote.name, rx + tileSize / 2, ry - 4);
                }
            },
        });
    }

    return drawables;
}

export interface LocalPlayerDepthOptions {
    worldX: number;
    worldY: number;
    worldZ: number;
    z: number;
    camera: DepthSortCamera;
    tileSize: number;
    getSourceRect: () => SpriteSourceRect;
    image: CanvasImageSource | null;
    isLoaded: boolean;
    name: string;
    zoom?: number;
    nameStyle?: 'play' | 'studio';
    fallbackTile?: RegistryTile;
}

export function collectLocalPlayerDepthDrawable(
    options: LocalPlayerDepthOptions
): DepthDrawable | null {
    const {
        worldX,
        worldY,
        worldZ,
        z,
        camera,
        tileSize,
        getSourceRect,
        image,
        isLoaded,
        name,
        zoom = 1,
        nameStyle = 'play',
        fallbackTile,
    } = options;

    if (worldZ !== z) return null;

    if (isLoaded && image) {
        const rect = getSourceRect();
        const { sortY, sortX } = getEntityFootSortKey(worldX, worldY, rect, tileSize);

        return {
            sortY,
            sortX,
            draw: (drawCtx) => {
                const placement = getSpriteTilePlacement(
                    worldX,
                    worldY,
                    camera.x,
                    camera.y,
                    tileSize,
                    rect,
                    1,
                    zoom
                );
                drawCtx.drawImage(
                    image,
                    rect.sx,
                    rect.sy,
                    rect.sw,
                    rect.sh - 0.5,
                    placement.drawX,
                    placement.drawY,
                    placement.drawW,
                    placement.drawH
                );

                const nameX = placement.drawX + placement.drawW / 2 - (nameStyle === 'studio' ? 10 : 0);
                const nameY = placement.drawY - (nameStyle === 'studio' ? 6 : 4);

                if (nameStyle === 'studio') {
                    drawCtx.font = "bold 11px 'Outfit', 'Courier New', monospace";
                    drawCtx.textAlign = 'center';
                    drawCtx.strokeStyle = '#000000';
                    drawCtx.lineWidth = 2.5;
                    drawCtx.strokeText(name, nameX, nameY);
                    drawCtx.fillStyle = '#38bdf8';
                    drawCtx.fillText(name, nameX, nameY);
                } else {
                    drawCtx.fillStyle = '#38bdf8';
                    drawCtx.font = 'bold 8px sans-serif';
                    drawCtx.textAlign = 'center';
                    drawCtx.fillText(name, nameX, nameY);
                }
            },
        };
    }

    if (fallbackTile?.image?.complete) {
        const tileX = Math.floor(worldX / tileSize);
        const tileY = Math.floor(worldY / tileSize);
        const { sortY, sortX } = getRegistryTileFootSortKey(fallbackTile, tileX, tileY, tileSize);
        const screenX = worldX - camera.x;
        const screenY = worldY - camera.y;

        return {
            sortY,
            sortX,
            draw: (drawCtx) => {
                drawCtx.drawImage(
                    fallbackTile.image!,
                    screenX,
                    screenY,
                    tileSize,
                    tileSize
                );
            },
        };
    }

    return null;
}
