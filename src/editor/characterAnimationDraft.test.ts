import { describe, expect, it } from 'vitest';
import {
    CharacterAnimationDraft,
    animationKey,
    parseAnimationInputFields,
} from './characterAnimationDraft';

describe('CharacterAnimationDraft', () => {
    it('preserva idle_down ao trocar para walk_down', () => {
        const draft = new CharacterAnimationDraft(
            {
                idle_down: { row: 2, startFrame: 1, frames: 3, speedFps: 6, loop: true },
            },
            'idle',
            'down',
            { defaultSpeedFps: 5, clone: true }
        );

        const next = draft.switchSelection('walk', 'down', {
            row: 2,
            startFrame: 1,
            frames: 3,
            speedFps: 6,
        });

        expect(draft.toAnimations().idle_down).toEqual({
            row: 2,
            startFrame: 1,
            frames: 3,
            speedFps: 6,
            loop: true,
        });
        expect(next).toEqual({
            row: 0,
            startFrame: 0,
            frames: 1,
            speedFps: 5,
        });
        expect(draft.getActiveKey()).toBe(animationKey('walk', 'down'));
    });

    it('serializa todas as chaves em toAnimations', () => {
        const draft = new CharacterAnimationDraft(
            {
                idle_down: { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
                walk_up: { row: 3, startFrame: 2, frames: 4, speedFps: 8, loop: true },
            },
            'walk',
            'up',
            { clone: true }
        );

        draft.readInputs({ row: 3, startFrame: 2, frames: 4, speedFps: 8 });
        const exported = draft.toAnimations();

        expect(Object.keys(exported).sort()).toEqual(['idle_down', 'walk_up']);
        expect(exported.walk_up.frames).toBe(4);
        expect(exported.idle_down.frames).toBe(1);
    });

    it('muta referência quando clone=false', () => {
        const source = {
            idle_down: { row: 0, startFrame: 0, frames: 1, speedFps: 1, loop: true },
        };
        const draft = new CharacterAnimationDraft(source, 'idle', 'down', {
            clone: false,
            defaultSpeedFps: 1,
        });

        draft.readInputs({ row: 5, startFrame: 2, frames: 6, speedFps: 10 });
        expect(source.idle_down.row).toBe(5);
        expect(source.idle_down.frames).toBe(6);
    });

    it('parseAnimationInputFields normaliza valores inválidos', () => {
        expect(
            parseAnimationInputFields(
                { row: '', startFrame: 'x', frames: '0', speedFps: '-1' },
                { defaultSpeedFps: 7 }
            )
        ).toEqual({
            row: 0,
            startFrame: 0,
            frames: 1,
            speedFps: 7,
        });
    });
});
