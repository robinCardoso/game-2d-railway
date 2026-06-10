/** Reformat PEM colapsado (uma linha / espaços) para o formato esperado pelo OpenSSL. */
export function normalizePem(pem) {
    const match = pem.match(/-----BEGIN ([^-]+)-----\s*([\s\S]*?)\s*-----END \1-----/);
    if (!match) return pem;
    const label = match[1];
    const body = match[2].replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) ?? [body];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/** Decodifica PEM de variável de ambiente (texto, base64 ou `\n` literal). */
export function decodePemFromEnv(raw) {
    if (!raw?.trim()) return null;
    let pem = raw.trim();
    if (!pem.includes('BEGIN')) {
        try {
            pem = Buffer.from(pem, 'base64').toString('utf8');
        } catch {
            return null;
        }
    }
    pem = pem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    return normalizePem(pem);
}
