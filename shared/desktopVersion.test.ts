import { describe, expect, it } from 'vitest';
import { compareSemver, isClientVersionAllowed } from './desktopVersion';

describe('compareSemver', () => {
    it('ordena versões corretamente', () => {
        expect(compareSemver('0.1.0', '0.1.0')).toBe(0);
        expect(compareSemver('0.1.1', '0.1.0')).toBe(1);
        expect(compareSemver('0.0.9', '0.1.0')).toBe(-1);
        expect(compareSemver('v1.2.3', '1.2.2')).toBe(1);
    });
});

describe('isClientVersionAllowed', () => {
    it('permite quando client >= min', () => {
        expect(isClientVersionAllowed('0.2.0', '0.1.0')).toBe(true);
        expect(isClientVersionAllowed('0.1.0', '0.1.0')).toBe(true);
    });

    it('bloqueia quando client < min', () => {
        expect(isClientVersionAllowed('0.0.9', '0.1.0')).toBe(false);
    });
});
