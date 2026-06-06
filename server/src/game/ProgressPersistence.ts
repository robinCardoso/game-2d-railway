import { isDatabaseConfigured } from '../db/pool.js';
import { updateCharacterProgress } from '../db/repositories/characters.repo.js';

export interface PersistedProgress {
    characterId: string;
    accountId: string;
    level: number;
    experience: number;
}

/**
 * Salva level/XP no PostgreSQL (combate autoritativo).
 */
export class ProgressPersistence {
    async saveNow(progress: PersistedProgress): Promise<void> {
        if (!isDatabaseConfigured()) return;
        try {
            await updateCharacterProgress(progress.characterId, progress.accountId, {
                level: progress.level,
                experience: progress.experience,
            });
        } catch (err) {
            console.error(
                `[ProgressPersistence] Falha ao salvar ${progress.characterId}:`,
                err
            );
        }
    }
}
