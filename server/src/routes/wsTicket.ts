import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { createEnterTicket } from '../enterTicket.js';
import { appearanceFromCharacterRow } from '../api/playerAppearance.js';
import { env } from '../config/env.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { getCharacterForAccount } from '../db/repositories/characters.repo.js';

const bodySchema = z.object({
    characterId: z.string().uuid(),
});

export function createWsTicketRouter(): Router {
    const router = Router();

    router.use((_req, res, next) => {
        if (!isDatabaseConfigured()) {
            res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL).' });
            return;
        }
        next();
    });
    router.use(requireAuth);

    router.post('/', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const parsed = bodySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: 'characterId inválido.' });
                return;
            }

            const character = await getCharacterForAccount(
                parsed.data.characterId,
                authReq.auth!.sub
            );
            if (!character) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }

            const ticket = createEnterTicket({
                characterId: character.id,
                accountId: character.account_id,
                name: character.name,
                mapId: character.map_id,
                tileX: character.position_x,
                tileY: character.position_y,
                z: character.position_z,
                direction: character.direction,
                appearance: appearanceFromCharacterRow(character),
            });

            res.json({ ticket, expiresAt: Date.now() + env.wsTicketTtlMs });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
