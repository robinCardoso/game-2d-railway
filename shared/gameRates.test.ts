import { describe, expect, it } from 'vitest';
import {
    applyExpRate,
    formatExpRateLabel,
    sanitizeGameRatesDocument,
    sanitizeRateExp,
} from './gameRates.js';

describe('gameRates', () => {
    it('sanitizeRateExp usa default e limites', () => {
        expect(sanitizeRateExp(undefined)).toBe(1);
        expect(sanitizeRateExp('2')).toBe(2);
        expect(sanitizeRateExp(0)).toBe(0.1);
        expect(sanitizeRateExp(999)).toBe(100);
    });

    it('applyExpRate aplica floor no total', () => {
        expect(applyExpRate(250, 1)).toBe(250);
        expect(applyExpRate(250, 2)).toBe(500);
        expect(applyExpRate(25, 1.5)).toBe(37);
        expect(applyExpRate(0, 10)).toBe(0);
    });

    it('sanitizeGameRatesDocument lê JSON', () => {
        expect(sanitizeGameRatesDocument({ rateExp: 2 }).rateExp).toBe(2);
        expect(sanitizeGameRatesDocument(null).rateExp).toBe(1);
    });

    it('formatExpRateLabel omite rate 1', () => {
        expect(formatExpRateLabel(1)).toBe('');
        expect(formatExpRateLabel(2)).toBe('EXP ×2');
    });
});
