import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import type { Gender, CharacterAppearance } from '../../shared/types/character';

export interface AuthSession {
    userId: string;
    email: string;
}

export interface UserProfile {
    id: string;
    displayName: string | null;
    role: 'player' | 'gm' | 'admin';
    canAccessStudio: boolean;
}

export interface CharacterRow {
    id: string;
    accountId: string;
    name: string;
    outfitConfig: CharacterSpriteConfig;
    spawnMapId: string;
    createdAt: string;
    lastPlayedAt: string | null;
    deletedAt?: string | null;
    vocation?: string;
    level?: number;
    experience?: number;
    gender?: Gender;
    appearance?: CharacterAppearance;
    gameId: string;
    mapId: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
    direction: 'north' | 'south' | 'east' | 'west';
}

export const MAX_CHARACTERS_PER_ACCOUNT = 4;

