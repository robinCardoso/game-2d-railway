import { calculateStatsForLevel } from '../../engine/character/calculateStats';
import { VOCATIONS } from '../../game-data/default/vocations';
import { VocationId } from '../../../shared/types/character';
import type { CharacterRow } from '../../shared/types';

export function updateCharacterStatsUi(character: CharacterRow): void {
  const vocationId = (character.vocation as VocationId) || 'knight';
  const level = character.level || 1;

  // Resolve concrete configuration from Game Data (decoupled from Engine)
  const vocationConfig = VOCATIONS[vocationId] || VOCATIONS.knight;
  const stats = calculateStatsForLevel(vocationConfig, level);

  const elVocation = document.getElementById('statVocation');
  const elLevel = document.getElementById('statLevel');
  const elMelee = document.getElementById('statMelee');
  const elDistance = document.getElementById('statDistance');
  const elMagic = document.getElementById('statMagic');
  const elDefense = document.getElementById('statDefense');
  const elHealth = document.getElementById('statHealth');
  const elMana = document.getElementById('statMana');

  if (elVocation) elVocation.textContent = vocationId.toUpperCase();
  if (elLevel) elLevel.textContent = String(level);
  if (elMelee) elMelee.textContent = String(stats.melee);
  if (elDistance) elDistance.textContent = String(stats.distanceAttack);
  if (elMagic) elMagic.textContent = String(stats.magicAttack);
  if (elDefense) elDefense.textContent = String(stats.defense);
  if (elHealth) elHealth.textContent = String(stats.health);
  if (elMana) elMana.textContent = String(stats.mana);
}
