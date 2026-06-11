/**
 * URLs dos ícones exclusivos do HUD Play.
 * Arquivos em public/ui/play-hud/ — substitua PNG/SVG mantendo o mesmo nome.
 */

const BASE = '/ui/play-hud';

export type PlayHudActionIconKey = 'character' | 'inventory' | 'map' | 'settings' | 'chat' | 'menu';

/** Mapeamento botão → arquivo de ícone (relativo a public/). */
export const PLAY_HUD_ACTION_ICON_URLS: Record<PlayHudActionIconKey, string> = {
    character: `${BASE}/character.svg`,
    inventory: `${BASE}/inventory.svg`,
    map: `${BASE}/map.svg`,
    settings: `${BASE}/config.svg`,
    chat: `${BASE}/chat.svg`,
    menu: `${BASE}/menu.svg`,
};

export function playHudActionIconUrl(key: PlayHudActionIconKey): string {
    return PLAY_HUD_ACTION_ICON_URLS[key];
}
