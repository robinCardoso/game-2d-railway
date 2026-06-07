import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('resolveApiUrl', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('prefixa caminhos relativos com apiBaseUrl', async () => {
        const { resolveApiUrl } = await import('./apiUrl');
        expect(resolveApiUrl('/api/auth/login')).toBe('https://api.example.com/api/auth/login');
    });

    it('remove barra final do apiBaseUrl antes de concatenar', async () => {
        vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/');
        vi.resetModules();
        const { resolveApiUrl } = await import('./apiUrl');
        expect(resolveApiUrl('/api/auth/login')).toBe('https://api.example.com/api/auth/login');
    });

    it('mantém caminho relativo quando apiBaseUrl está vazio', async () => {
        vi.stubEnv('VITE_API_BASE_URL', '');
        vi.resetModules();
        const { resolveApiUrl } = await import('./apiUrl');
        expect(resolveApiUrl('/api/auth/me')).toBe('/api/auth/me');
    });

    it('não altera URLs absolutas', async () => {
        const { resolveApiUrl } = await import('./apiUrl');
        expect(resolveApiUrl('https://other.test/x')).toBe('https://other.test/x');
    });
});
