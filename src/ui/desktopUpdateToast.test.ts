import { describe, expect, it } from 'vitest';
import { buildDownloadedToastHtml } from './desktopUpdateToast';

describe('buildDownloadedToastHtml', () => {
    it('no play não oferece botão Reiniciar Agora', () => {
        const html = buildDownloadedToastHtml('0.1.2', true);
        expect(html).toContain('saia do jogo para instalar');
        expect(html).not.toContain('Reiniciar Agora');
        expect(html).not.toContain('update-install-btn');
        expect(html).toContain('update-close-btn');
    });

    it('fora do play oferece Reiniciar Agora', () => {
        const html = buildDownloadedToastHtml('0.1.2', false);
        expect(html).toContain('Reiniciar Agora');
        expect(html).toContain('update-install-btn');
        expect(html).toContain('update-close-btn');
    });
});
