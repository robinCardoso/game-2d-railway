import { calculateStatsForLevel } from '../../engine/character/calculateStats';
import { getVocationById } from '../../game-data/vocationRegistry';
import { VocationId } from '../../../shared/types/character';
import type { CharacterRow } from '../../shared/types';
import { getExpProgress, normalizeCharacterProgress } from '../experience';
import { showLevelUpBanner } from './levelUpBanner';
import { updatePlayHudLevelBadge } from './playHudCharacterCard';

function formatVocationLabel(vocationId: string): string {
    if (!vocationId) return '—';
    return vocationId.charAt(0).toUpperCase() + vocationId.slice(1);
}

export function updateCharacterStatsUi(
    character: CharacterRow,
    options?: { flashLevel?: boolean }
): void {
  const vocationId = (character.vocation as VocationId) || 'knight';
  const { level, experience } = normalizeCharacterProgress(character.experience, character.level);

  const vocationConfig = getVocationById(vocationId);
  const stats = calculateStatsForLevel(vocationConfig, level);
  const expProgress = getExpProgress(experience, level);

  const elVocation = document.getElementById('statVocation');
  const elLevel = document.getElementById('statLevel');
  const elMelee = document.getElementById('statMelee');
  const elDistance = document.getElementById('statDistance');
  const elMagic = document.getElementById('statMagic');
  const elDefense = document.getElementById('statDefense');

  const vocationLabel = formatVocationLabel(vocationId);
  if (elVocation) elVocation.textContent = vocationLabel.toUpperCase();

  const elHudLevel = document.getElementById('playHudLevel');
  const elCharVocation = document.getElementById('playCharVocation');
  const elPanelName = document.getElementById('characterPanelName');
  const elCharName = document.getElementById('playCharName');
  if (elHudLevel) elHudLevel.textContent = String(level);
  if (elCharVocation) elCharVocation.textContent = vocationLabel;
  updatePlayHudLevelBadge(level);
  if (elPanelName && elCharName) elPanelName.textContent = elCharName.textContent ?? '—';

    if (elLevel) {
        elLevel.textContent = String(level);
        if (options?.flashLevel) {
            elLevel.classList.add('stat-level-flash');
            window.setTimeout(() => elLevel.classList.remove('stat-level-flash'), 1200);
            showLevelUpBanner(level);
        }
    }
  if (elMelee) elMelee.textContent = String(stats.melee);
  if (elDistance) elDistance.textContent = String(stats.distanceAttack);
  if (elMagic) elMagic.textContent = String(stats.magicAttack);
  if (elDefense) elDefense.textContent = String(stats.defense);

  const elHudXpFill = document.getElementById('playHudXpFill');
  const elHudXp = document.getElementById('playHudXpText');
  if (elHudXpFill) elHudXpFill.style.width = `${expProgress.percent}%`;
  if (elHudXp) {
    elHudXp.textContent = `${expProgress.currentInLevel} / ${expProgress.requiredForNext} (${Math.round(expProgress.percent)}%)`;
  }
}
