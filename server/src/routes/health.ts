import type { Request, Response } from 'express';

export function healthHandler(_req: Request, res: Response): void {
    res.json({
        service: 'game-2d-server',
        status: 'ok',
        phase: 'railway-d',
    });
}
