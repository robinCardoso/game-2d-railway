import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { createApp } from './app.js';
import { GameRoom } from './GameRoom.js';
import { MapCollisionStore } from './MapCollisionStore.js';
import { MapInstanceStore } from './MapInstanceStore.js';
import { CreaturePresetStore } from './game/CreaturePresetStore.js';
import { SpellCatalogStore } from './game/SpellCatalogStore.js';
import { VocationStore } from './game/VocationStore.js';
import { runMigrations } from './db/migrate.js';
import { env } from './config/env.js';
import { getServerGameRates } from './config/gameRates.js';
import { initServerMapRegistry } from './mapRegistry.js';

await runMigrations();

const mapEntries = initServerMapRegistry();
console.log(`[game-2d-server] Mapas registrados: ${mapEntries.map((m) => m.id).join(', ')}`);
console.log(`[game-2d-server] GAME_RATE_EXP = ${getServerGameRates().rateExp}`);

if (env.isProduction && !env.requireWsTicket) {
    console.warn(
        '[game-2d-server] AVISO: produção sem REQUIRE_WS_TICKET — join WS e XP do cliente inseguros.'
    );
}
if (env.isProduction && env.jwtSecret.includes('change-in-production')) {
    console.warn('[game-2d-server] AVISO: JWT_SECRET padrão de dev em produção.');
}

const collision = new MapCollisionStore();
const instances = new MapInstanceStore();
const creaturePresets = new CreaturePresetStore();
const spellCatalog = new SpellCatalogStore();
const vocations = new VocationStore();

await Promise.all([collision.loadAll(), creaturePresets.load(), spellCatalog.load(), vocations.load()]);

const room = new GameRoom(collision, instances, {
    requireWsTicket: env.requireWsTicket,
    positionSaveIntervalMs: env.wsPositionSaveIntervalMs,
    creaturePresets,
    spellCatalog,
    vocations,
});

const app = createApp(() => room.getStats().online, collision);
const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket: WebSocket) => {
    socket.on('message', (data) => {
        try {
            const raw = JSON.parse(data.toString());
            room.handleMessage(socket, raw);
        } catch {
            socket.send(
                JSON.stringify({
                    type: 'error',
                    v: 1,
                    code: 'PARSE_ERROR',
                    message: 'JSON inválido.',
                })
            );
        }
    });

    socket.on('close', () => room.handleDisconnect(socket));
    socket.on('error', () => room.handleDisconnect(socket));
});

httpServer.listen(env.port, env.host, () => {
    console.log(`[game-2d-server] HTTP  http://${env.host}:${env.port}`);
    console.log(`[game-2d-server] WS    ws://${env.host}:${env.port}`);
    if (env.dataRoot) {
        console.log(`[game-2d-server] DATA  ${env.dataRoot}`);
    }
});
