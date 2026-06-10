import type { Request, Response } from 'express';
import { getServerGameRates } from '../config/gameRates.js';

export function gameRatesHandler(_req: Request, res: Response): void {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(getServerGameRates());
}
