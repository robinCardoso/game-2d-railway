import type { WebSocket } from 'ws';
import type { PlayerAppearance } from '../../../shared/protocol.js';
import type { CharacterEquipmentState } from '../../../shared/inventory.js';
import type { SpellBarState } from '../../../shared/spellBar.js';
import type { ChatRateLimitState } from '../chat/chatService.js';

export const DEFAULT_APPEARANCE: PlayerAppearance = {
    outfitId: 'knight',
    spriteSheetUrl: 'tiles/characters/vocations/male/knight.png',
    gender: 'male',
    vocationId: 'knight',
};

export interface ConnectedPlayer {
    id: string;
    name: string;
    characterId?: string;
    accountId?: string;
    direction: 'north' | 'south' | 'east' | 'west';
    appearance: PlayerAppearance;
    mapId: string;
    instanceId?: string;
    tileX: number;
    tileY: number;
    z: number;
    lastStepDurationMs?: number;
    lastMoveAcceptedAtMs: number;
    lastObservedMoveIntervalMs: number;
    steppingDestTileX?: number;
    steppingDestTileY?: number;
    steppingDestExpiresAtMs?: number;
    level: number;
    experience: number;
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    lastAttackAtMs: number;
    spellCooldownUntil: Record<string, number>;
    groupCooldownUntil: Record<string, number>;
    lastMoveRejectionSentAtMs: number;
    equipment: CharacterEquipmentState;
    spellBar: SpellBarState;
    learnedSpellIds: string[];
    socket: WebSocket;
    chatRateLimit: ChatRateLimitState;
}

export type PlayerResourcesSnapshot = {
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
};
