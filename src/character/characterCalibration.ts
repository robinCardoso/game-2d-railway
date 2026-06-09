import type { AnimationDef, CharacterSpriteConfig } from './characterSpriteTypes.js';

/** Versão do schema — incrementar apenas com migração explícita. */
export const CHARACTER_CALIBRATION_SCHEMA_VERSION = 1;

/** Sufixo do arquivo lateral: `knight.calibration.json` ao lado de `knight.json`. */
export const CHARACTER_CALIBRATION_FILE_SUFFIX = '.calibration.json';

/**
 * Documento dedicado de calibração — fonte de verdade para fatiamento, âncora e animações.
 * Separado do JSON principal para evitar regressões quando metadados (vocation, category, etc.) mudam.
 */
export interface CharacterCalibrationDocument {
    schemaVersion: number;
    /** URL da spritesheet no momento do save — usado para validar pareamento arquivo/PNG. */
    spriteSheetUrl: string;
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    anchorX: number;
    anchorY: number;
    corpseAnchorY?: number;
    drawScale?: number;
    sheetLayout: 'horizontal' | 'vertical';
    defaultDirection: CharacterSpriteConfig['defaultDirection'];
    chromaKey?: boolean;
    chromaKeyTolerance?: number;
    animations: Record<string, AnimationDef>;
    updatedAt?: string;
}

export function isCharacterCalibrationFilename(filename: string): boolean {
    return filename.endsWith(CHARACTER_CALIBRATION_FILE_SUFFIX);
}

export function spriteUrlToConfigPaths(spriteSheetUrl: string): { mainJson: string; calibrationJson: string } {
    const clean = spriteSheetUrl.replace(/^\//, '');
    const base = clean.replace(/\.png$/i, '');
    return {
        mainJson: `${base}.json`,
        calibrationJson: `${base}${CHARACTER_CALIBRATION_FILE_SUFFIX}`,
    };
}

export function calibrationPathFromConfigPath(configPath: string): string {
    if (configPath.endsWith(CHARACTER_CALIBRATION_FILE_SUFFIX)) return configPath;
    return configPath.replace(/\.json$/i, CHARACTER_CALIBRATION_FILE_SUFFIX);
}

export function extractCalibrationFromConfig(config: CharacterSpriteConfig): CharacterCalibrationDocument {
    return {
        schemaVersion: CHARACTER_CALIBRATION_SCHEMA_VERSION,
        spriteSheetUrl: config.spriteSheetUrl,
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
        offsetX: config.offsetX ?? 0,
        offsetY: config.offsetY ?? 0,
        gapX: config.gapX ?? 0,
        gapY: config.gapY ?? 0,
        anchorX: config.anchorX ?? 0,
        anchorY: config.anchorY ?? 0,
        corpseAnchorY: config.corpseAnchorY,
        drawScale: config.drawScale,
        sheetLayout: config.sheetLayout ?? 'horizontal',
        defaultDirection: config.defaultDirection ?? 'down',
        chromaKey: config.chromaKey,
        chromaKeyTolerance: config.chromaKeyTolerance,
        animations: JSON.parse(JSON.stringify(config.animations)) as Record<string, AnimationDef>,
        updatedAt: new Date().toISOString(),
    };
}

export function applyCalibrationToConfig<T extends CharacterSpriteConfig>(
    config: T,
    calibration: CharacterCalibrationDocument
): T {
    return {
        ...config,
        frameWidth: calibration.frameWidth,
        frameHeight: calibration.frameHeight,
        offsetX: calibration.offsetX,
        offsetY: calibration.offsetY,
        gapX: calibration.gapX,
        gapY: calibration.gapY,
        anchorX: calibration.anchorX,
        anchorY: calibration.anchorY,
        corpseAnchorY: calibration.corpseAnchorY,
        drawScale: calibration.drawScale,
        sheetLayout: calibration.sheetLayout,
        defaultDirection: calibration.defaultDirection,
        chromaKey: calibration.chromaKey,
        chromaKeyTolerance: calibration.chromaKeyTolerance,
        animations: JSON.parse(JSON.stringify(calibration.animations)) as Record<string, AnimationDef>,
    };
}

export function parseCharacterCalibration(jsonString: string): CharacterCalibrationDocument {
    const raw = JSON.parse(jsonString) as Partial<CharacterCalibrationDocument>;
    if (raw.schemaVersion !== CHARACTER_CALIBRATION_SCHEMA_VERSION) {
        throw new Error(
            `Versão de calibração não suportada: ${String(raw.schemaVersion)} (esperado ${CHARACTER_CALIBRATION_SCHEMA_VERSION}).`
        );
    }
    if (!raw.spriteSheetUrl || typeof raw.spriteSheetUrl !== 'string') {
        throw new Error('spriteSheetUrl ausente no arquivo de calibração.');
    }
    if (typeof raw.frameWidth !== 'number' || raw.frameWidth <= 0) {
        throw new Error('frameWidth inválido no arquivo de calibração.');
    }
    if (typeof raw.frameHeight !== 'number' || raw.frameHeight <= 0) {
        throw new Error('frameHeight inválido no arquivo de calibração.');
    }
    if (!raw.animations || typeof raw.animations !== 'object') {
        throw new Error('animations ausente no arquivo de calibração.');
    }
    const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    return {
        schemaVersion: CHARACTER_CALIBRATION_SCHEMA_VERSION,
        spriteSheetUrl: raw.spriteSheetUrl,
        frameWidth: raw.frameWidth,
        frameHeight: raw.frameHeight,
        offsetX: num(raw.offsetX),
        offsetY: num(raw.offsetY),
        gapX: num(raw.gapX),
        gapY: num(raw.gapY),
        anchorX: num(raw.anchorX),
        anchorY: num(raw.anchorY),
        corpseAnchorY: typeof raw.corpseAnchorY === 'number' ? raw.corpseAnchorY : undefined,
        drawScale: typeof raw.drawScale === 'number' && raw.drawScale > 0 ? raw.drawScale : undefined,
        sheetLayout: raw.sheetLayout === 'vertical' ? 'vertical' : 'horizontal',
        defaultDirection:
            raw.defaultDirection === 'up' ||
            raw.defaultDirection === 'down' ||
            raw.defaultDirection === 'left' ||
            raw.defaultDirection === 'right'
                ? raw.defaultDirection
                : 'down',
        chromaKey: typeof raw.chromaKey === 'boolean' ? raw.chromaKey : undefined,
        chromaKeyTolerance: typeof raw.chromaKeyTolerance === 'number' ? raw.chromaKeyTolerance : undefined,
        animations: raw.animations as Record<string, AnimationDef>,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    };
}

export function serializeCharacterCalibration(doc: CharacterCalibrationDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Campos que pertencem exclusivamente ao sidecar `.calibration.json`. */
export const CHARACTER_CALIBRATION_FIELD_KEYS = [
    'frameWidth',
    'frameHeight',
    'offsetX',
    'offsetY',
    'gapX',
    'gapY',
    'anchorX',
    'anchorY',
    'corpseAnchorY',
    'drawScale',
    'sheetLayout',
    'defaultDirection',
    'chromaKey',
    'chromaKeyTolerance',
    'animations',
] as const;

/** Remove campos de calibração do JSON principal — identidade/metadados permanecem. */
export function stripCalibrationFromConfig<T extends Record<string, unknown>>(config: T): T {
    const result = { ...config };
    for (const key of CHARACTER_CALIBRATION_FIELD_KEYS) {
        delete result[key];
    }
    return result;
}

export function configHasInlineCalibrationFields(config: Record<string, unknown>): boolean {
    return CHARACTER_CALIBRATION_FIELD_KEYS.some((key) => key in config);
}

export function mergeCharacterConfigWithCalibration(
    config: CharacterSpriteConfig,
    calibration: CharacterCalibrationDocument
): CharacterSpriteConfig {
    const configUrl = config.spriteSheetUrl.replace(/^\//, '');
    const calUrl = calibration.spriteSheetUrl.replace(/^\//, '');
    if (configUrl !== calUrl) {
        console.warn(
            `[characterCalibration] spriteSheetUrl divergente (config=${configUrl}, calib=${calUrl}); aplicando calibração mesmo assim.`
        );
    }
    return applyCalibrationToConfig(config, calibration);
}
