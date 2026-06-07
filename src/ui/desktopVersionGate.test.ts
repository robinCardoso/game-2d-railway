import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformState = vi.hoisted(() => ({ platform: 'web' as 'web' | 'electron' }));

const domState = vi.hoisted(() => ({
    bodyHtml: '',
    toasts: [] as HTMLDivElement[],
}));

vi.mock('../game/runtime/platform', () => ({
    detectRuntimePlatform: () => platformState.platform,
}));

vi.mock('../shared/apiUrl', () => ({
    resolveApiUrl: (path: string) => `https://api.test${path}`,
}));

function installDomMocks(): void {
    domState.bodyHtml = '';
    domState.toasts = [];

    const body = {
        get innerHTML() {
            return domState.bodyHtml;
        },
        set innerHTML(value: string) {
            domState.bodyHtml = value;
        },
        appendChild(el: HTMLDivElement) {
            domState.toasts.push(el);
        },
    };

    vi.stubGlobal('document', {
        body,
        createElement: () => {
            const el = { className: '', innerHTML: '' } as HTMLDivElement;
            domState.toasts.push(el);
            return el;
        },
        getElementById: () => ({
            addEventListener: vi.fn(),
        }),
        querySelector: (selector: string) =>
            selector === '.desktop-update-toast' && domState.toasts.length > 0
                ? domState.toasts[0]
                : null,
    });

    vi.stubGlobal('location', { reload: vi.fn() });
}

describe('enforceDesktopVersionGate', () => {
    beforeEach(() => {
        platformState.platform = 'electron';
        installDomMocks();
        vi.stubGlobal('fetch', vi.fn());
        vi.stubGlobal('window', {
            electronAPI: {
                platform: 'electron',
                getVersion: vi.fn().mockResolvedValue('0.1.1'),
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('ignora fora do Electron', async () => {
        platformState.platform = 'web';
        const { enforceDesktopVersionGate } = await import('./desktopVersionGate');
        await expect(enforceDesktopVersionGate()).resolves.toBe(true);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('permite quando servidor autoriza', async () => {
        vi.stubEnv('PROD', 'true');
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                allowed: true,
                minVersion: '0.1.0',
                latestVersion: '0.1.1',
                clientVersion: '0.1.1',
                platform: 'electron',
            }),
        } as Response);

        const { enforceDesktopVersionGate } = await import('./desktopVersionGate');
        await expect(enforceDesktopVersionGate()).resolves.toBe(true);
    });

    it('bloqueia quando servidor nega versão', async () => {
        vi.stubEnv('PROD', 'true');
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                allowed: false,
                minVersion: '0.2.0',
                latestVersion: '0.2.0',
                clientVersion: '0.1.1',
                platform: 'electron',
                message: 'Versão 0.1.1 não é mais suportada.',
            }),
        } as Response);

        const { enforceDesktopVersionGate } = await import('./desktopVersionGate');
        await expect(enforceDesktopVersionGate()).resolves.toBe(false);
        expect(domState.toasts.length).toBeGreaterThan(0);
    });

    it('em produção bloqueia quando fetch falha', async () => {
        vi.stubEnv('PROD', 'true');
        vi.mocked(fetch).mockRejectedValue(new Error('network'));

        const { enforceDesktopVersionGate } = await import('./desktopVersionGate');
        await expect(enforceDesktopVersionGate()).resolves.toBe(false);
    });

    it('em dev permite quando fetch falha', async () => {
        vi.stubEnv('PROD', '');
        vi.stubEnv('DEV', 'true');
        vi.mocked(fetch).mockRejectedValue(new Error('network'));

        const { enforceDesktopVersionGate } = await import('./desktopVersionGate');
        await expect(enforceDesktopVersionGate()).resolves.toBe(true);
    });
});
