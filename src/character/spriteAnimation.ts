import { removeChromaKey } from '../utils/imageProcessor';
import { resolveAnimationSourceRect } from './sheetFrameLayout';
import { assetLoader } from '../game-data/assetLoader';
import type {
    AnimationDef,
    CharacterSpriteConfig,
    CharacterState,
    Direction,
} from './characterSpriteTypes';

export type {
    AnimationEvent,
    AnimationDef,
    CharacterSpriteConfig,
    CharacterState,
    Direction,
} from './characterSpriteTypes';

const DIRECTION_FALLBACK_ORDER: Direction[] = ['right', 'left', 'down', 'up'];

/** Escolhe direção com animação disponível para o estado (evita frame errado quando falta `attack_*`). */
export function resolveSpriteDirectionForState(
    config: CharacterSpriteConfig,
    state: CharacterState,
    preferred: Direction
): Direction {
    if (config.animations[`${state}_${preferred}`]) return preferred;
    for (const dir of DIRECTION_FALLBACK_ORDER) {
        if (config.animations[`${state}_${dir}`]) return dir;
    }
    return preferred;
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
        this.image.src = this.config.spriteSheetUrl.startsWith('data:')
            ? this.config.spriteSheetUrl
            : assetLoader.resolveAssetUrl('/' + this.config.spriteSheetUrl.replace(/^\//, ''));
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

    setState(state: CharacterState, options?: { force?: boolean }) {
        if (this.currentState !== state || options?.force) {
            this.currentState = state;
            this.currentFrameIndex = 0;
            this.lastFrameTime = 0;
        }
    }

    setDirection(dir: Direction) {
        if (this.currentDirection === dir) return;
        this.currentDirection = dir;
        if (this.currentState === 'attack' || this.currentState === 'cast') {
            this.currentFrameIndex = 0;
            this.lastFrameTime = 0;
        }
    }

    hasAnimation(state: CharacterState, dir: Direction): boolean {
        return Boolean(this.config.animations[`${state}_${dir}`]);
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
