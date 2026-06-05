/**
 * Buffs e debuffs temporários de velocidade (magias, poções, condições).
 * Persistência futura: serializar `active` ao salvar personagem.
 */

export interface SpeedBuffDefinition {
    id: string;
    name: string;
    /** Soma ao stat SPEED (aditivo). */
    speedBonus?: number;
    /** Subtrai do stat SPEED (aditivo). */
    speedPenalty?: number;
    durationMs: number;
}

export interface SpeedBuffTotals {
    bonus: number;
    penalty: number;
}

interface ActiveSpeedBuff {
    defId: string;
    expiresAtMs: number;
}

export const SPEED_BUFF_DEFINITIONS: Record<string, SpeedBuffDefinition> = {
    haste: {
        id: 'haste',
        name: 'Haste',
        speedBonus: 40,
        durationMs: 30_000,
    },
    strong_haste: {
        id: 'strong_haste',
        name: 'Strong Haste',
        speedBonus: 60,
        durationMs: 20_000,
    },
    slow: {
        id: 'slow',
        name: 'Slow',
        speedPenalty: 35,
        durationMs: 15_000,
    },
};

export class SpeedBuffManager {
    private active: ActiveSpeedBuff[] = [];

    /** Aplica ou renova buff pelo id da definição. */
    apply(defId: string, nowMs: number): boolean {
        const def = SPEED_BUFF_DEFINITIONS[defId];
        if (!def) return false;

        // Haste e Slow não devem ficar ativos juntos (senão quase não muda o passo).
        if (def.speedBonus) {
            this.remove('slow');
        }
        if (def.speedPenalty) {
            this.remove('haste');
            this.remove('strong_haste');
        }

        const expiresAtMs = nowMs + def.durationMs;
        const existing = this.active.find((b) => b.defId === defId);
        if (existing) {
            existing.expiresAtMs = expiresAtMs;
        } else {
            this.active.push({ defId, expiresAtMs });
        }
        return true;
    }

    remove(defId: string): void {
        this.active = this.active.filter((b) => b.defId !== defId);
    }

    clearAll(): void {
        this.active = [];
    }

    /** Remove expirados e retorna totais para `resolveMovementSpeed`. */
    tick(nowMs: number): SpeedBuffTotals {
        this.active = this.active.filter((b) => b.expiresAtMs > nowMs);
        return this.getTotals();
    }

    getTotals(): SpeedBuffTotals {
        let bonus = 0;
        let penalty = 0;
        for (const entry of this.active) {
            const def = SPEED_BUFF_DEFINITIONS[entry.defId];
            if (!def) continue;
            bonus += def.speedBonus ?? 0;
            penalty += def.speedPenalty ?? 0;
        }
        return { bonus, penalty };
    }

    /** Nomes ativos (UI / debug). */
    getActiveNames(nowMs: number): string[] {
        this.tick(nowMs);
        return this.active.map((b) => SPEED_BUFF_DEFINITIONS[b.defId]?.name ?? b.defId);
    }
}
