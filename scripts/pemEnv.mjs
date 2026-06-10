/** Decodifica PEM de variável de ambiente (texto, base64 ou `\n` literal). */
export function decodePemFromEnv(raw) {
    if (!raw?.trim()) return null;
    let pem = raw.trim();
    if (!pem.includes('BEGIN')) {
        pem = Buffer.from(pem, 'base64').toString('utf8');
    }
    return pem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}
