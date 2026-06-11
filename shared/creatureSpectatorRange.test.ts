import { describe, expect, it } from 'vitest';
import {
    CREATURE_AWARE_BOTTOM,
    CREATURE_AWARE_LEFT,
    CREATURE_AWARE_RIGHT,
    CREATURE_AWARE_TOP,
    creatureHasPlayerInAwareRange,
    filterCreatureSnapshotsForViewer,
    filterPlayerSnapshotsForViewer,
    isTileInCreatureSpectatorRange,
    isTileInSpectatorRange,
} from './creatureSpectatorRange.js';
import type { CreatureSnapshot, PlayerSnapshot } from './protocol.js';

function snap(
    partial: Pick<CreatureSnapshot, 'creatureId' | 'tileX' | 'tileY' | 'z'>
): CreatureSnapshot {
    return {
        name: 'rat',
        mapId: 'mainland',
        creatureType: 'monster',
        ...partial,
    };
}

describe('creatureSpectatorRange', () => {
    const viewer = { tileX: 100, tileY: 100, z: 0 };

    it('inclui tile no centro e nas bordas do retângulo aware', () => {
        expect(isTileInCreatureSpectatorRange(viewer, { tileX: 100, tileY: 100, z: 0 })).toBe(true);
        expect(
            isTileInCreatureSpectatorRange(viewer, {
                tileX: viewer.tileX - CREATURE_AWARE_LEFT,
                tileY: viewer.tileY - CREATURE_AWARE_TOP,
                z: 0,
            })
        ).toBe(true);
        expect(
            isTileInCreatureSpectatorRange(viewer, {
                tileX: viewer.tileX + CREATURE_AWARE_RIGHT,
                tileY: viewer.tileY + CREATURE_AWARE_BOTTOM,
                z: 0,
            })
        ).toBe(true);
    });

    it('exclui tile fora do retângulo ou em outro andar', () => {
        expect(
            isTileInCreatureSpectatorRange(viewer, {
                tileX: viewer.tileX - CREATURE_AWARE_LEFT - 1,
                tileY: viewer.tileY,
                z: 0,
            })
        ).toBe(false);
        expect(
            isTileInCreatureSpectatorRange(viewer, {
                tileX: viewer.tileX,
                tileY: viewer.tileY + CREATURE_AWARE_BOTTOM + 1,
                z: 0,
            })
        ).toBe(false);
        expect(
            isTileInCreatureSpectatorRange(viewer, {
                tileX: viewer.tileX,
                tileY: viewer.tileY,
                z: 1,
            })
        ).toBe(false);
    });

    it('filterCreatureSnapshotsForViewer mantém só criaturas visíveis', () => {
        const creatures = [
            snap({ creatureId: 'near', tileX: 101, tileY: 100, z: 0 }),
            snap({ creatureId: 'far', tileX: 200, tileY: 200, z: 0 }),
            snap({ creatureId: 'other_floor', tileX: 100, tileY: 100, z: 1 }),
        ];
        const filtered = filterCreatureSnapshotsForViewer(viewer, creatures);
        expect(filtered.map((c) => c.creatureId)).toEqual(['near']);
    });

    it('isTileInSpectatorRange é alias de isTileInCreatureSpectatorRange', () => {
        const event = { tileX: 101, tileY: 100, z: 0 };
        expect(isTileInSpectatorRange(viewer, event)).toBe(
            isTileInCreatureSpectatorRange(viewer, event)
        );
    });

    it('filterPlayerSnapshotsForViewer mantém só jogadores visíveis', () => {
        const players: PlayerSnapshot[] = [
            {
                playerId: 'near',
                name: 'Near',
                mapId: 'mainland',
                tileX: 101,
                tileY: 100,
                z: 0,
            },
            {
                playerId: 'far',
                name: 'Far',
                mapId: 'mainland',
                tileX: 200,
                tileY: 200,
                z: 0,
            },
        ];
        const filtered = filterPlayerSnapshotsForViewer(viewer, players);
        expect(filtered.map((p) => p.playerId)).toEqual(['near']);
    });

    it('creatureHasPlayerInAwareRange detecta jogador no retângulo', () => {
        const creature = { tileX: 105, tileY: 100, z: 0 };
        expect(
            creatureHasPlayerInAwareRange(creature, [
                { tileX: 100, tileY: 100, z: 0 },
                { tileX: 200, tileY: 200, z: 0 },
            ])
        ).toBe(true);
        expect(creatureHasPlayerInAwareRange(creature, [{ tileX: 200, tileY: 200, z: 0 }])).toBe(
            false
        );
    });
});
