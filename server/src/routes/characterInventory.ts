import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import {
    getCharacterInventoryOrEmpty,
    replaceCharacterInventory,
    emptyInventoryDocument,
} from '../db/repositories/inventory.repo.js';
import { getCharacterForAccount } from '../db/repositories/characters.repo.js';
import { loadServerItemCatalog } from '../game/itemCatalogStore.js';
import { validateCharacterInventory } from '../../../shared/inventory.js';

type CharacterInventoryParams = {
    characterId: string;
};

export function createCharacterInventoryRouter(): Router {
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
            const { characterId } = req.params as CharacterInventoryParams;
            const row = await getCharacterForAccount(characterId, authReq.auth!.sub);
            if (!row) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }

            const inventory =
                (await getCharacterInventoryOrEmpty(characterId, authReq.auth!.sub)) ??
                emptyInventoryDocument();

            res.json({ inventory });
        } catch (err) {
            next(err);
        }
    });

    router.put('/', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const { characterId } = req.params as CharacterInventoryParams;
            const catalog = loadServerItemCatalog();
            const parsed = validateCharacterInventory(req.body, catalog);
            if (!parsed.ok) {
                res.status(400).json({ error: 'Inventário inválido.', details: parsed.errors });
                return;
            }

            const saved = await replaceCharacterInventory(
                characterId,
                authReq.auth!.sub,
                parsed.value
            );
            if (!saved) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }

            res.json({ inventory: saved });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
