import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { paths } from './config/paths.js';
import { env } from './config/env.js';
import { healthHandler } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createCharactersRouter } from './routes/characters.js';
import { createWsTicketRouter } from './routes/wsTicket.js';
import { createStudioRouter } from './routes/studio/index.js';
import { isDatabaseConfigured } from './db/pool.js';

const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.json': 'application/json',
};

export function createApp(getOnline?: () => number): Express {
    const app = express();

    if (env.clientOrigin) {
        app.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', env.clientOrigin!);
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
    app.use('/api/characters', createCharactersRouter());
    app.use('/api/ws-ticket', createWsTicketRouter());
    app.use('/api', createStudioRouter());

    app.get('/stucio.html', (_req, res) => {
        res.redirect(302, '/studio.html');
    });

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
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(filePath);
            return;
        }
        next();
    });

    // Dados mutáveis do volume sob /maps quando DATA_ROOT (dist pode ter cópia antiga)
    if (env.dataRoot && fs.existsSync(paths.mapsDir)) {
        app.use('/maps', express.static(paths.mapsDir, { index: false }));
    }

    // Presets/catálogos do volume
    if (env.dataRoot) {
        const serveDataFile = (route: string, filePath: string) => {
            app.get(route, (_req, res, next) => {
                if (fs.existsSync(filePath)) {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.sendFile(filePath);
                    return;
                }
                next();
            });
        };
        serveDataFile('/tile_catalog.json', paths.tileCatalogPath);
        serveDataFile('/auto_border_sets.json', paths.autoBorderSetsPath);
        serveDataFile('/creature_presets.json', paths.creaturePresetsPath);
        serveDataFile('/outfit_presets.json', paths.outfitPresetsPath);
        serveDataFile('/tile_variant_groups.json', paths.tileVariantGroupsPath);
    }

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
