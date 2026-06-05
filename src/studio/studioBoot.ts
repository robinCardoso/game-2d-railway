/** Opções de boot do GM Studio (mapa limpo, sem rede/personagem). */
export interface StudioBootOptions {
    /** Inicia com mapa vazio em vez de carregar mainland. */
    blankMap: boolean;
    /** Não restaura preset do localStorage nem carrega spritesheet. */
    skipCharacterPreset: boolean;
    /** Não conecta ao servidor de jogo (ws). */
    skipGameNet: boolean;
    /** Não desenha o sprite do jogador no canvas. */
    hidePlayerSprite: boolean;
}

let studioBoot: StudioBootOptions | null = null;

export function configureStudioBoot(options: StudioBootOptions): void {
    studioBoot = options;
}

export function getStudioBoot(): StudioBootOptions | null {
    return studioBoot;
}

export function isStudioMode(): boolean {
    return studioBoot !== null;
}
