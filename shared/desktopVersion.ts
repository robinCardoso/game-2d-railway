/** Compara semver simples `major.minor.patch` (sem pre-release). */
export function compareSemver(a: string, b: string): number {
    const parse = (v: string) =>
        v
            .trim()
            .replace(/^v/i, '')
            .split('.')
            .map((part) => {
                const n = Number.parseInt(part, 10);
                return Number.isFinite(n) ? n : 0;
            });

    const pa = parse(a);
    const pb = parse(b);
    const len = Math.max(pa.length, pb.length, 3);

    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db) return da < db ? -1 : 1;
    }
    return 0;
}

export function isClientVersionAllowed(clientVersion: string, minVersion: string): boolean {
    return compareSemver(clientVersion, minVersion) >= 0;
}

export interface DesktopVersionResponse {
    minVersion: string;
    latestVersion: string;
    clientVersion: string;
    platform: string;
    allowed: boolean;
    message?: string;
}
