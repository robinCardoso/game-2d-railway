/** Hash de senha só para auth mock em dev — não usar em produção. */

function toHex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function randomSalt(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes.buffer);
}

export async function hashMockPassword(password: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: enc.encode(salt),
            iterations: 100_000,
            hash: 'SHA-256',
        },
        keyMaterial,
        256
    );
    return toHex(bits);
}

export function createMockPasswordSalt(): string {
    return randomSalt();
}

export async function verifyMockPassword(
    password: string,
    salt: string,
    expectedHash: string
): Promise<boolean> {
    const hash = await hashMockPassword(password, salt);
    return hash === expectedHash;
}
