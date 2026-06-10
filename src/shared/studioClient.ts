/** Studio disponível no cliente (dev local por padrão; produção exige flag explícita). */
export function isStudioClientEnabled(): boolean {
    if (import.meta.env.VITE_STUDIO_ENABLED === 'true') return true;
    if (import.meta.env.VITE_STUDIO_ENABLED === 'false') return false;
    return import.meta.env.DEV;
}
