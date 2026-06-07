import type { AnimationDef } from '../character/spriteAnimation';

export interface AnimationInputValues {
    row: number;
    startFrame: number;
    frames: number;
    speedFps: number;
}

export interface CharacterAnimationDraftOptions {
    defaultSpeedFps?: number;
    /** true = cópia isolada (calibrador); false = muta o objeto passado (editor lateral). */
    clone?: boolean;
}

export function animationKey(state: string, direction: string): string {
    return `${state}_${direction}`;
}

export function createDefaultAnimationDef(defaultSpeedFps = 5): AnimationDef {
    return { row: 0, startFrame: 0, frames: 1, speedFps: defaultSpeedFps, loop: true };
}

export function parseAnimationInputFields(
    raw: {
        row: string | number;
        startFrame: string | number;
        frames: string | number;
        speedFps: string | number;
    },
    options?: { defaultSpeedFps?: number }
): AnimationInputValues {
    const defaultSpeed = options?.defaultSpeedFps ?? 5;
    const row = typeof raw.row === 'number' ? raw.row : parseInt(raw.row, 10);
    const startFrame = typeof raw.startFrame === 'number' ? raw.startFrame : parseInt(raw.startFrame, 10);
    const frames = typeof raw.frames === 'number' ? raw.frames : parseInt(raw.frames, 10);
    const speedFps = typeof raw.speedFps === 'number' ? raw.speedFps : parseInt(raw.speedFps, 10);
    return {
        row: Number.isNaN(row) ? 0 : row,
        startFrame: Number.isNaN(startFrame) ? 0 : startFrame,
        frames: Number.isNaN(frames) || frames < 1 ? 1 : frames,
        speedFps: Number.isNaN(speedFps) || speedFps < 1 ? defaultSpeed : speedFps,
    };
}

export class CharacterAnimationDraft {
    private readonly animations: Record<string, AnimationDef>;
    private readonly defaultSpeedFps: number;
    activeState: string;
    activeDirection: string;

    constructor(
        animations: Record<string, AnimationDef>,
        activeState: string,
        activeDirection: string,
        options?: CharacterAnimationDraftOptions
    ) {
        const clone = options?.clone !== false;
        this.animations = clone
            ? (JSON.parse(JSON.stringify(animations)) as Record<string, AnimationDef>)
            : animations;
        this.defaultSpeedFps = options?.defaultSpeedFps ?? 5;
        this.activeState = activeState;
        this.activeDirection = activeDirection;
    }

    getActiveKey(): string {
        return animationKey(this.activeState, this.activeDirection);
    }

    ensureAnimation(key: string): AnimationDef {
        if (!this.animations[key]) {
            this.animations[key] = createDefaultAnimationDef(this.defaultSpeedFps);
        }
        return this.animations[key];
    }

    getDef(state: string, direction: string): AnimationDef {
        return this.ensureAnimation(animationKey(state, direction));
    }

    readInputs(values: AnimationInputValues): void {
        this.applyInputsToKey(this.getActiveKey(), values);
    }

    readInputsToKey(state: string, direction: string, values: AnimationInputValues): void {
        this.applyInputsToKey(animationKey(state, direction), values);
    }

    writeInputsFor(state?: string, direction?: string): AnimationInputValues {
        const key = animationKey(state ?? this.activeState, direction ?? this.activeDirection);
        const anim = this.ensureAnimation(key);
        return {
            row: anim.row,
            startFrame: anim.startFrame ?? 0,
            frames: anim.frames,
            speedFps: anim.speedFps,
        };
    }

    writeInputsForActive(): AnimationInputValues {
        return this.writeInputsFor(this.activeState, this.activeDirection);
    }

    flushActive(currentInputs: AnimationInputValues): void {
        this.readInputs(currentInputs);
    }

    switchSelection(
        nextState: string,
        nextDirection: string,
        currentInputs: AnimationInputValues
    ): AnimationInputValues {
        this.readInputs(currentInputs);
        this.activeState = nextState;
        this.activeDirection = nextDirection;
        return this.writeInputsForActive();
    }

    setActive(state: string, direction: string): void {
        this.activeState = state;
        this.activeDirection = direction;
    }

    toAnimations(): Record<string, AnimationDef> {
        return JSON.parse(JSON.stringify(this.animations)) as Record<string, AnimationDef>;
    }

    getAnimationsReference(): Record<string, AnimationDef> {
        return this.animations;
    }

    private applyInputsToKey(key: string, values: AnimationInputValues): void {
        const anim = this.ensureAnimation(key);
        anim.row = values.row;
        anim.startFrame = values.startFrame;
        anim.frames = values.frames;
        anim.speedFps = values.speedFps;
    }
}
