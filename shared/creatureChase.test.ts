import { describe, expect, it } from 'vitest';
import {
    chaseFaceDirectionWhenEngaged,
    collectMeleeChaseGoals,
    DEFAULT_MELEE_CHASE_CONFIG,
    directionTowardTile,
    findCardinalPathFirstStep,
    findMeleeGoalTiles,
    findMeleeRingTiles,
    MELEE_WAIT_RING_DIST,
    pickDanceStep,
    pickMeleeGoalTile,
    pickMeleeRingGoalTile,
    resolveAggroFaceDirection,
    resolveChaseIdleDirection,
    shouldMonsterApproachChase,
    tickMonsterChaseStep,
} from './creatureChase.js';

const SURROUND_KEYS_10_10 = [
    '9,10',
    '11,10',
    '10,9',
    '10,11',
    '9,9',
    '11,9',
    '9,11',
    '11,11',
];

describe('directionTowardTile', () => {
    it('prefere eixo dominante', () => {
        expect(directionTowardTile(0, 0, 3, 1)).toBe('east');
        expect(directionTowardTile(0, 0, 1, 3)).toBe('south');
        expect(directionTowardTile(5, 5, 2, 5)).toBe('west');
        expect(directionTowardTile(5, 5, 5, 2)).toBe('north');
    });

    it('mantém eixo em diagonal quando currentDirection já aponta nesse eixo', () => {
        expect(directionTowardTile(0, 0, 2, 2, 'east')).toBe('east');
        expect(directionTowardTile(0, 0, -2, -2, 'west')).toBe('west');
        expect(directionTowardTile(0, 0, 2, 2, 'south')).toBe('south');
        expect(directionTowardTile(0, 0, -2, -2, 'north')).toBe('north');
    });
});

describe('chaseFaceDirectionWhenEngaged', () => {
    it('vira para o jogador quando melee adjacente', () => {
        expect(
            chaseFaceDirectionWhenEngaged(10, 10, 11, 10, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBe('east');
        expect(
            chaseFaceDirectionWhenEngaged(10, 10, 9, 10, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBe('west');
        expect(
            chaseFaceDirectionWhenEngaged(9, 9, 10, 10, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBe('south');
    });

    it('retorna null fora do alcance', () => {
        expect(
            chaseFaceDirectionWhenEngaged(0, 0, 5, 0, DEFAULT_MELEE_CHASE_CONFIG)
        ).toBeNull();
    });
});

describe('resolveChaseIdleDirection', () => {
    it('vira para o jogador quando aggroed e parado (adjacente)', () => {
        expect(resolveChaseIdleDirection(10, 10, 10, 9, 0, 0)).toBe('north');
        expect(resolveChaseIdleDirection(10, 10, 11, 10, 0, 0)).toBe('east');
    });

    it('vira para o jogador fora do attackRange mas dentro do aggro', () => {
        expect(resolveChaseIdleDirection(0, 0, 0, 4, 0, 0)).toBe('south');
        expect(resolveChaseIdleDirection(0, 0, 5, 0, 0, 0)).toBe('east');
    });

    it('retorna null fora do aggro ou andar diferente', () => {
        expect(resolveChaseIdleDirection(0, 0, 20, 0, 0, 0)).toBeNull();
        expect(resolveChaseIdleDirection(0, 0, 1, 0, 1, 0)).toBeNull();
        expect(resolveChaseIdleDirection(5, 5, 5, 5, 0, 0)).toBeNull();
    });
});

describe('resolveAggroFaceDirection', () => {
    it('olha para o jogador dentro do aggro (1–7 SQM)', () => {
        expect(resolveAggroFaceDirection(0, 0, 3, 0, 0, 0)).toBe('east');
        expect(resolveAggroFaceDirection(0, 0, 0, 5, 0, 0, 'south')).toBe('south');
        expect(resolveAggroFaceDirection(10, 10, 10, 9, 0, 0, 'north')).toBe('north');
    });

    it('retorna null fora do aggro, mesmo tile ou andar diferente', () => {
        expect(resolveAggroFaceDirection(0, 0, 20, 0, 0, 0)).toBeNull();
        expect(resolveAggroFaceDirection(5, 5, 5, 5, 0, 0)).toBeNull();
        expect(resolveAggroFaceDirection(0, 0, 1, 0, 1, 0)).toBeNull();
    });
});

describe('findCardinalPathFirstStep (BFS estilo OTC)', () => {
    it('contorna tile bloqueado para slot sul livre', () => {
        const blocked = new Set<string>(['11,11']);
        const canStep = (tx: number, ty: number) => !blocked.has(`${tx},${ty}`);
        const step = findCardinalPathFirstStep(
            11,
            12,
            [{ tx: 10, ty: 11 }],
            canStep
        );
        expect(step).toEqual({ dx: -1, dy: 0, dir: 'west' });
    });

    it('encontra rota quando o slot adjacente direto está bloqueado', () => {
        const blocked = new Set<string>(['9,11']);
        const canStep = (tx: number, ty: number) => !blocked.has(`${tx},${ty}`);
        const goals = collectMeleeChaseGoals(10, 10, canStep, canStep);
        expect(goals).toContainEqual({ tx: 10, ty: 11 });
        expect(goals).not.toContainEqual({ tx: 9, ty: 11 });
        const step = findCardinalPathFirstStep(8, 11, goals, canStep);
        expect(step).not.toBeNull();
    });

    it('tickMonsterChaseStep usa pathfinding para preencher diagonal bloqueada', () => {
        const blocked = new Set<string>(['11,11', '10,11']);
        const canStep = (tx: number, ty: number) => {
            if (tx < 0 || ty < 0) return false;
            return !blocked.has(`${tx},${ty}`);
        };
        const mob = {
            tileX: 11,
            tileY: 12,
            z: 0,
            lastAggroMoveTime: 0,
            lastSeenPlayerTileX: undefined as number | undefined,
            lastSeenPlayerTileY: undefined as number | undefined,
            reactAfterMs: undefined as number | undefined,
            wakeUntilMs: undefined as number | undefined,
        };
        const player = { tileX: 10, tileY: 10, z: 0 };
        const step = tickMonsterChaseStep(
            mob,
            player,
            1000,
            canStep,
            new Set(),
            DEFAULT_MELEE_CHASE_CONFIG,
            canStep
        );
        expect(step).toEqual({ dx: -1, dy: 0, dir: 'west' });
    });
});

describe('melee surround (8 direções)', () => {
    const alwaysWalk = () => true;

    it('findMeleeGoalTiles inclui diagonais (8 slots)', () => {
        const goals = findMeleeGoalTiles(10, 10, alwaysWalk);
        expect(goals).toHaveLength(8);
        expect(goals).toContainEqual({ tx: 9, ty: 9 });
        expect(goals).toContainEqual({ tx: 11, ty: 11 });
    });

    it('pickMeleeGoalTile escolhe diagonal quando cardinais estão reservados', () => {
        const reserved = new Set<string>(['9,10', '11,10', '10,9', '10,11']);
        const goal = pickMeleeGoalTile(5, 5, 10, 10, alwaysWalk, reserved);
        expect(Math.abs(goal.tx - 10) + Math.abs(goal.ty - 10)).toBeGreaterThan(0);
        expect(Math.max(Math.abs(goal.tx - 10), Math.abs(goal.ty - 10))).toBe(1);
        expect(goal.tx !== 10 && goal.ty !== 10).toBe(true);
    });

    it('pickMeleeGoalTile ignora meta sem passo alcançável e libera slot para outro mob', () => {
        const reserved = new Set<string>();
        const blockedWest = (tx: number, ty: number) => !(tx === 8 && ty === 10);
        const goalNear = pickMeleeGoalTile(7, 10, 10, 10, alwaysWalk, reserved, blockedWest);
        expect(goalNear).toEqual({ tx: 9, ty: 10 });

        reserved.clear();
        reserved.add('9,10');
        const goalFar = pickMeleeGoalTile(5, 10, 10, 10, alwaysWalk, reserved, blockedWest);
        expect(goalFar).not.toEqual({ tx: 9, ty: 10 });
        expect(Math.max(Math.abs(goalFar.tx - 10), Math.abs(goalFar.ty - 10))).toBe(1);
    });
});

describe('melee ring fallback (anti ping-pong)', () => {
    const alwaysWalk = () => true;

    it('findMeleeRingTiles lista tiles Manhattan a distância 2', () => {
        const ring = findMeleeRingTiles(10, 10, MELEE_WAIT_RING_DIST, alwaysWalk);
        expect(ring).toHaveLength(8);
        for (const t of ring) {
            expect(Math.abs(t.tx - 10) + Math.abs(t.ty - 10)).toBe(MELEE_WAIT_RING_DIST);
        }
    });

    it('pickMeleeGoalTile retorna null quando todos os slots estão reservados', () => {
        const reserved = new Set<string>(SURROUND_KEYS_10_10);
        expect(pickMeleeGoalTile(0, 0, 10, 10, alwaysWalk, reserved)).toBeNull();
    });

    it('pickMeleeRingGoalTile escolhe tile livre no anel', () => {
        const goal = pickMeleeRingGoalTile(12, 10, 10, 10, alwaysWalk);
        expect(goal).toEqual({ tx: 12, ty: 10 });
    });

    it('mob com fila melee cheia usa anel, não tile do jogador', () => {
        const noSurround = (tx: number, ty: number) =>
            !SURROUND_KEYS_10_10.includes(`${tx},${ty}`);
        const ring = pickMeleeRingGoalTile(10, 15, 10, 10, noSurround);
        expect(ring).not.toBeNull();
        expect(ring).not.toEqual({ tx: 10, ty: 10 });
        expect(Math.abs(ring!.tx - 10) + Math.abs(ring!.ty - 10)).toBe(MELEE_WAIT_RING_DIST);
    });

    it('excludeGoals tenta o próximo slot livre', () => {
        const exclude = new Set<string>(['9,9']);
        const goal = pickMeleeGoalTile(5, 5, 10, 10, alwaysWalk, new Set(), alwaysWalk, exclude);
        expect(goal).not.toEqual({ tx: 9, ty: 9 });
        expect(Math.max(Math.abs(goal!.tx - 10), Math.abs(goal!.ty - 10))).toBe(1);
    });

    it('pickDanceStep aproxima do anel quando passo direto falha', () => {
        const step = pickDanceStep(13, 10, 10, 10, alwaysWalk);
        expect(step).not.toBeNull();
        expect(step!.dx).toBe(-1);
        expect(step!.dy).toBe(0);
    });
});

describe('tickMonsterChaseStep walkStepMs', () => {
    const alwaysWalk = () => true;
    const noReserve = new Set<string>();

    it('para no tile diagonal adjacente (chebyshev 1)', () => {
        const mob = {
            tileX: 9,
            tileY: 9,
            z: 0,
            lastAggroMoveTime: 0,
            lastSeenPlayerTileX: undefined as number | undefined,
            lastSeenPlayerTileY: undefined as number | undefined,
            reactAfterMs: undefined as number | undefined,
            wakeUntilMs: undefined as number | undefined,
        };
        const player = { tileX: 10, tileY: 10, z: 0 };
        expect(
            tickMonsterChaseStep(mob, player, 1000, alwaysWalk, noReserve, DEFAULT_MELEE_CHASE_CONFIG, alwaysWalk)
        ).toBeNull();
    });

    it('walkStepMs maior atrasa o segundo passo', () => {
        const slowConfig = { ...DEFAULT_MELEE_CHASE_CONFIG, walkStepMs: 600 };
        const mob = {
            tileX: 0,
            tileY: 0,
            z: 0,
            lastAggroMoveTime: 0,
            lastSeenPlayerTileX: undefined as number | undefined,
            lastSeenPlayerTileY: undefined as number | undefined,
            reactAfterMs: undefined as number | undefined,
            wakeUntilMs: undefined as number | undefined,
        };
        const player = { tileX: 5, tileY: 0, z: 0 };

        const first = tickMonsterChaseStep(
            mob,
            player,
            1000,
            alwaysWalk,
            noReserve,
            slowConfig,
            alwaysWalk
        );
        expect(first).not.toBeNull();
        expect(mob.lastAggroMoveTime).toBe(1000);

        const tooSoon = tickMonsterChaseStep(
            mob,
            player,
            1400,
            alwaysWalk,
            noReserve,
            slowConfig,
            alwaysWalk
        );
        expect(tooSoon).toBeNull();

        const second = tickMonsterChaseStep(
            mob,
            player,
            1600,
            alwaysWalk,
            noReserve,
            slowConfig,
            alwaysWalk
        );
        expect(second).not.toBeNull();
        expect(mob.lastAggroMoveTime).toBe(1600);
    });
});

describe('shouldMonsterApproachChase', () => {
    it('sempre permite mob já no alcance de combate', () => {
        expect(shouldMonsterApproachChase(1, 1, 99)).toBe(true);
    });

    it('limita mobs que ainda estão se aproximando', () => {
        expect(shouldMonsterApproachChase(5, 1, 9, 10)).toBe(true);
        expect(shouldMonsterApproachChase(5, 1, 10, 10)).toBe(false);
    });
});
