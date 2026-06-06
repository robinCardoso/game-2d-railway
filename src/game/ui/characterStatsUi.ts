import { calculateStatsForLevel } from '../../engine/character/calculateStats';
import { getVocationById } from '../../game-data/vocationRegistry';
import { VocationId } from '../../../shared/types/character';
import type { CharacterRow } from '../../shared/types';
import { getExpProgress, normalizeCharacterProgress } from '../experience';
import { showLevelUpBanner } from './levelUpBanner';

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
  const elHealth = document.getElementById('statHealth');
  const elMana = document.getElementById('statMana');
  const elExp = document.getElementById('statExp');
  const elExpBar = document.getElementById('statExpBarFill');

  if (elVocation) elVocation.textContent = vocationId.toUpperCase();
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
  if (elHealth) elHealth.textContent = String(stats.health);
  if (elMana) elMana.textContent = String(stats.mana);
  if (elExp) {
    elExp.textContent = `${expProgress.currentInLevel} / ${expProgress.requiredForNext} XP`;
  }
  if (elExpBar) {
    elExpBar.style.width = `${expProgress.percent}%`;
  }
}
