import { removeChromaKey } from '../utils/imageProcessor';
import { resolveAnimationSourceRect } from './sheetFrameLayout';

export type CharacterState = 'idle' | 'walk' | 'attack' | 'sit' | 'dead' | 'cast';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface AnimationEvent {
    frameIndex: number;
    action: 'sound' | 'effect';
    parameter: string; // Ex: 'footstep', 'slash', 'cast'
}

export interface AnimationDef {
    row: number;
    frames: number;
    speedFps: number;
    loop: boolean;
    startFrame?: number; // Frame/Coluna onde a animação inicia na linha
    events?: AnimationEvent[]; // Eventos vinculados a frames específicos
}

export interface CharacterSpriteConfig {
    name: string;
    spriteSheetUrl: string;
    frameWidth: number;
    frameHeight: number;
    defaultDirection: Direction;
    animations: Record<string, AnimationDef>;
    offsetX?: number; // Margem inicial na horizontal (X)
    offsetY?: number; // Margem inicial na vertical (Y)
    gapX?: number;    // Espaçamento horizontal entre colunas de frames
    gapY?: number;    // Espaçamento vertical entre linhas de frames
    anchorX?: number; // Ajuste fino de âncora/renderização no mapa (X)
    anchorY?: number; // Ajuste fino de âncora/renderização no mapa (Y)
    /** Âncora Y extra quando morto (corpo/esqueleto no chão). */
    corpseAnchorY?: number;
    /** Escala visual no tile; movimento/colisão permanecem no grid da engine. */
    drawScale?: number;
    chromaKey?: boolean; // Se ativo, remove o fundo rosa (#FF00FF)
    chromaKeyTolerance?: number; // Tolerância de remoção de cor (10 a 180)
    sheetLayout?: 'horizontal' | 'vertical'; // Orientação da spritesheet
    category?: string; // Subpasta/categoria de organização
}

export class SpriteAnimationController {
    config: CharacterSpriteConfig;
    currentState: CharacterState = 'idle';
    currentDirection: Direction = 'down';
    currentFrameIndex: number = 0;
    lastFrameTime: number = 0;
    image: HTMLImageElement | null = null;
    isLoaded: boolean = false;
    onAnimationEndCallback?: () => void;

    constructor(config: CharacterSpriteConfig, options?: { autoLoad?: boolean }) {
        this.config = config;
        this.currentDirection = config.defaultDirection;
        if (options?.autoLoad !== false) {
            this.loadImage();
        }
    }

    public loadImage() {
        this.isLoaded = false;
        this.image = new Image();
        this.image.src = this.config.spriteSheetUrl;
        this.image.onload = async () => {
            if (this.config.chromaKey && this.image) {
                try {
                    const tolerance = this.config.chromaKeyTolerance ?? 50;
                    this.image = await removeChromaKey(this.image, undefined, tolerance);
                } catch (e) {
                    console.error('[SpriteAnimationController] Falha ao processar Chroma Key:', e);
                }
            }
            this.isLoaded = true;
        };
        this.image.onerror = (e) => {
            console.error(`Erro ao carregar spritesheet: ${this.config.spriteSheetUrl}`, e);
        };
    }

    // Permite ativar/desativar o chromaKey em tempo real e recarregar a textura
    setChromaKey(enabled: boolean, tolerance?: number) {
        let changed = false;
        if (this.config.chromaKey !== enabled) {
            this.config.chromaKey = enabled;
            changed = true;
        }
        if (tolerance !== undefined && this.config.chromaKeyTolerance !== tolerance) {
            this.config.chromaKeyTolerance = tolerance;
            changed = true;
        }
        if (changed) {
            this.loadImage();
        }
    }

    setState(state: CharacterState) {
        if (this.currentState !== state) {
            this.currentState = state;
            this.currentFrameIndex = 0;
            this.lastFrameTime = 0;
        }
    }

    setDirection(dir: Direction) {
        this.currentDirection = dir;
    }

    private getAnimationKey(): string {
        return `${this.currentState}_${this.currentDirection}`;
    }

    getCurrentAnimation(): AnimationDef | null {
        const key = this.getAnimationKey();
        return this.config.animations[key] || null;
    }

    update(nowMs: number, movementStepDurationMs?: number) {
        const anim = this.getCurrentAnimation();
        if (!anim) return;

        const { speedFps: baseSpeedFps, frames, loop } = anim;

        if (this.lastFrameTime === 0) {
            this.lastFrameTime = nowMs;
            return;
        }

        // Sincronização dinâmica de velocidade da animação com o movimento real
        let speedFps = baseSpeedFps;
        if (this.currentState === 'walk' && movementStepDurationMs && movementStepDurationMs > 0) {
            // Se um passo leva X ms, e temos N frames, a velocidade deve fazer
            // todos os frames rodarem exatamente na duração do passo.
            const totalDurationSec = movementStepDurationMs / 1000;
            speedFps = frames / totalDurationSec;
        }

        const frameDurationMs = 1000 / speedFps;
        const elapsed = nowMs - this.lastFrameTime;

        if (elapsed >= frameDurationMs) {
            const newFrames = Math.floor(elapsed / frameDurationMs);
            this.currentFrameIndex += newFrames;
            this.lastFrameTime = nowMs - (elapsed % frameDurationMs);

            if (this.currentFrameIndex >= frames) {
                if (loop) {
                    this.currentFrameIndex %= frames;
                } else {
                    this.currentFrameIndex = frames - 1;
                    if (this.onAnimationEndCallback) {
                        this.onAnimationEndCallback();
                    }
                }
            }
        }
    }

    getSourceRect() {
        const anim = this.getCurrentAnimation();
        const w = this.config.frameWidth;
        const h = this.config.frameHeight;
        const ox = this.config.offsetX ?? 0;
        const oy = this.config.offsetY ?? 0;
        const gx = this.config.gapX ?? 0;
        const gy = this.config.gapY ?? 0;

        if (!anim) {
            return {
                sx: ox,
                sy: oy,
                sw: w,
                sh: h,
                ax: this.config.anchorX ?? 0,
                ay: this.config.anchorY ?? 0
            };
        }

        const imageW = this.image?.naturalWidth ?? this.image?.width ?? 0;
        const imageH = this.image?.naturalHeight ?? this.image?.height ?? 0;
        const rect =
            imageW > 0 && imageH > 0
                ? resolveAnimationSourceRect(this.config, anim, this.currentFrameIndex, imageW, imageH)
                : {
                      sx:
                          this.config.sheetLayout === 'vertical'
                              ? ox + anim.row * (w + gx)
                              : ox + ((anim.startFrame ?? 0) + this.currentFrameIndex) * (w + gx),
                      sy:
                          this.config.sheetLayout === 'vertical'
                              ? oy + ((anim.startFrame ?? 0) + this.currentFrameIndex) * (h + gy)
                              : oy + anim.row * (h + gy),
                      sw: w,
                      sh: h,
                  };

        return {
            ...rect,
            ax: this.config.anchorX ?? 0,
            ay: this.config.anchorY ?? 0,
        };
    }
}
