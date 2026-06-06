import {
    getExpForLevel,
    getLevelFromExp,
} from '../engine/character/calculateStats.js';

export interface CharacterProgress {
    experience: number;
    level: number;
}

export interface ExperienceGainResult extends CharacterProgress {
    leveledUp: boolean;
    levelsGained: number;
}

/** XP acumulado dentro do nível atual e total necessário para subir. */
export function getExpProgress(experience: number, level: number): {
    currentInLevel: number;
    requiredForNext: number;
    percent: number;
} {
    const safeExp = Math.max(0, Math.floor(experience));
    const safeLevel = Math.max(1, Math.floor(level));
    const floorExp = getExpForLevel(safeLevel);
    const nextExp = getExpForLevel(safeLevel + 1);
    const currentInLevel = Math.max(0, safeExp - floorExp);
    const requiredForNext = Math.max(1, nextExp - floorExp);
    const percent = Math.min(100, Math.round((currentInLevel / requiredForNext) * 100));
    return { currentInLevel, requiredForNext, percent };
}

export function applyExperienceGain(
    currentExperience: number,
    amount: number
): ExperienceGainResult {
    const prevLevel = getLevelFromExp(currentExperience);
    const nextExperience = Math.max(0, Math.floor(currentExperience + amount));
    const nextLevel = getLevelFromExp(nextExperience);
    return {
        experience: nextExperience,
        level: nextLevel,
        leveledUp: nextLevel > prevLevel,
        levelsGained: Math.max(0, nextLevel - prevLevel),
    };
}

export function normalizeCharacterProgress(
    experience: number | undefined,
    _level?: number | undefined
): CharacterProgress {
    const exp = Math.max(0, Math.floor(experience ?? 0));
    return {
        experience: exp,
        level: getLevelFromExp(exp),
    };
}
