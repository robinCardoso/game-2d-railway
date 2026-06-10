import { describe, expect, it, vi } from 'vitest';
import { isStudioClientEnabled } from './studioClient';

describe('isStudioClientEnabled', () => {
    it('retorna false quando VITE_STUDIO_ENABLED=false', () => {
        vi.stubEnv('VITE_STUDIO_ENABLED', 'false');
        expect(isStudioClientEnabled()).toBe(false);
        vi.unstubAllEnvs();
    });

    it('retorna true quando VITE_STUDIO_ENABLED=true', () => {
        vi.stubEnv('VITE_STUDIO_ENABLED', 'true');
        expect(isStudioClientEnabled()).toBe(true);
        vi.unstubAllEnvs();
    });
});
