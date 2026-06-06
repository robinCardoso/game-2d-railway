import type { Gender } from '../../../shared/types/character';
import type { CharacterSpriteConfig } from '../../character/spriteAnimation';

export interface OutfitPreset {
    readonly label: string;
    readonly sprites: Record<Gender, Partial<CharacterSpriteConfig>>;
}

/** Presets embutidos; vocações novas dependem de `public/outfit_presets.json`. */
export const OUTFIT_PRESETS: Record<string, OutfitPreset> = {
    knight: {
        label: 'Cavaleiro (Knight)',
        sprites: {
            male: {
                spriteSheetUrl: 'tiles/characters/vocations/male/knight.png',
                name: 'Cavaleiro',
            },
            female: {
                spriteSheetUrl: 'tiles/characters/vocations/female/knight.png',
                name: 'Cavaleira',
            },
        },
    },
    mage: {
        label: 'Mago (Mage)',
        sprites: {
            male: {
                spriteSheetUrl: 'tiles/characters/vocations/male/mage.png',
                name: 'Mago',
            },
            female: {
                spriteSheetUrl: 'tiles/characters/vocations/female/mage.png',
                name: 'Maga',
            },
        },
    },
    archer: {
        label: 'Arqueiro (Archer)',
        sprites: {
            male: {
                spriteSheetUrl: 'tiles/characters/vocations/male/archer.png',
                name: 'Arqueiro',
            },
            female: {
                spriteSheetUrl: 'tiles/characters/vocations/female/archer.png',
                name: 'Arqueira',
            },
        },
    },
};
