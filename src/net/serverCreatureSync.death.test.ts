import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_CONFIG } from '../engine/config';
import { ServerCreatureSync } from './serverCreatureSync';
import type { CreatureSnapshot } from '../../shared/protocol';

const TILE = ENGINE_CONFIG.TILE_SIZE;

beforeEach(() => {
    vi.stubGlobal(
        'Image',
        class {
            onload: (() => void) | null = null;
            set src(_value: string) {
                queueMicrotask(() => this.onload?.());
            }
        }
    );
});

function makeSnap(
    overrides: Partial<CreatureSnapshot> & Pick<CreatureSnapshot, 'creatureId'>
): CreatureSnapshot {
    return {
        name: 'Magao Bruto',
        mapId: 'test-map',
        tileX: 5,
        tileY: 5,
        z: 0,
        creatureType: 'monster',
        health: 100,
        maxHealth: 100,
        ...overrides,
    };
}

describe('ServerCreatureSync death snap', () => {
    it('applyDied faz snap ao tile autoritativo quando entidade está no meio do deslize', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-1';

        sync.applySync([makeSnap({ creatureId: id, tileX: 5, tileY: 5 })], 'test-map');

        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'east' },
            320,
            performance.now()
        );

        const midSlide = sync.getEntities()[0];
        expect(midSlide.tileX).toBe(6);
        expect(midSlide.worldX).toBe(5 * TILE);

        sync.applyDied(id, { tileX: 5, tileY: 5, z: 0 });

        const dead = sync.getEntities()[0];
        expect(dead.tileX).toBe(5);
        expect(dead.tileY).toBe(5);
        expect(dead.worldX).toBe(5 * TILE);
        expect(dead.worldY).toBe(5 * TILE);
        expect(dead.isDead).toBe(true);
    });

    it('applyMoved é ignorado quando combatHealth <= 0', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-2';

        sync.applySync([makeSnap({ creatureId: id, tileX: 3, tileY: 3 })], 'test-map');
        sync.applyDamaged(id, 0, 100, 50);

        sync.applyMoved(
            { creatureId: id, tileX: 4, tileY: 3, z: 0, direction: 'east' },
            320,
            performance.now()
        );

        const entity = sync.getEntities()[0];
        expect(entity.tileX).toBe(3);
        expect(entity.worldX).toBe(3 * TILE);
    });

    it('pacote extra durante deslize retargeta para meta mais recente', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-3';
        const t0 = 1000;

        sync.applySync([makeSnap({ creatureId: id, tileX: 5, tileY: 5 })], 'test-map');
        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'east' },
            320,
            t0
        );

        sync.applyMoved(
            { creatureId: id, tileX: 7, tileY: 5, z: 0, direction: 'east' },
            320,
            t0 + 50
        );

        const mid = sync.getEntities()[0];
        expect(mid.tileX).toBe(7);
        expect(mid.worldX).toBeLessThan(7 * TILE);

        for (let t = t0; t <= t0 + 680; t += 16) {
            sync.tick(t);
        }

        const after = sync.getEntities()[0];
        expect(after.tileX).toBe(7);
        expect(after.worldX).toBe(7 * TILE);
    });

    it('catch-up cardinal tile a tile até meta distante', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-4';
        const t0 = 2000;

        sync.applySync([makeSnap({ creatureId: id, tileX: 5, tileY: 5 })], 'test-map');
        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'east' },
            320,
            t0
        );
        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 4, z: 0, direction: 'north' },
            320,
            t0 + 320
        );

        const started = sync.getEntities()[0];
        expect(started.tileX).toBe(6);
        expect(started.tileY).toBe(4);

        for (let t = t0; t <= t0 + 1000; t += 16) {
            sync.tick(t);
        }

        const after = sync.getEntities()[0];
        expect(after.tileX).toBe(6);
        expect(after.tileY).toBe(4);
        expect(after.worldX).toBe(6 * TILE);
        expect(after.worldY).toBe(4 * TILE);
    });

    it('pacote durante deslize retargeta para novo tile do servidor', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-5';
        const t0 = 3000;

        sync.applySync([makeSnap({ creatureId: id, tileX: 5, tileY: 5 })], 'test-map');
        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'east' },
            320,
            t0
        );
        sync.tick(t0 + 80);
        sync.applyMoved(
            { creatureId: id, tileX: 5, tileY: 5, z: 0, direction: 'west' },
            320,
            t0 + 80
        );

        const midSlide = sync.getEntities()[0];
        expect(midSlide.tileX).toBe(5);
        expect(midSlide.worldX).toBeGreaterThan(5 * TILE);
        expect(midSlide.worldX).toBeLessThan(6 * TILE);

        for (let t = t0; t <= t0 + 720; t += 16) {
            sync.tick(t);
        }

        const after = sync.getEntities()[0];
        expect(after.tileX).toBe(5);
        expect(after.tileY).toBe(5);
        expect(after.worldX).toBe(5 * TILE);
    });

    it('passo de caminhada usa direção cardinal, não face-to-player do servidor', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-6';
        const t0 = 4000;

        sync.applySync([makeSnap({ creatureId: id, tileX: 5, tileY: 5 })], 'test-map');
        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'north' },
            320,
            t0
        );

        const walking = sync.getEntities()[0];
        expect(walking.animController.currentDirection).toBe('right');
    });

    it('virar para jogador só quando visual já está no SQM do servidor', () => {
        const sync = new ServerCreatureSync();
        const id = 'mob-7';
        const t0 = 5000;

        sync.applySync([makeSnap({ creatureId: id, tileX: 5, tileY: 5 })], 'test-map');
        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'east' },
            320,
            t0
        );

        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'north' },
            320,
            t0 + 40
        );

        const midSlide = sync.getEntities()[0];
        expect(midSlide.animController.currentDirection).toBe('right');

        for (let t = t0; t <= t0 + 400; t += 16) {
            sync.tick(t);
        }

        sync.applyMoved(
            { creatureId: id, tileX: 6, tileY: 5, z: 0, direction: 'north' },
            320,
            t0 + 400
        );

        const arrived = sync.getEntities()[0];
        expect(arrived.worldX).toBe(6 * TILE);
        expect(arrived.animController.currentDirection).toBe('up');
    });
});
