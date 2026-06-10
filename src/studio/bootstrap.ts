import { requireStudioAccess } from '../shared/authGuard';
import { configureStudioBoot } from './studioBoot';

configureStudioBoot({
    blankMap: true,
    skipCharacterPreset: true,
    skipGameNet: true,
    hidePlayerSprite: true,
    editorOnly: true,
});

const enforceStudioGuard =
    import.meta.env.PROD || import.meta.env.VITE_STUDIO_GUARD === 'true';

if (enforceStudioGuard) {
    try {
        await requireStudioAccess();
    } catch {
        // redirect em andamento
    }
}

await import('../main.ts');
