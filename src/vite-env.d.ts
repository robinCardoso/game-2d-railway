/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** URL do WebSocket do game server. Em dev, padrão `ws://localhost:8787`. Use `false` para desligar. */
    readonly VITE_GAME_SERVER_WS?: string;
    /** `true` = auth mock localStorage; `false` = API JWT do servidor */
    readonly VITE_AUTH_MOCK?: string;
    /** Em dev, `true` força API JWT (requer DATABASE_URL no servidor) */
    readonly VITE_USE_API_AUTH?: string;
    readonly VITE_STUDIO_GUARD?: string;
    /** Dev only: ticket HMAC local quando /api/ws-ticket desligado */
    readonly VITE_ENTER_TICKET_SECRET?: string;
    /** `true` força ticket via POST /api/ws-ticket em dev */
    readonly VITE_USE_SERVER_WS_TICKET?: string;
    readonly VITE_ANALYTICS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
