import type { PlayerAppearance } from '../../shared/protocol';
import type { CharacterSpriteConfig, Direction } from '../character/spriteAnimation';
import type { CharacterRow } from '../shared/types';

const DEFAULT_APPEARANCE: PlayerAppearance = {
    outfitId: 'knight',
    spriteSheetUrl: 'tiles/characters/vocations/male/knight.png',
    gender: 'male',
    vocationId: 'knight',
};

export function appearanceFromCharacter(char: CharacterRow): PlayerAppearance {
    const app = char.appearance;
    const outfit = char.outfitConfig;
    return {
        outfitId: app?.outfitId ?? 'knight',
        spriteSheetUrl: app?.spriteSheetUrl ?? outfit?.spriteSheetUrl ?? DEFAULT_APPEARANCE.spriteSheetUrl,
        gender: app?.gender ?? char.gender ?? DEFAULT_APPEARANCE.gender,
        vocationId: char.vocation ?? DEFAULT_APPEARANCE.vocationId,
    };
}

export function protocolDirectionToSprite(
    dir?: 'north' | 'south' | 'east' | 'west'
): Direction {
    switch (dir) {
        case 'north':
            return 'up';
        case 'west':
            return 'left';
        case 'east':
            return 'right';
        default:
            return 'down';
    }
}

export async function loadOutfitSpriteConfig(
    appearance: PlayerAppearance,
    displayName?: string
): Promise<CharacterSpriteConfig> {
    const sheetPath = appearance.spriteSheetUrl.replace(/^\//, '');
    const jsonUrl = '/' + sheetPath.replace(/\.png$/i, '.json');
    try {
        const res = await fetch(jsonUrl);
        if (res.ok) {
            const config = (await res.json()) as CharacterSpriteConfig;
            return {
                ...config,
                name: displayName ?? config.name ?? appearance.outfitId,
                spriteSheetUrl: sheetPath,
            };
        }
    } catch (err) {
        console.warn('[playerAppearance] JSON de outfit indisponível:', jsonUrl, err);
    }
    return {
        name: displayName ?? appearance.outfitId,
        spriteSheetUrl: sheetPath,
        frameWidth: 32,
        frameHeight: 32,
        defaultDirection: 'down',
        animations: {
            idle: { row: 0, frames: 1, speedFps: 1, loop: true },
        },
    };
}
