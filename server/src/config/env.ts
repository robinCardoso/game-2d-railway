import { DEFAULT_WS_PORT } from '../../../shared/protocol.js';

export const env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? DEFAULT_WS_PORT),
    host:
        process.env.HOST ??
        (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    dataRoot: process.env.DATA_ROOT?.trim() || null,
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
    databaseSsl: process.env.DATABASE_SSL === 'true',
    jwtSecret: process.env.JWT_SECRET ?? 'game2d-dev-jwt-secret-change-in-production',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
    enterTicketSecret:
        process.env.ENTER_TICKET_SECRET ?? 'game2d-dev-enter-secret-change-in-prod',
    wsTicketTtlMs: Number(process.env.WS_TICKET_TTL_MS ?? 300_000),
    wsPositionSaveIntervalMs: Number(process.env.WS_POSITION_SAVE_INTERVAL_MS ?? 20_000),
    /** Produção com DB: join WS exige ticket assinado pelo backend. */
    requireWsTicket:
        process.env.REQUIRE_WS_TICKET === 'true' ||
        (process.env.NODE_ENV === 'production' &&
            process.env.REQUIRE_WS_TICKET !== 'false' &&
            Boolean(process.env.DATABASE_URL?.trim())),
    studioMockGm: process.env.STUDIO_MOCK_GM === 'true',
    clientOrigin: process.env.CLIENT_ORIGIN?.trim() || null,
    isProduction: process.env.NODE_ENV === 'production',
} as const;
