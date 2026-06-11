import {
    DEFAULT_GAME_RATES,
    sanitizeGameRatesDocument,
    sanitizeRateExp,
    type GameRatesConfig,
} from '../../shared/gameRates';
import { resolveApiUrl } from '../shared/apiUrl';
import { assetLoader } from './assetLoader';

let cachedRates: GameRatesConfig | null = null;
let serverAuthoritativeRate: number | null = null;

/** Servidor MP envia rate no welcome — sobrescreve JSON local. */
export function setPlayExpRateFromServer(rateExp: number | undefined): void {
    if (rateExp === undefined) return;
    serverAuthoritativeRate = sanitizeRateExp(rateExp);
}

export function getPlayExpRate(): number {
    if (serverAuthoritativeRate !== null) {
        return serverAuthoritativeRate;
    }
    return cachedRates?.rateExp ?? DEFAULT_GAME_RATES.rateExp;
}

export async function loadClientGameRates(): Promise<GameRatesConfig> {
    if (cachedRates && serverAuthoritativeRate === null) {
        return cachedRates;
    }

    try {
        if (assetLoader.isPackaged()) {
            const raw = await assetLoader.getJson<any>('game_rates.json');
            if (raw) {
                cachedRates = sanitizeGameRatesDocument(raw);
                return cachedRates;
            }
        } else {
            const res = await fetch(resolveApiUrl('/game_rates.json'), { cache: 'no-cache' });
            if (res.ok) {
                cachedRates = sanitizeGameRatesDocument(await res.json());
                return cachedRates;
            }
        }
    } catch {
        /* offline / dev */
    }

    const viteRate = import.meta.env.VITE_GAME_RATE_EXP;
    cachedRates = {
        rateExp: sanitizeRateExp(viteRate ?? DEFAULT_GAME_RATES.rateExp),
    };
    return cachedRates;
}

export function resetPlayExpRateState(): void {
    cachedRates = null;
    serverAuthoritativeRate = null;
}
