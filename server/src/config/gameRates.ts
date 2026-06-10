import {
    DEFAULT_GAME_RATES,
    sanitizeRateExp,
    type GameRatesConfig,
} from '../../../shared/gameRates.js';
import { env } from './env.js';

export function loadServerGameRates(): GameRatesConfig {
    return {
        rateExp: sanitizeRateExp(env.rateExp ?? DEFAULT_GAME_RATES.rateExp),
    };
}

let activeRates = loadServerGameRates();

/** Rate ativa do processo (reinicie o servidor após mudar GAME_RATE_EXP). */
export function getServerGameRates(): GameRatesConfig {
    return activeRates;
}

/** Testes podem trocar a rate sem env. */
export function setServerGameRatesForTests(rates: GameRatesConfig): void {
    activeRates = rates;
}

export function resetServerGameRatesForTests(): void {
    activeRates = loadServerGameRates();
}
