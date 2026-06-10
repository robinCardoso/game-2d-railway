import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import {
    getCharacterSpellSlotsOrEmpty,
    replaceCharacterSpellSlots,
} from '../db/repositories/spellSlots.repo.js';
import { syncEligibleLearnedSpells } from '../db/repositories/characterSpells.repo.js';
import { getCharacterForAccount } from '../db/repositories/characters.repo.js';
import { loadServerSpellCatalog } from '../game/serverSpellCatalog.js';
import {
    resolveSpellBarOrDefaults,
    validateCharacterSpellBar,
} from '../../../shared/spellSlots.js';

type CharacterSpellSlotsParams = {
    characterId: string;
};

export function createCharacterSpellSlotsRouter(): Router {
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
            const { characterId } = req.params as CharacterSpellSlotsParams;
            const row = await getCharacterForAccount(characterId, authReq.auth!.sub);
            if (!row) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }

            const stored =
                (await getCharacterSpellSlotsOrEmpty(characterId, authReq.auth!.sub)) ?? {};
            const spellBar = resolveSpellBarOrDefaults(stored, row.vocation_id);

            res.json({ spellBar });
        } catch (err) {
            next(err);
        }
    });

    router.put('/', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const { characterId } = req.params as CharacterSpellSlotsParams;
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
            const parsed = validateCharacterSpellBar(req.body, catalog, {
                vocationId: row.vocation_id,
                level: row.level,
                learnedSpellIds: learnedSpells,
            });
            if (!parsed.ok) {
                res.status(400).json({ error: 'Barra de magias inválida.', details: parsed.errors });
                return;
            }

            const saved = await replaceCharacterSpellSlots(
                characterId,
                authReq.auth!.sub,
                parsed.value
            );
            if (!saved) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }

            res.json({ spellBar: saved });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
