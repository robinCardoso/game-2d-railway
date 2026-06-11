import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import {
    getCharacterInventoryOrEmpty,
    getCharacterUnlockedBagSlots,
    replaceCharacterInventory,
    emptyInventoryDocument,
} from '../db/repositories/inventory.repo.js';
import { getCharacterForAccount } from '../db/repositories/characters.repo.js';
import { loadServerItemCatalog } from '../game/itemCatalogStore.js';
import { validateCharacterInventory } from '../../../shared/inventory.js';
import {
    getDevCharacterInventory,
    getDevCharacterUnlockedBagSlots,
    setDevCharacterInventory,
} from '../game/devInventoryStore.js';
import { env } from '../config/env.js';
import type { GameRoom } from '../GameRoom.js';
import type { CharacterInventoryDocument } from '../../../shared/inventory.js';

type CharacterInventoryParams = {
    characterId: string;
};

function notifyOnlineInventorySync(
    getRoom: (() => GameRoom | undefined) | undefined,
    characterId: string,
    inventory: CharacterInventoryDocument
): void {
    getRoom?.()?.syncCharacterInventory(characterId, inventory);
}

export function createCharacterInventoryRouter(
    getRoom?: () => GameRoom | undefined
): Router {
    const router = Router({ mergeParams: true });

    router.use((req, res, next) => {
        if (isDatabaseConfigured()) {
            requireAuth(req, res, next);
            return;
        }
        if (env.nodeEnv === 'production') {
            res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL).' });
            return;
        }
        next();
    });

    router.get('/', async (req, res, next) => {
        try {
            const { characterId } = req.params as CharacterInventoryParams;

            if (!isDatabaseConfigured()) {
                const inventory = getDevCharacterInventory(characterId);
                res.json({ inventory });
                return;
            }

            const authReq = req as AuthenticatedRequest;
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
            const { characterId } = req.params as CharacterInventoryParams;
            const catalog = loadServerItemCatalog();

            if (!isDatabaseConfigured()) {
                const previous = getDevCharacterInventory(characterId);
                const serverUnlockedBagSlots = getDevCharacterUnlockedBagSlots(characterId);
                const parsed = validateCharacterInventory(req.body, catalog, {
                    previous,
                    serverUnlockedBagSlots,
                });
                if (!parsed.ok) {
                    res.status(400).json({ error: 'Inventário inválido.', details: parsed.errors });
                    return;
                }
                const saved = setDevCharacterInventory(characterId, {
                    ...parsed.value,
                    unlockedBagSlots: serverUnlockedBagSlots,
                });
                notifyOnlineInventorySync(getRoom, characterId, saved);
                res.json({ inventory: saved });
                return;
            }

            const authReq = req as AuthenticatedRequest;
            const previous =
                (await getCharacterInventoryOrEmpty(characterId, authReq.auth!.sub)) ??
                emptyInventoryDocument();
            const serverUnlockedBagSlots =
                (await getCharacterUnlockedBagSlots(characterId, authReq.auth!.sub)) ??
                previous.unlockedBagSlots;
            const parsed = validateCharacterInventory(req.body, catalog, {
                previous,
                serverUnlockedBagSlots,
            });
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

            notifyOnlineInventorySync(getRoom, characterId, saved);
            res.json({ inventory: saved });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
