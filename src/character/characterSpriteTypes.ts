/** Tipos compartilhados — sem dependências de DOM (seguro para server + client). */

export type CharacterState = 'idle' | 'walk' | 'attack' | 'sit' | 'dead' | 'cast';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface AnimationEvent {
    frameIndex: number;
    action: 'sound' | 'effect';
    parameter: string;
}

export interface AnimationDef {
    row: number;
    frames: number;
    speedFps: number;
    loop: boolean;
    startFrame?: number;
    events?: AnimationEvent[];
}

export interface CharacterSpriteConfig {
    name: string;
    spriteSheetUrl: string;
    frameWidth: number;
    frameHeight: number;
    defaultDirection: Direction;
    animations: Record<string, AnimationDef>;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
    anchorX?: number;
    anchorY?: number;
    corpseAnchorY?: number;
    drawScale?: number;
    chromaKey?: boolean;
    chromaKeyTolerance?: number;
    sheetLayout?: 'horizontal' | 'vertical';
    category?: string;
}
