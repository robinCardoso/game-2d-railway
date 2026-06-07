const HTML_PAGE_RE = /^[a-z0-9_-]+\.html(\?[^\s#]*)?$/i;

/** Página + query relativos — compatível com Electron (`file://`) e HTTP. */
export function getCurrentPageReturnPath(): string {
    try {
        const url = new URL(location.href);
        const fileName = url.pathname.split(/[/\\]/).pop() ?? '';
        if (!fileName.endsWith('.html')) {
            return url.search ? `index.html${url.search}` : 'index.html';
        }
        return url.search ? `${fileName}${url.search}` : fileName;
    } catch {
        return 'index.html';
    }
}

/**
 * Resolve destino pós-login a partir de `?next=`.
 * Rejeita URLs absolutas e paths de filesystem (redirect Electron quebrado).
 */
export function resolveAuthNextRedirect(
    nextParam: string | null,
    fallback = 'characters.html'
): string {
    if (!nextParam) return fallback;

    let decoded = nextParam;
    try {
        decoded = decodeURIComponent(nextParam);
    } catch {
        return fallback;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//')) {
        return fallback;
    }
    if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith('/C:') || decoded.startsWith('/c:')) {
        return fallback;
    }

    if (HTML_PAGE_RE.test(decoded)) return decoded;

    if (decoded.startsWith('/')) {
        const trimmed = decoded.replace(/^\/+/, '');
        if (HTML_PAGE_RE.test(trimmed)) return trimmed;
    }

    return fallback;
}
