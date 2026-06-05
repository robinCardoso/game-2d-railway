import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth/requireAuth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { characterToApi } from '../api/characterDto.js';
import {
    countCharactersByAccount,
    createCharacter,
    getCharacterForAccount,
    isCharacterNameTaken,
    listCharactersByAccount,
    markCharacterPlayed,
    softDeleteCharacter,
    updateCharacterLocation,
} from '../db/repositories/characters.repo.js';

const MAX_CHARACTERS = 4;

const createSchema = z.object({
    name: z.string().min(3).max(20).regex(/^[a-zA-Z0-9 ]+$/),
    vocationId: z.string().min(1),
    gender: z.enum(['male', 'female']),
    outfitId: z.string().min(1),
    spriteSheetUrl: z.string().min(1),
    spawnMapId: z.string().optional(),
    outfitConfig: z.record(z.string(), z.unknown()).optional(),
});

const locationSchema = z.object({
    mapId: z.string().min(1),
    position: z.object({
        x: z.number().int(),
        y: z.number().int(),
        z: z.number().int(),
    }),
    direction: z.enum(['north', 'south', 'east', 'west']),
});

export function createCharactersRouter(): Router {
    const router = Router();

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
            const rows = await listCharactersByAccount(authReq.auth!.sub);
            res.json({ characters: rows.map(characterToApi) });
        } catch (err) {
            next(err);
        }
    });

    router.get('/:id', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const row = await getCharacterForAccount(req.params.id, authReq.auth!.sub);
            if (!row) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }
            res.json({ character: characterToApi(row) });
        } catch (err) {
            next(err);
        }
    });

    router.post('/', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const parsed = createSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: 'Dados de personagem inválidos.' });
                return;
            }
            const data = parsed.data;
            const accountId = authReq.auth!.sub;

            const count = await countCharactersByAccount(accountId);
            if (count >= MAX_CHARACTERS) {
                res.status(400).json({ error: `Limite de ${MAX_CHARACTERS} personagens por conta.` });
                return;
            }
            if (await isCharacterNameTaken(data.name)) {
                res.status(409).json({ error: 'Este nome já está em uso.' });
                return;
            }

            const spawnMapId = data.spawnMapId ?? 'rookgaard';
            const outfitConfig = {
                ...(data.outfitConfig ?? {}),
                name: data.name.trim(),
                vocation: data.vocationId,
                gender: data.gender,
                level: 1,
                experience: 0,
                spriteSheetUrl: data.spriteSheetUrl,
                appearance: {
                    gender: data.gender,
                    outfitId: data.outfitId,
                    spriteSheetUrl: data.spriteSheetUrl,
                },
                gameId: 'default',
                mapId: spawnMapId,
                position: { x: 100, y: 100, z: 7 },
                direction: 'south',
            };

            const row = await createCharacter({
                accountId,
                name: data.name,
                vocationId: data.vocationId,
                gender: data.gender,
                outfitId: data.outfitId,
                spriteSheetUrl: data.spriteSheetUrl,
                spawnMapId,
                outfitConfig,
                mapId: spawnMapId,
                positionX: 100,
                positionY: 100,
                positionZ: 7,
                direction: 'south',
            });
            res.status(201).json({ character: characterToApi(row) });
        } catch (err) {
            next(err);
        }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const ok = await softDeleteCharacter(req.params.id, authReq.auth!.sub);
            if (!ok) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }
            res.json({ success: true });
        } catch (err) {
            next(err);
        }
    });

    router.patch('/:id/last-played', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const ok = await markCharacterPlayed(req.params.id, authReq.auth!.sub);
            if (!ok) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }
            res.json({ success: true });
        } catch (err) {
            next(err);
        }
    });

    router.patch('/:id/location', async (req, res, next) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const parsed = locationSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: 'Localização inválida.' });
                return;
            }
            const { mapId, position, direction } = parsed.data;
            const row = await updateCharacterLocation(req.params.id, authReq.auth!.sub, {
                mapId,
                positionX: position.x,
                positionY: position.y,
                positionZ: position.z,
                direction,
            });
            if (!row) {
                res.status(404).json({ error: 'Personagem não encontrado.' });
                return;
            }
            res.json({ character: characterToApi(row) });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
