import { getSpriteTilePlacement, type SpriteSourceRect } from '../character/spriteDraw';
import type { GameEntity } from '../character/entity';
import { ENGINE_CONFIG } from './config';
import { getLayerCell, type LayerMap } from './mapPaintLayers';
import { drawRegistryTile, getTileDrawSize } from './tileDraw';
import type { RegistryTile, TileRegistry } from './types';

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

export function collectItemDepthDrawables(options: {
    z: number;
    viewport: DepthSortViewport;
    itemsOverlay: LayerMap;
    registry: TileRegistry;
    camera: DepthSortCamera;
    tileSize: number;
    shouldIncludeTile?: (tileId: number) => boolean;
}): DepthDrawable[] {
    const {
        z,
        viewport,
        itemsOverlay,
        registry,
        camera,
        tileSize,
        shouldIncludeTile,
    } = options;
    const emptyTileId = ENGINE_CONFIG.EMPTY_TILE_ID;
    const drawables: DepthDrawable[] = [];
    const { startX, endX, startY, endY } = viewport;

    for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
            const tid = getLayerCell(itemsOverlay, z, x, y, emptyTileId);
            if (tid === emptyTileId || tid === -1) continue;
            if (shouldIncludeTile && !shouldIncludeTile(tid)) continue;
            const tile = registry[tid];
            if (!tile?.image?.complete) continue;

            const { sortY, sortX } = getRegistryTileFootSortKey(tile, x, y, tileSize);
            const screenX = x * tileSize - camera.x;
            const screenY = y * tileSize - camera.y;

            drawables.push({
                sortY,
                sortX,
                draw: (drawCtx) => {
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

    for (const remote of remotes) {
        if (remote.z !== z) continue;
        const { sortY, sortX } = getTileFootSortKey(remote.tileX, remote.tileY, tileSize);
        const rx = remote.tileX * tileSize - camera.x;
        const ry = remote.tileY * tileSize - camera.y;

        drawables.push({
            sortY,
            sortX,
            draw: (drawCtx) => {
                drawCtx.fillStyle = 'rgba(244, 114, 182, 0.85)';
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
