/** Multiplicadores globais de jogo (paridade OTC `config.lua` rateExp). */

export interface GameRatesConfig {
    rateExp: number;
}

export const DEFAULT_GAME_RATES: GameRatesConfig = {
    rateExp: 1,
};

export const MIN_RATE_EXP = 0.1;
export const MAX_RATE_EXP = 100;

/** Normaliza rate vinda de env, JSON ou admin. */
export function sanitizeRateExp(value: unknown): number {
    const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    if (!Number.isFinite(n)) return DEFAULT_GAME_RATES.rateExp;
    return Math.min(MAX_RATE_EXP, Math.max(MIN_RATE_EXP, n));
}

/** XP concedido ao matar — sempre inteiro (floor), como Tibia/OTC. */
export function applyExpRate(baseXp: number, rateExp: number): number {
    const base = Math.max(0, Math.floor(baseXp));
    if (base === 0) return 0;
    const rate = sanitizeRateExp(rateExp);
    return Math.max(0, Math.floor(base * rate));
}

export function sanitizeGameRatesDocument(raw: unknown): GameRatesConfig {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_GAME_RATES };
    }
    const row = raw as { rateExp?: unknown };
    return { rateExp: sanitizeRateExp(row.rateExp) };
}

export function formatExpRateLabel(rateExp: number): string {
    const rate = sanitizeRateExp(rateExp);
    if (rate === 1) return '';
    const display = Number.isInteger(rate) ? String(rate) : rate.toFixed(1);
    return `EXP ×${display}`;
}
