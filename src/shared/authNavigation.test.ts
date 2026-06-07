import { describe, expect, it } from 'vitest';
import { resolveAuthNextRedirect } from './authNavigation';

describe('resolveAuthNextRedirect', () => {
    it('aceita página relativa com query', () => {
        expect(resolveAuthNextRedirect('play.html?characterId=abc')).toBe(
            'play.html?characterId=abc'
        );
    });

    it('normaliza path HTTP legado /play.html', () => {
        expect(resolveAuthNextRedirect('/play.html')).toBe('play.html');
    });

    it('rejeita path de filesystem Windows', () => {
        expect(resolveAuthNextRedirect('/C:/Users/app/dist/play.html')).toBe('characters.html');
        expect(resolveAuthNextRedirect('C:\\Users\\app\\dist\\play.html')).toBe('characters.html');
    });

    it('rejeita URL absoluta', () => {
        expect(resolveAuthNextRedirect('https://evil.com/play.html')).toBe('characters.html');
    });

    it('usa fallback quando next é null', () => {
        expect(resolveAuthNextRedirect(null)).toBe('characters.html');
        expect(resolveAuthNextRedirect(null, 'index.html')).toBe('index.html');
    });
});
