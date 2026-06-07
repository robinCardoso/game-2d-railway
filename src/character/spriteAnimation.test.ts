import { describe, expect, it } from 'vitest';
import { resolveSpriteDirectionForState, type CharacterSpriteConfig } from './spriteAnimation';

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
