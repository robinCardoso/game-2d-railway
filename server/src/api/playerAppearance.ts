import type { PlayerAppearance } from '../../../shared/protocol.js';

const DEFAULT_APPEARANCE: PlayerAppearance = {
    outfitId: 'knight',
    spriteSheetUrl: 'tiles/characters/vocations/male/knight.png',
    gender: 'male',
    vocationId: 'knight',
};

export function appearanceFromCharacterRow(row: {
    outfit_id: string;
    sprite_sheet_url: string;
    gender: string;
    vocation_id: string;
    outfit_config?: Record<string, unknown>;
}): PlayerAppearance {
    const config = row.outfit_config ?? {};
    const app = (config.appearance as Record<string, unknown> | undefined) ?? {};
    return {
        outfitId:
            (typeof app.outfitId === 'string' && app.outfitId) ||
            row.outfit_id ||
            DEFAULT_APPEARANCE.outfitId,
        spriteSheetUrl:
            (typeof app.spriteSheetUrl === 'string' && app.spriteSheetUrl) ||
            row.sprite_sheet_url ||
            DEFAULT_APPEARANCE.spriteSheetUrl,
        gender:
            app.gender === 'male' || app.gender === 'female'
                ? app.gender
                : row.gender === 'female'
                  ? 'female'
                  : 'male',
        vocationId: row.vocation_id || DEFAULT_APPEARANCE.vocationId,
    };
}
