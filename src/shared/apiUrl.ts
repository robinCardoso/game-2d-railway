/** Prefixa caminhos `/api/*` com `VITE_API_BASE_URL` em Electron/Capacitor. */
export function resolveApiUrl(path: string): string {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
    if (apiBaseUrl && path.startsWith('/')) {
        const base = apiBaseUrl.replace(/\/$/, '');
        return `${base}${path}`;
    }
    return path;
}
