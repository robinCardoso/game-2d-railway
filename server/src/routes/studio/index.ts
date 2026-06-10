import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireStudioGuard } from '../../middleware/studioGuard.js';
import { studioService } from '../../studio/studioService.js';
import { MAX_MAP_SAVE_BYTES } from '../../studio/helpers.js';

function sendResult(res: Response, result: { status: number; body: unknown }): void {
    res.status(result.status).json(result.body);
}

function wrap(
    handler: (req: Request) => { status: number; body: unknown }
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        try {
            sendResult(res, handler(req));
        } catch (err) {
            next(err);
        }
    };
}

export function createStudioRouter(): Router {
    const router = Router();

    // Rotas de leitura públicas (necessárias para o boot do game client)
    router.get('/list-maps', wrap(() => studioService.listMaps()));
    router.get('/list-auto-border-sets', wrap(() => studioService.listAutoBorderSets()));
    router.get('/list-tile-properties', wrap(() => studioService.listTileProperties()));

    // Rotas privadas (requer autenticação de GM)
    router.use(requireStudioGuard);

    router.get(
        '/sprite-usage',
        wrap((req) => studioService.getSpriteUsage(req.query.filename))
    );

    router.delete(
        '/delete-map-sprite',
        wrap((req) =>
            studioService.deleteMapSprite(
                req.query.filename,
                req.query.category,
                req.query.force === 'true'
            )
        )
    );

    router.delete(
        '/delete-character',
        wrap((req) =>
            studioService.deleteCharacter(String(req.query.relativePath ?? ''), req.query.force === 'true')
        )
    );

    router.get('/list-characters', wrap(() => studioService.listCharacters()));
    router.get('/list-map-sprites', wrap(() => studioService.listMapSprites()));

    router.get(
        '/border-set-usage',
        wrap((req) => studioService.borderSetUsage(req.query.setId))
    );

    router.delete(
        '/delete-border-set',
        wrap((req) =>
            studioService.deleteBorderSet(req.query.setId, req.query.force === 'true')
        )
    );

    router.post('/save-border-set', wrap((req) => studioService.saveBorderSet(req.body ?? {})));

    router.post('/save-map-sprite', wrap((req) => studioService.saveMapSprite(req.body ?? {})));

    router.post('/save-map-sprites-batch', wrap((req) => studioService.saveMapSpritesBatch(req.body ?? {})));

    router.post('/save-map', (req, res, next) => {
        try {
            const raw = JSON.stringify(req.body ?? {});
            const size = Buffer.byteLength(raw, 'utf8');
            if (size > MAX_MAP_SAVE_BYTES) {
                res.status(413).json({ error: 'JSON do mapa excede o limite de 20MB.' });
                return;
            }
            sendResult(res, studioService.saveMap(req.body ?? {}, size));
        } catch (err) {
            next(err);
        }
    });

    router.post('/save-tile-catalog', wrap((req) => studioService.saveTileCatalog(req.body ?? {})));

    router.post('/save-character', wrap((req) => studioService.saveCharacter(req.body ?? {})));

    router.post('/upsert-creature-preset', wrap((req) => studioService.upsertCreaturePreset(req.body ?? {})));

    router.post('/upsert-outfit-preset', wrap((req) => studioService.upsertOutfitPreset(req.body ?? {})));

    router.get('/get-vocations', wrap(() => studioService.getVocations()));
    router.post('/save-vocations', wrap((req) => studioService.saveVocations(req.body ?? {})));

    router.get('/get-creature-presets', wrap(() => studioService.getCreaturePresets()));
    router.post('/save-creature-presets', wrap((req) => studioService.saveCreaturePresets(req.body ?? {})));

    router.get('/get-item-catalog', wrap(() => studioService.getItemCatalog()));
    router.post('/save-item-catalog', wrap((req) => studioService.saveItemCatalog(req.body ?? {})));
    router.post('/save-item-icon', wrap((req) => studioService.saveItemIcon(req.body ?? {})));

    router.get('/get-spell-catalog', wrap(() => studioService.getSpellCatalog()));
    router.post('/save-spell-catalog', wrap((req) => studioService.saveSpellCatalog(req.body ?? {})));
    router.post('/save-spell-icon', wrap((req) => studioService.saveSpellIcon(req.body ?? {})));

    return router;
}
