import { describe, expect, it } from 'vitest';
import {
    LOOT_MIN_DAMAGE_SHARE_PERCENT,
    resolveLootEligiblePlayerIds,
} from './lootEligibility';

describe('resolveLootEligiblePlayerIds', () => {
    const creatureTile = { tileX: 10, tileY: 10, z: 0 };
    const maxHealth = 100;
    const minDamage = (maxHealth * LOOT_MIN_DAMAGE_SHARE_PERCENT) / 100;

    it('inclui jogadores com dano suficiente no AOI', () => {
        const ids = resolveLootEligiblePlayerIds(
            [
                { playerId: 'p1', tileX: 10, tileY: 11, z: 0, health: 100 },
                { playerId: 'p2', tileX: 10, tileY: 12, z: 0, health: 100 },
            ],
            {
                creatureTile,
                maxHealth,
                damageByPlayer: { p1: minDamage, p2: minDamage + 10 },
            }
        );
        expect(ids).toEqual(['p2', 'p1']);
    });

    it('exclui jogador fora do AOI', () => {
        const ids = resolveLootEligiblePlayerIds(
            [{ playerId: 'far', tileX: 50, tileY: 50, z: 0, health: 100 }],
            {
                creatureTile,
                maxHealth,
                damageByPlayer: { far: 80 },
            }
        );
        expect(ids).toEqual([]);
    });

    it('exclui jogador morto', () => {
        const ids = resolveLootEligiblePlayerIds(
            [{ playerId: 'dead', tileX: 10, tileY: 10, z: 0, health: 0 }],
            {
                creatureTile,
                maxHealth,
                damageByPlayer: { dead: 50 },
            }
        );
        expect(ids).toEqual([]);
    });

    it('exclui dano abaixo do mínimo', () => {
        const ids = resolveLootEligiblePlayerIds(
            [{ playerId: 'leech', tileX: 10, tileY: 10, z: 0, health: 100 }],
            {
                creatureTile,
                maxHealth,
                damageByPlayer: { leech: minDamage - 1 },
            }
        );
        expect(ids).toEqual([]);
    });

    it('exclui andar diferente', () => {
        const ids = resolveLootEligiblePlayerIds(
            [{ playerId: 'p1', tileX: 10, tileY: 10, z: 1, health: 100 }],
            {
                creatureTile,
                maxHealth,
                damageByPlayer: { p1: 50 },
            }
        );
        expect(ids).toEqual([]);
    });
});
