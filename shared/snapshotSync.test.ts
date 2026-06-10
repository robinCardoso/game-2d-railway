import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../protocol';
import {
    applyPlayerSnapshotList,
    hashPlayerSnapshots,
    mergePlayerSnapshot,
} from './snapshotSync';

function snap(id: string, tileX: number, tileY = 10): PlayerSnapshot {
    return {
        playerId: id,
        name: id,
        mapId: 'mainland',
        tileX,
        tileY,
        z: 0,
    };
}

describe('hashPlayerSnapshots', () => {
    it('é igual para mesma lista em ordem diferente', () => {
        const a = hashPlayerSnapshots([snap('b', 2), snap('a', 1)]);
        const b = hashPlayerSnapshots([snap('a', 1), snap('b', 2)]);
        expect(a).toBe(b);
    });

    it('muda quando tile muda', () => {
        const a = hashPlayerSnapshots([snap('a', 1)]);
        const b = hashPlayerSnapshots([snap('a', 2)]);
        expect(a).not.toBe(b);
    });
});

describe('applyPlayerSnapshotList', () => {
    it('reutiliza objetos existentes no merge', () => {
        const map = new Map<string, PlayerSnapshot>();
        const first = snap('p1', 1);
        map.set('p1', first);

        applyPlayerSnapshotList(map, [snap('p1', 2)]);

        expect(map.get('p1')).toBe(first);
        expect(first.tileX).toBe(2);
    });

    it('remove jogadores ausentes do snapshot', () => {
        const map = new Map<string, PlayerSnapshot>([
            ['p1', snap('p1', 1)],
            ['p2', snap('p2', 3)],
        ]);

        applyPlayerSnapshotList(map, [snap('p1', 1)]);

        expect(map.has('p1')).toBe(true);
        expect(map.has('p2')).toBe(false);
    });

    it('exclui playerId local quando informado', () => {
        const map = new Map<string, PlayerSnapshot>();
        applyPlayerSnapshotList(map, [snap('me', 1), snap('other', 2)], 'me');
        expect(map.has('me')).toBe(false);
        expect(map.has('other')).toBe(true);
    });
});

describe('mergePlayerSnapshot', () => {
    it('copia vitals opcionais', () => {
        const target = snap('p1', 1);
        mergePlayerSnapshot(target, { ...snap('p1', 1), health: 50, maxHealth: 100, mana: 10, maxMana: 20 });
        expect(target.health).toBe(50);
        expect(target.maxMana).toBe(20);
    });
});
