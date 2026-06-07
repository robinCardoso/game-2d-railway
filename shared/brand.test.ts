import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';

describe('BRAND', () => {
    it('expõe nomes estáveis do produto', () => {
        expect(BRAND.gameName).toBe('Elarion Online');
        expect(BRAND.studioName).toBe('Elarion Studio');
    });
});
