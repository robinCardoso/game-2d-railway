import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { syncEligibleLearnedSpells } from '../db/repositories/characterSpells.repo.js';
import { getCharacterForAccount } from '../db/repositories/characters.repo.js';
import { loadServerSpellCatalog } from '../game/serverSpellCatalog.js';

type CharacterSpellsParams = {
    characterId: string;
};

export function createCharacterSpellsRouter(): Router {
    const router = Router({ mergeParams: true });

    router.use((_req, res, next) => {
        if (!isDatabaseConfigured()) {
            res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL).' });
            return;
        }
        next();
    });
    router.use(requireAuth);

    router.get('/', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const { characterId } = req.params as CharacterSpellsParams;
            const row = await getCharacterForAccount(characterId, authReq.auth!.sub);
            if (!row) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }

            const catalog = loadServerSpellCatalog();
            const learnedSpells =
                (await syncEligibleLearnedSpells(
                    characterId,
                    authReq.auth!.sub,
                    row.vocation_id,
                    row.level,
                    catalog
                )) ?? [];

            res.json({ learnedSpells });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
