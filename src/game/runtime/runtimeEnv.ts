/**
 * Configuração de runtime do cliente — URLs e metadados por plataforma.
 *
 * Variáveis VITE_* são injetadas no build e viram strings estáticas.
 * Nunca colocar segredos em variáveis VITE_.
 */

import { detectRuntimePlatform, type RuntimePlatform } from './platform';

export interface ClientRuntimeConfig {
    /** URL base HTTP da API (ex.: https://api.seujogo.com) */
    apiBaseUrl: string;
    /** URL base WebSocket (ex.: wss://api.seujogo.com) */
    wsBaseUrl: string;
    platform: RuntimePlatform;
    buildVersion: string;
}

export function getClientRuntimeConfig(): ClientRuntimeConfig {
    const platform = detectRuntimePlatform();

    // Electron e Capacitor podem usar URLs absolutas se configuradas no build
    const apiBaseUrl =
        (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
    const wsBaseUrl =
        (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? '';
    const buildVersion =
        (import.meta.env.VITE_BUILD_VERSION as string | undefined) ?? 'dev';

    return { apiBaseUrl, wsBaseUrl, platform, buildVersion };
}
