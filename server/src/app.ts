import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { paths } from './config/paths.js';
import { countItemCatalogEntries } from './config/catalogVolumeSync.js';
import { env } from './config/env.js';
import { healthHandler } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createCharactersRouter } from './routes/characters.js';
import { createCharacterInventoryRouter } from './routes/characterInventory.js';
import { createCharacterSpellSlotsRouter } from './routes/characterSpellSlots.js';
import { createCharacterSpellsRouter } from './routes/characterSpells.js';
import { createWsTicketRouter } from './routes/wsTicket.js';
import { createStudioRouter } from './routes/studio/index.js';
import { desktopVersionHandler } from './routes/desktopVersion.js';
import { gameRatesHandler } from './routes/gameRates.js';
import { studioService } from './studio/studioService.js';
import { isDatabaseConfigured } from './db/pool.js';
import type { MapCollisionStore } from './MapCollisionStore.js';

const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.json': 'application/json',
};

/** Origens padrão do WebView Capacitor (androidScheme https → https://localhost). */
const CAPACITOR_WEBVIEW_ORIGINS = [
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
] as const;

function resolveExistingFile(filePath: string): string | null {
    const abs = path.resolve(filePath);
    try {
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    } catch {
        /* ignore */
    }
    return null;
}

function serveJsonFile(route: string, filePath: string, app: Express, fallbackPath?: string): void {
    app.get(route, (_req, res, next) => {
        const abs = resolveExistingFile(filePath);
        if (!abs) {
            next();
            return;
        }
        try {
            let content = fs.readFileSync(abs, 'utf8');
            if (
                fallbackPath &&
                route === '/item_catalog.json' &&
                countItemCatalogEntries(JSON.parse(content)) === 0
            ) {
                const fallbackAbs = resolveExistingFile(fallbackPath);
                if (fallbackAbs) {
                    content = fs.readFileSync(fallbackAbs, 'utf8');
                }
            }
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.send(content);
        } catch (err) {
            next(err);
        }
    });
}

function buildAllowedCorsOrigins(): Set<string> {
    const origins = new Set<string>();
    if (env.clientOrigin) origins.add(env.clientOrigin);
    for (const extra of env.clientExtraOrigins) origins.add(extra);
    for (const cap of CAPACITOR_WEBVIEW_ORIGINS) origins.add(cap);
    return origins;
}

export function createApp(getOnline: (() => number) | undefined, collision: MapCollisionStore): Express {
    const app = express();

    const allowedCorsOrigins = buildAllowedCorsOrigins();
    if (allowedCorsOrigins.size > 0) {
        app.use((req, res, next) => {
            const requestOrigin = req.headers.origin;
            if (requestOrigin && allowedCorsOrigins.has(requestOrigin)) {
                res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                res.setHeader('Vary', 'Origin');
            } else if (!requestOrigin && env.clientOrigin) {
                res.setHeader('Access-Control-Allow-Origin', env.clientOrigin);
            }
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
            if (req.method === 'OPTIONS') {
                res.sendStatus(204);
                return;
            }
            next();
        });
    }

    app.use(express.json({ limit: '25mb' }));

    app.get('/health', (req, res) => {
        if (getOnline) {
            res.json({
                service: 'game-2d-server',
                status: 'ok',
                online: getOnline(),
                phase: 'railway-d',
                database: isDatabaseConfigured(),
                requireWsTicket: env.requireWsTicket,
            });
            return;
        }
        healthHandler(req, res);
    });

    app.use('/api/auth', createAuthRouter());
    app.use(
        '/api/characters/:characterId/inventory',
        createCharacterInventoryRouter()
    );
    app.use(
        '/api/characters/:characterId/spell-slots',
        createCharacterSpellSlotsRouter()
    );
    app.use(
        '/api/characters/:characterId/spells',
        createCharacterSpellsRouter()
    );
    app.use('/api/characters', createCharactersRouter((mapId) => collision.getMapSpawn(mapId)));
    app.use('/api/ws-ticket', createWsTicketRouter(collision));
    app.get('/api/desktop/version', desktopVersionHandler);
    app.get('/api/game-rates', gameRatesHandler);
    studioService.setCollisionStore(collision);
    app.use('/api', createStudioRouter({ writesEnabled: env.studioEnabled }));

    if (env.studioEnabled) {
        app.get('/stucio.html', (_req, res) => {
            res.redirect(302, '/studio.html');
        });
    } else {
        app.get(['/studio.html', '/stucio.html'], (_req, res) => {
            res.redirect(302, '/');
        });
    }

    // /tiles com proteção path traversal
    app.use('/tiles', (req: Request, res: Response, next: NextFunction) => {
        if (req.url && /[?&](import|url)\b/.test(req.url)) {
            next();
            return;
        }
        const safePath = req.url ? decodeURIComponent(req.url.split('?')[0]) : '/';
        const filePath = path.join(paths.tilesDir, safePath);
        const tilesRoot = path.normalize(paths.tilesDir + path.sep);
        if (!filePath.startsWith(tilesRoot) && filePath !== paths.tilesDir) {
            res.status(403).send('Forbidden');
            return;
        }
        const absTile = resolveExistingFile(filePath);
        if (absTile) {
            const ext = path.extname(absTile).toLowerCase();
            res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(absTile);
            return;
        }
        // Volume DATA_ROOT pode não ter subpastas read-only novas (ex. effects/combat/)
        if (env.dataRoot) {
            const repoFilePath = path.join(paths.repoTilesDir, safePath);
            const repoRoot = path.normalize(paths.repoTilesDir + path.sep);
            if (repoFilePath.startsWith(repoRoot) || repoFilePath === paths.repoTilesDir) {
                const absRepoTile = resolveExistingFile(repoFilePath);
                if (absRepoTile) {
                    const ext = path.extname(absRepoTile).toLowerCase();
                    res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.sendFile(absRepoTile);
                    return;
                }
            }
        }
        next();
    });

    // Dados mutáveis do volume sob /maps quando DATA_ROOT (dist pode ter cópia antiga)
    if (env.dataRoot && fs.existsSync(paths.mapsDir)) {
        app.use('/maps', express.static(paths.mapsDir, { index: false }));
    }

    // Presets/catálogos do volume
    if (env.dataRoot) {
        serveJsonFile('/tile_catalog.json', paths.tileCatalogPath, app);
        serveJsonFile('/auto_border_sets.json', paths.autoBorderSetsPath, app);
        serveJsonFile('/creature_presets.json', paths.creaturePresetsPath, app);
        serveJsonFile('/spell_catalog.json', paths.spellCatalogPath, app);
        serveJsonFile('/outfit_presets.json', paths.outfitPresetsPath, app);
        serveJsonFile(
            '/item_catalog.json',
            paths.itemCatalogPath,
            app,
            path.join(paths.repoPublicDir, 'item_catalog.json')
        );
        serveJsonFile('/tile_variant_groups.json', paths.tileVariantGroupsPath, app);
        serveJsonFile('/vocations.json', paths.vocationsJsonPath, app);
    }

    serveJsonFile('/vocations.json', paths.vocationsJsonPath, app);

    if (fs.existsSync(paths.distDir)) {
        app.use(express.static(paths.distDir, { index: 'index.html' }));
    } else if (env.isProduction) {
        console.warn(`[app] dist/ não encontrado em ${paths.distDir}. Rode npm run build.`);
    }

    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[app] Erro:', err);
        res.status(500).json({ error: message });
    });

    return app;
}
