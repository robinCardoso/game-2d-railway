/** Handlers de Page Visibility API — aba em foco vs background no Play. */
export function setupPageVisibilityHandlers(options: {
    onHidden?: () => void;
    onVisible?: () => void;
}): () => void {
    const handler = (): void => {
        if (document.visibilityState === 'hidden') {
            options.onHidden?.();
            return;
        }
        options.onVisible?.();
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
}
