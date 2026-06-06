import { ENGINE_CONFIG } from '../engine/config';

export interface MapSpriteCalibration {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    gridCols: number;
    gridRows: number;
    sheetLayout: 'horizontal' | 'vertical';
    anchorX?: number;
    anchorY?: number;
}

export interface MapSpriteCalibrationHints {
    variantStripFrames?: number;
    frameWidth?: number;
    frameHeight?: number;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
    gridCols?: number;
    gridRows?: number;
    sheetLayout?: 'horizontal' | 'vertical';
    anchorX?: number;
    anchorY?: number;
}

function hasPersistedGrid(hints?: MapSpriteCalibrationHints): boolean {
    return (
        !!hints &&
        (hints.frameWidth ?? 0) > 0 &&
        (hints.frameHeight ?? 0) > 0 &&
        (hints.gridCols ?? 0) >= 1 &&
        (hints.gridRows ?? 0) >= 1
    );
}

/** Infere grade de fatiamento a partir do PNG e metadados (tile_properties). */
export function inferMapSpriteCalibration(
    imageW: number,
    imageH: number,
    hints?: MapSpriteCalibrationHints
): MapSpriteCalibration {
    const tileSize = ENGINE_CONFIG.TILE_SIZE;

    if (hasPersistedGrid(hints)) {
        return {
            frameWidth: hints!.frameWidth!,
            frameHeight: hints!.frameHeight!,
            offsetX: hints!.offsetX ?? 0,
            offsetY: hints!.offsetY ?? 0,
            gapX: hints!.gapX ?? 0,
            gapY: hints!.gapY ?? 0,
            gridCols: hints!.gridCols!,
            gridRows: hints!.gridRows!,
            sheetLayout: hints!.sheetLayout ?? 'horizontal',
        };
    }

    const offsetX = hints?.offsetX ?? 0;
    const offsetY = hints?.offsetY ?? 0;
    const gapX = hints?.gapX ?? 0;
    const gapY = hints?.gapY ?? 0;

    if (imageW === tileSize && imageH === tileSize) {
        return {
            frameWidth: tileSize,
            frameHeight: tileSize,
            offsetX,
            offsetY,
            gapX,
            gapY,
            gridCols: 1,
            gridRows: 1,
            sheetLayout: 'horizontal',
        };
    }

    const horizontalFrames =
        imageH === tileSize && imageW > tileSize && imageW % tileSize === 0
            ? Math.floor(imageW / tileSize)
            : 0;

    if (horizontalFrames >= 2) {
        return {
            frameWidth: tileSize,
            frameHeight: tileSize,
            offsetX,
            offsetY,
            gapX,
            gapY,
            gridCols: horizontalFrames,
            gridRows: 1,
            sheetLayout: 'horizontal',
        };
    }

    const verticalFrames =
        imageW === tileSize && imageH > tileSize && imageH % tileSize === 0
            ? Math.floor(imageH / tileSize)
            : 0;

    if (verticalFrames >= 2) {
        return {
            frameWidth: tileSize,
            frameHeight: tileSize,
            offsetX,
            offsetY,
            gapX,
            gapY,
            gridCols: 1,
            gridRows: verticalFrames,
            sheetLayout: 'vertical',
        };
    }

    if (imageW % tileSize === 0 && imageH % tileSize === 0) {
        const cols = Math.floor(imageW / tileSize);
        const rows = Math.floor(imageH / tileSize);
        if (cols * rows > 1) {
            return {
                frameWidth: tileSize,
                frameHeight: tileSize,
                offsetX,
                offsetY,
                gapX,
                gapY,
                gridCols: cols,
                gridRows: rows,
                sheetLayout: 'horizontal',
            };
        }
    }

    return {
        frameWidth: imageW,
        frameHeight: imageH,
        offsetX,
        offsetY,
        gapX,
        gapY,
        gridCols: 1,
        gridRows: 1,
        sheetLayout: hints?.sheetLayout ?? 'horizontal',
    };
}

export function calibrationHintsFromProperties(
    properties?: Record<string, unknown>
): MapSpriteCalibrationHints | undefined {
    if (!properties) return undefined;
    const num = (key: string): number | undefined => {
        const v = properties[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() !== '') {
            const parsed = Number(v);
            if (Number.isFinite(parsed)) return parsed;
        }
        return undefined;
    };
    const layout = properties.sheetLayout;
    return {
        variantStripFrames: num('variantStripFrames'),
        frameWidth: num('frameWidth'),
        frameHeight: num('frameHeight'),
        offsetX: num('offsetX'),
        offsetY: num('offsetY'),
        gapX: num('gapX'),
        gapY: num('gapY'),
        gridCols: num('gridCols'),
        gridRows: num('gridRows'),
        sheetLayout: layout === 'vertical' ? 'vertical' : layout === 'horizontal' ? 'horizontal' : undefined,
        anchorX: num('anchorX'),
        anchorY: num('anchorY'),
    };
}

export function calibrationToPropertyPayload(
    calibration: MapSpriteCalibration
): Record<string, number | string> {
    const payload: Record<string, number | string> = {
        frameWidth: calibration.frameWidth,
        frameHeight: calibration.frameHeight,
        offsetX: calibration.offsetX,
        offsetY: calibration.offsetY,
        gapX: calibration.gapX,
        gapY: calibration.gapY,
        gridCols: calibration.gridCols,
        gridRows: calibration.gridRows,
        sheetLayout: calibration.sheetLayout,
        anchorX: calibration.anchorX ?? 0,
        anchorY: calibration.anchorY ?? 0,
    };
    if (calibration.gridCols * calibration.gridRows > 1) {
        payload.variantStripFrames = calibration.gridCols * calibration.gridRows;
    }
    return payload;
}
