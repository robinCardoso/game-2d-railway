import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

function mockRes(): Response & { body: unknown; statusCode: number } {
    const res = {
        body: undefined as unknown,
        statusCode: 200,
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
    };
    return res as Response & { body: unknown; statusCode: number };
}

describe('GET /api/desktop/version handler', () => {
    beforeEach(() => {
        vi.stubEnv('DESKTOP_MIN_VERSION', '0.1.0');
        vi.stubEnv('DESKTOP_LATEST_VERSION', '0.2.0');
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('permite cliente na versão mínima', async () => {
        const { desktopVersionHandler } = await import('../../../server/src/routes/desktopVersion.js');
        const req = { query: { clientVersion: '0.1.0', platform: 'electron' } } as unknown as Request;
        const res = mockRes();

        desktopVersionHandler(req, res);

        expect(res.body).toMatchObject({
            allowed: true,
            minVersion: '0.1.0',
            latestVersion: '0.2.0',
            clientVersion: '0.1.0',
        });
    });

    it('bloqueia cliente abaixo da mínima', async () => {
        const { desktopVersionHandler } = await import('../../../server/src/routes/desktopVersion.js');
        const req = { query: { clientVersion: '0.0.5', platform: 'electron' } } as unknown as Request;
        const res = mockRes();

        desktopVersionHandler(req, res);

        expect(res.body).toMatchObject({
            allowed: false,
            clientVersion: '0.0.5',
        });
        expect((res.body as { message?: string }).message).toContain('não é mais suportada');
    });
});
