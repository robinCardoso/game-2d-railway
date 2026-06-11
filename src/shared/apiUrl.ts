/** Prefixa caminhos `/api/*` com `VITE_API_BASE_URL` em Electron/Capacitor. */
export function resolveApiUrl(path: string): string {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
    if (apiBaseUrl && path.startsWith('/')) {
        const base = apiBaseUrl.replace(/\/$/, '');
        return `${base}${path}`;
    }
    return path;
}

/**
 * URL para assets estáticos em `public/` (imagens de brand, UI, etc.).
 * No Electron (`file://`), caminhos absolutos `/assets/...` quebram — resolve em relação à página.
 */
export function resolvePublicAssetUrl(publicPath: string): string {
    const normalized = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath;
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        return new URL(normalized, window.location.href).href;
    }
    const withSlash = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
    return resolveApiUrl(withSlash);
}
