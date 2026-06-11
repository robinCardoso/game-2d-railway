import { describe, expect, it } from 'vitest';
import { joystickToDirection8 } from './mobileDirection8';

describe('mobileDirection8', () => {
    it('snap em 8 direções', () => {
        expect(joystickToDirection8({ x: 1, y: 0 })).toBe('east');
        expect(joystickToDirection8({ x: 0, y: 1 })).toBe('south');
        expect(joystickToDirection8({ x: 0.8, y: 0.8 })).toBe('southeast');
    });

    it('dead zone retorna null', () => {
        expect(joystickToDirection8({ x: 0.05, y: 0.05 })).toBeNull();
    });
});
