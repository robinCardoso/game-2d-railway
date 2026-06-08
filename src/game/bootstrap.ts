import { requireAuth, signOut } from '../shared/authGuard';
import { getCharacter } from '../shared/characterStore';
import { track } from '../shared/analytics';
import { enforceDesktopVersionGate, initDesktopClientShell } from '../ui/initDesktopClient';
import { resumeWorldEntryOverlayIfPending } from '../world-entry/worldEntryOverlay';
import { startPlay, stopLocationAutosave } from './playApp';

resumeWorldEntryOverlayIfPending();

initDesktopClientShell();

// Listeners cedo — evita navegação pelo href antes do save (durante carregamento do mapa).
document.getElementById('changeCharLink')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await stopLocationAutosave();
    location.href = 'characters.html';
});

document.getElementById('logoutPlay')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await stopLocationAutosave();
    await signOut();
    location.href = 'login.html';
});

const params = new URLSearchParams(location.search);
const characterId = params.get('characterId');

if (!characterId) {
    location.href = 'characters.html';
} else {
    try {
        const session = await requireAuth();
        const character = await getCharacter(characterId, session.userId);
        if (!character) {
            location.href = 'characters.html';
        } else {
            const versionOk = await enforceDesktopVersionGate();
            if (versionOk) {
                track('first_world_enter', { characterId });
                await startPlay(character, session.userId);
            }
        }
    } catch {
        /* redirect em requireAuth */
    }
}
