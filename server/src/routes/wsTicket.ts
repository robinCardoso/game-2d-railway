import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { createEnterTicket } from '../enterTicket.js';
import { appearanceFromCharacterRow } from '../api/playerAppearance.js';
import { env } from '../config/env.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { getCharacterForAccount } from '../db/repositories/characters.repo.js';
import type { MapCollisionStore } from '../MapCollisionStore.js';

const bodySchema = z.object({
    characterId: z.string().uuid(),
});

export function createWsTicketRouter(collision: MapCollisionStore): Router {
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

            const resolved = collision.resolveJoinPosition(
                character.map_id,
                character.position_x,
                character.position_y,
                character.position_z
            );

            const ticket = createEnterTicket({
                characterId: character.id,
                accountId: character.account_id,
                name: character.name,
                mapId: character.map_id,
                tileX: resolved.tileX,
                tileY: resolved.tileY,
                z: resolved.z,
                direction: character.direction,
                appearance: appearanceFromCharacterRow(character),
                level: character.level ?? 1,
                experience: Math.max(0, Math.floor(Number(character.experience) || 0)),
                health: character.health,
            });

            res.json({ ticket, expiresAt: Date.now() + env.wsTicketTtlMs });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
