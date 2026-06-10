import { drawCharacterPortraitPreview } from '../../character/characterPortraitPreview';
import type { CharacterRow } from '../../shared/types';

const STORAGE_KEY = 'play.hud.characterCard.expanded';

function getSpriteUrl(character: CharacterRow): string {
    return (
        character.outfitConfig?.spriteSheetUrl ||
        character.appearance?.spriteSheetUrl ||
        `tiles/characters/vocations/${character.gender || 'male'}/${character.vocation || 'knight'}.png`
    );
}

function readExpandedPreference(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === '0') return false;
        if (raw === '1') return true;
    } catch {
        /* ignore */
    }
    return true;
}

function saveExpandedPreference(expanded: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
    } catch {
        /* ignore */
    }
}

function setCardExpanded(card: HTMLElement, expanded: boolean): void {
    card.classList.toggle('is-expanded', expanded);
    card.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    const toggle = card.querySelector<HTMLButtonElement>('.play-hud-character-card__toggle');
    if (toggle) {
        toggle.setAttribute(
            'aria-label',
            expanded ? 'Ocultar status do personagem' : 'Mostrar status do personagem'
        );
    }
}

export function initPlayHudCharacterCard(): void {
    const card = document.getElementById('playHudCharacterCard');
    const toggle = card?.querySelector<HTMLButtonElement>('.play-hud-character-card__toggle');
    if (!card || !toggle) return;

    setCardExpanded(card, readExpandedPreference());

    toggle.addEventListener('click', () => {
        const next = !card.classList.contains('is-expanded');
        setCardExpanded(card, next);
        saveExpandedPreference(next);
    });
}

export async function updatePlayHudCharacterPortrait(character: CharacterRow): Promise<void> {
    const canvas = document.getElementById('playCharAvatar') as HTMLCanvasElement | null;
    if (!canvas) return;
    await drawCharacterPortraitPreview(canvas, getSpriteUrl(character));
}

export function updatePlayHudLevelBadge(level: number): void {
    const badge = document.getElementById('playHudLevelBadge');
    if (badge) badge.textContent = String(level);
}
