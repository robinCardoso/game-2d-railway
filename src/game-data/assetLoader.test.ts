import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLooseAssetsMode, isPackagedFileClient, normalizePackPath } from './assetLoader';

describe('isPackagedFileClient / isLooseAssetsMode', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('file:// nunca usa loose mesmo com VITE_USE_LOOSE_ASSETS=true', () => {
        vi.stubGlobal('window', {
            location: { protocol: 'file:', href: 'file:///C:/app/dist/play.html' },
        });
        vi.stubEnv('VITE_USE_LOOSE_ASSETS', 'true');
        expect(isPackagedFileClient()).toBe(true);
        expect(isLooseAssetsMode()).toBe(false);
    });

    it('HTTP dev usa loose quando flag ativa', () => {
        vi.stubGlobal('window', {
            location: { protocol: 'http:', href: 'http://localhost:5173/play.html' },
        });
        vi.stubEnv('VITE_USE_LOOSE_ASSETS', 'true');
        expect(isLooseAssetsMode()).toBe(true);
    });
});

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
