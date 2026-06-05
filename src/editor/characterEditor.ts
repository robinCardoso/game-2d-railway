import { SpriteAnimationController } from '../character/spriteAnimation';
import { createDefaultCharacterConfig } from '../character/characterSerializer';
import { activeCharacterController } from '../main';
import {
    buildDefaultSpriteEditorProfiles,
    initSpriteSheetEditor,
    type SpriteProfileId,
    type SpriteSheetEditorHandle,
} from './spriteSheetEditor';

function createEmptySpriteDraftConfig() {
    return {
        ...createDefaultCharacterConfig(),
        name: '',
        category: '',
        spriteSheetUrl: '',
    };
}

export const npcDraftController = new SpriteAnimationController(
    createEmptySpriteDraftConfig(),
    { autoLoad: false }
);

export const mobDraftController = new SpriteAnimationController(
    createEmptySpriteDraftConfig(),
    { autoLoad: false }
);

let spriteSheetEditorHandle: SpriteSheetEditorHandle | null = null;

export function initCharacterEditor(options?: { onCatalogChanged?: () => Promise<void> }): void {
    spriteSheetEditorHandle = initSpriteSheetEditor({
        controllers: {
            player: activeCharacterController,
            npc: npcDraftController,
            monster: mobDraftController,
        },
        profiles: buildDefaultSpriteEditorProfiles(),
        initialProfileId: 'player',
        onCatalogChanged: options?.onCatalogChanged,
    });
}

export function setSpriteEditorProfile(profileId: SpriteProfileId): void {
    spriteSheetEditorHandle?.setProfile(profileId);
}

export function getSpriteEditorFlyoutTitle(profileId: SpriteProfileId): string {
    return spriteSheetEditorHandle?.getFlyoutTitle(profileId) ?? 'Personagem';
}

export type { SpriteProfileId };
