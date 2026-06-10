import { requireAuth, signOut } from '../shared/authGuard';
import { getCharacter } from '../shared/characterStore';
import { track } from '../shared/analytics';
import { enforceDesktopVersionGate, initDesktopClientShell } from '../ui/initDesktopClient';
import { resumeWorldEntryOverlayIfPending } from '../world-entry/worldEntryOverlay';
import { initPlayMobileHud } from './playMobileHud';
import { initPlayHudActionBar } from './ui/playHudActionBar';
import { initPlayHudMinimap } from './ui/playHudMinimap';
import { initPlayHudCharacterCard } from './ui/playHudCharacterCard';
import { initPlayHudPanels } from './ui/playHudPanels';
import { initPlayHudSettings } from './ui/playHudSettings';
import { initPlayCombatHub } from './ui/playCombatHub';
import { initPlaySpellModal } from './ui/playSpellModal';
import { initPlayChatController } from './chat/playChatController';
import { initPlayPerformanceMonitor } from './debug/playPerformanceMonitor';
import { startPlay, stopLocationAutosave } from './playApp';

resumeWorldEntryOverlayIfPending();
initPlayHudPanels();
initPlayHudSettings();
initPlayHudCharacterCard();
initPlayHudActionBar();
initPlayChatController();
initPlayHudMinimap();
initPlayCombatHub();
initPlaySpellModal();
initPlayPerformanceMonitor();
initPlayMobileHud();

initDesktopClientShell();

// Listeners cedo — evita navegação pelo href antes do save (durante carregamento do mapa).
async function goToCharacterSelect(e: Event): Promise<void> {
    e.preventDefault();
    await stopLocationAutosave();
    location.href = 'characters.html';
}

document.getElementById('changeCharLink')?.addEventListener('click', (e) => void goToCharacterSelect(e));
document.getElementById('changeCharLinkMobile')?.addEventListener('click', (e) => void goToCharacterSelect(e));

async function logoutFromPlay(e: Event): Promise<void> {
    e.preventDefault();
    await stopLocationAutosave();
    await signOut();
    location.href = 'login.html';
}

document.getElementById('logoutPlay')?.addEventListener('click', (e) => void logoutFromPlay(e));
document.getElementById('logoutPlayMobile')?.addEventListener('click', (e) => void logoutFromPlay(e));

const params = new URLSearchParams(location.search);
const characterId = params.get('characterId');
const overrideMapId = params.get('mapId') ?? undefined;

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
                await startPlay(character, session.userId, { overrideMapId });
            }
        }
    } catch {
        /* redirect em requireAuth */
    }
}
