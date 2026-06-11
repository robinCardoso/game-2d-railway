/**
 * Joystick virtual Capacitor — snap em 8 direções.
 */

import type { GridDirection } from '../../movement/gridMovement';

export interface JoystickVector {
    x: number;
    y: number;
}

const DEAD_ZONE = 0.22;

/**
 * Converte vetor normalizado do joystick (-1..1) em direção de grid.
 * `null` dentro da dead zone.
 */
export function joystickToDirection8(vector: JoystickVector): GridDirection | null {
    const { x, y } = vector;
    const mag = Math.hypot(x, y);
    if (mag < DEAD_ZONE) return null;

    const angle = Math.atan2(y, x);
    const octant = Math.round(angle / (Math.PI / 4));
    switch (octant) {
        case 0:
            return 'east';
        case 1:
            return 'southeast';
        case 2:
        case 3:
            return 'south';
        case 4:
            return 'southwest';
        case -1:
            return 'northeast';
        case -2:
        case -3:
            return 'north';
        case -4:
            return 'northwest';
        default:
            return 'west';
    }
}

export interface MobileJoystickController {
    active: boolean;
    vector: JoystickVector;
}

export function createMobileJoystick(): MobileJoystickController {
    return { active: false, vector: { x: 0, y: 0 } };
}

export function updateMobileJoystick(
    ctrl: MobileJoystickController,
    x: number,
    y: number,
    active: boolean
): GridDirection | null {
    ctrl.active = active;
    ctrl.vector = { x, y };
    if (!active) return null;
    return joystickToDirection8(ctrl.vector);
}
