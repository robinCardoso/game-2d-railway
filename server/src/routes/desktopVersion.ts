import type { Request, Response } from 'express';
import {
    isClientVersionAllowed,
    type DesktopVersionResponse,
} from '../../../shared/desktopVersion.js';
import { env } from '../config/env.js';

export function desktopVersionHandler(req: Request, res: Response): void {
    const clientVersion = String(req.query.clientVersion ?? '0.0.0').trim() || '0.0.0';
    const platform = String(req.query.platform ?? 'unknown').trim() || 'unknown';
    const minVersion = env.desktopMinVersion;
    const latestVersion = env.desktopLatestVersion;
    const allowed = isClientVersionAllowed(clientVersion, minVersion);

    const body: DesktopVersionResponse = {
        minVersion,
        latestVersion,
        clientVersion,
        platform,
        allowed,
    };

    if (!allowed) {
        body.message = `Versão ${clientVersion} não é mais suportada. Atualize para v${minVersion} ou superior.`;
    }

    res.json(body);
}
