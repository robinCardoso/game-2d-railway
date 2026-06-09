import { apiFetch } from './apiFetch';
import { isApiAuthEnabled } from './authClient';
import {
    isMockAuthEnabled,
    mockCreateCharacter,
    mockGetCharacter,
    mockIsNameTaken,
    mockListCharacters,
    mockSoftDeleteCharacter,
    mockUpdateLastPlayed,
    mockUpdateCharacterLocation,
    mockUpdateCharacterProgress,
} from './mockAuth';
import type { CharacterRow } from './types';
import type { Gender, VocationId } from '../../shared/types/character';
import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import { createDefaultCharacterConfig } from '../character/characterSerializer';
import { MAX_CHARACTERS_PER_ACCOUNT } from './types';
import { DEFAULT_GAME_CONFIG } from '../game-data/default/game.config';

function mapApiCharacter(raw: CharacterRow): CharacterRow {
    return raw;
}

async function parseApiError(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: string };
        return body.error ?? `HTTP ${res.status}`;
    } catch {
        return `HTTP ${res.status}`;
    }
}

export async function listCharacters(accountId: string): Promise<CharacterRow[]> {
    if (isMockAuthEnabled()) {
        return mockListCharacters(accountId);
    }
    if (isApiAuthEnabled()) {
        const res = await apiFetch('/api/characters');
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as { characters: CharacterRow[] };
        return data.characters.map(mapApiCharacter);
    }
    throw new Error('Armazenamento de personagens não configurado.');
}

export async function getCharacter(id: string, accountId: string): Promise<CharacterRow | null> {
    if (isMockAuthEnabled()) {
        return mockGetCharacter(id, accountId);
    }
    if (isApiAuthEnabled()) {
        const res = await apiFetch(`/api/characters/${encodeURIComponent(id)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as { character: CharacterRow };
        return mapApiCharacter(data.character);
    }
    throw new Error('Armazenamento de personagens não configurado.');
}

export async function createCharacter(
    accountId: string,
    name: string,
    vocationId: VocationId,
    gender: Gender,
    outfitId: string,
    spriteSheetUrl: string,
    spawnMapId = DEFAULT_GAME_CONFIG.start.mapId
): Promise<CharacterRow> {
    if (isMockAuthEnabled()) {
        if (mockIsNameTaken(name)) {
            throw new Error('Este nome já está em uso.');
        }
        return await mockCreateCharacter(accountId, name, vocationId, gender, outfitId, spriteSheetUrl, spawnMapId);
    }
    if (isApiAuthEnabled()) {
        const existing = await listCharacters(accountId);
        if (existing.length >= MAX_CHARACTERS_PER_ACCOUNT) {
            throw new Error(`Limite de ${MAX_CHARACTERS_PER_ACCOUNT} personagens por conta.`);
        }

        let outfitConfig: CharacterSpriteConfig | null = null;
        try {
            const { fetchCharacterConfigMerged } = await import('../character/characterCalibrationLoader');
            outfitConfig = await fetchCharacterConfigMerged(spriteSheetUrl);
        } catch (e) {
            console.error('Falha ao carregar outfit config durante criação:', e);
        }

        const base = outfitConfig || createDefaultCharacterConfig();
        base.name = name;
        base.spriteSheetUrl = spriteSheetUrl;

        const res = await apiFetch('/api/characters', {
            method: 'POST',
            body: JSON.stringify({
                name,
                vocationId,
                gender,
                outfitId,
                spriteSheetUrl,
                spawnMapId,
                outfitConfig: {
                    ...base,
                    vocation: vocationId,
                    level: 1,
                    experience: 0,
                    gender,
                    appearance: { gender, outfitId, spriteSheetUrl },
                    gameId: DEFAULT_GAME_CONFIG.id,
                    mapId: spawnMapId,
                    position: { ...DEFAULT_GAME_CONFIG.start.position },
                    direction: DEFAULT_GAME_CONFIG.start.direction,
                },
            }),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as { character: CharacterRow };
        return mapApiCharacter(data.character);
    }
    throw new Error('Armazenamento de personagens não configurado.');
}

export async function softDeleteCharacter(id: string, accountId: string): Promise<void> {
    if (isMockAuthEnabled()) {
        mockSoftDeleteCharacter(id, accountId);
        return;
    }
    if (isApiAuthEnabled()) {
        const res = await apiFetch(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await parseApiError(res));
        return;
    }
    throw new Error('Armazenamento de personagens não configurado.');
}

export async function markCharacterPlayed(id: string, accountId: string): Promise<void> {
    if (isMockAuthEnabled()) {
        mockUpdateLastPlayed(id, accountId);
        return;
    }
    if (isApiAuthEnabled()) {
        const res = await apiFetch(`/api/characters/${encodeURIComponent(id)}/last-played`, {
            method: 'PATCH',
            body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        return;
    }
    throw new Error('Armazenamento de personagens não configurado.');
}

export function validateCharacterName(name: string): string | null {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
        return 'Nome deve ter entre 3 e 20 caracteres.';
    }
    if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) {
        return 'Use apenas letras, números e espaços.';
    }
    return null;
}

export async function updateCharacterLocation(
    characterId: string,
    location: {
        mapId: string;
        position: { x: number; y: number; z: number };
        direction: 'north' | 'south' | 'east' | 'west';
    }
): Promise<void> {
    if (isMockAuthEnabled()) {
        mockUpdateCharacterLocation(characterId, location);
        return;
    }
    if (isApiAuthEnabled()) {
        const res = await apiFetch(`/api/characters/${encodeURIComponent(characterId)}/location`, {
            method: 'PATCH',
            body: JSON.stringify(location),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        return;
    }
    throw new Error('Armazenamento de personagens não configurado.');
}

export async function updateCharacterProgress(
    characterId: string,
    progress: { level: number; experience: number }
): Promise<void> {
    if (isMockAuthEnabled()) {
        mockUpdateCharacterProgress(characterId, progress);
        return;
    }
    if (isApiAuthEnabled()) {
        const res = await apiFetch(`/api/characters/${encodeURIComponent(characterId)}/progress`, {
            method: 'PATCH',
            body: JSON.stringify(progress),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        return;
    }
    throw new Error('Armazenamento de personagens não configurado.');
}
