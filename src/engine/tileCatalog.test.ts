import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('getTileCatalogUrl', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('retorna caminho relativo quando VITE_API_BASE_URL está vazio', async () => {
        vi.stubEnv('VITE_API_BASE_URL', '');
        const { getTileCatalogUrl, TILE_CATALOG_PATH } = await import('./tileCatalog');
        expect(getTileCatalogUrl()).toBe(TILE_CATALOG_PATH);
    });

    it('prefixa com VITE_API_BASE_URL em produção/Electron', async () => {
        vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
        const { getTileCatalogUrl } = await import('./tileCatalog');
        expect(getTileCatalogUrl()).toBe('https://api.example.com/tile_catalog.json');
    });
});
