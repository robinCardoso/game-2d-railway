import { describe, expect, it } from 'vitest';
import {
    CHARACTER_CALIBRATION_FILE_SUFFIX,
    applyCalibrationToConfig,
    calibrationPathFromConfigPath,
    extractCalibrationFromConfig,
    isCharacterCalibrationFilename,
    mergeCharacterConfigWithCalibration,
    parseCharacterCalibration,
    serializeCharacterCalibration,
    spriteUrlToConfigPaths,
} from './characterCalibration';
import type { CharacterSpriteConfig } from './spriteAnimation';

const baseConfig: CharacterSpriteConfig = {
    name: 'Knight',
    spriteSheetUrl: 'tiles/characters/vocations/male/knight.png',
    frameWidth: 32,
    frameHeight: 32,
    defaultDirection: 'down',
    category: 'vocations/male',
    vocation: 'knight' as never,
    animations: {
        idle_down: { row: 0, startFrame: 0, frames: 1, speedFps: 6, loop: true },
        attack_down: { row: 0, startFrame: 3, frames: 2, speedFps: 5, loop: false },
    },
    offsetX: 0,
    offsetY: 0,
    gapX: 0,
    gapY: 0,
    anchorX: -10,
    anchorY: -10,
    sheetLayout: 'horizontal',
};

describe('characterCalibration', () => {
    it('resolve paths a partir da URL do PNG', () => {
        expect(spriteUrlToConfigPaths('tiles/characters/vocations/male/knight.png')).toEqual({
            mainJson: 'tiles/characters/vocations/male/knight.json',
            calibrationJson: `tiles/characters/vocations/male/knight${CHARACTER_CALIBRATION_FILE_SUFFIX}`,
        });
    });

    it('identifica arquivo de calibração pelo sufixo', () => {
        expect(isCharacterCalibrationFilename('knight.calibration.json')).toBe(true);
        expect(isCharacterCalibrationFilename('knight.json')).toBe(false);
    });

    it('calibrationPathFromConfigPath troca .json por .calibration.json', () => {
        expect(calibrationPathFromConfigPath('vocations/male/knight.json')).toBe(
            `vocations/male/knight${CHARACTER_CALIBRATION_FILE_SUFFIX}`
        );
    });

    it('extract + serialize + parse preserva animações e âncoras', () => {
        const doc = extractCalibrationFromConfig(baseConfig);
        const parsed = parseCharacterCalibration(serializeCharacterCalibration(doc));
        expect(parsed.frameWidth).toBe(32);
        expect(parsed.anchorX).toBe(-10);
        expect(parsed.animations.attack_down).toEqual({
            row: 0,
            startFrame: 3,
            frames: 2,
            speedFps: 5,
            loop: false,
        });
    });

    it('merge sobrescreve calibração no config mantendo metadados', () => {
        const doc = extractCalibrationFromConfig(baseConfig);
        doc.frameWidth = 64;
        doc.anchorX = -5;
        doc.animations.walk_down = { row: 1, startFrame: 2, frames: 4, speedFps: 8, loop: true };

        const merged = mergeCharacterConfigWithCalibration(baseConfig, doc);
        expect(merged.name).toBe('Knight');
        expect(merged.category).toBe('vocations/male');
        expect(merged.frameWidth).toBe(64);
        expect(merged.anchorX).toBe(-5);
        expect(merged.animations.walk_down.frames).toBe(4);
    });

    it('applyCalibrationToConfig não altera referência de metadados extras', () => {
        const withMeta = { ...baseConfig, showInCreation: true } as CharacterSpriteConfig & { showInCreation: boolean };
        const doc = extractCalibrationFromConfig(withMeta);
        doc.frameHeight = 48;
        const applied = applyCalibrationToConfig(withMeta, doc);
        expect(applied.showInCreation).toBe(true);
        expect(applied.frameHeight).toBe(48);
    });
});
