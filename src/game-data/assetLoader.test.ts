import { describe, expect, it } from 'vitest';
import { normalizePackPath } from './assetLoader';

describe('normalizePackPath', () => {
    it('remove barra inicial', () => {
        expect(normalizePackPath('/tiles/maps/foo.png')).toBe('tiles/maps/foo.png');
    });

    it('converte glob relativo para chave do manifest', () => {
        expect(normalizePackPath('../../tiles/maps/foo.png')).toBe('tiles/maps/foo.png');
    });

    it('preserva JSON em public/', () => {
        expect(normalizePackPath('/maps/mainland.json')).toBe('maps/mainland.json');
    });
});
