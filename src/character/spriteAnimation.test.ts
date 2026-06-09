import { describe, expect, it } from 'vitest';
import {
    resolveSpriteDirectionForState,
    SpriteAnimationController,
    type CharacterSpriteConfig,
} from './spriteAnimation';

const config: CharacterSpriteConfig = {
    name: 'Test',
    spriteSheetUrl: 'test.png',
    frameWidth: 32,
    frameHeight: 32,
    defaultDirection: 'down',
    animations: {
        attack_right: { row: 0, frames: 1, speedFps: 5, loop: false },
        idle_down: { row: 0, frames: 1, speedFps: 1, loop: true },
    },
};

describe('resolveSpriteDirectionForState', () => {
    it('mantém direção preferida quando animação existe', () => {
        expect(resolveSpriteDirectionForState(config, 'attack', 'right')).toBe('right');
    });

    it('faz fallback para direção com animação do estado', () => {
        expect(resolveSpriteDirectionForState(config, 'attack', 'down')).toBe('right');
    });
});

describe('SpriteAnimationController attack replay', () => {
    const attackConfig: CharacterSpriteConfig = {
        ...config,
        animations: {
            attack_up: { row: 0, frames: 1, speedFps: 5, loop: false },
            attack_down: { row: 0, frames: 1, speedFps: 5, loop: false },
            attack_left: { row: 0, frames: 1, speedFps: 5, loop: false },
            attack_right: { row: 0, frames: 1, speedFps: 5, loop: false },
            idle_down: { row: 0, frames: 1, speedFps: 1, loop: true },
        },
    };

    it('force:true reinicia animação de ataque já em attack', () => {
        const ctrl = new SpriteAnimationController(attackConfig, { autoLoad: false });
        ctrl.setDirection('left');
        ctrl.setState('attack');
        ctrl.update(100, undefined);
        ctrl.update(300, undefined);
        expect(ctrl.currentFrameIndex).toBe(0);

        ctrl.setState('attack', { force: true });
        expect(ctrl.currentFrameIndex).toBe(0);
        expect(ctrl.lastFrameTime).toBe(0);
    });

    it('troca de direção durante attack reinicia frame', () => {
        const ctrl = new SpriteAnimationController(attackConfig, { autoLoad: false });
        ctrl.setDirection('up');
        ctrl.setState('attack');
        ctrl.update(100, undefined);
        ctrl.update(300, undefined);

        ctrl.setDirection('down');
        expect(ctrl.currentFrameIndex).toBe(0);
        expect(ctrl.lastFrameTime).toBe(0);
    });
});
