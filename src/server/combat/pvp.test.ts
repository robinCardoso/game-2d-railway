import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GameRoom } from '../../../server/src/GameRoom';
import { MapCollisionStore } from '../../../server/src/MapCollisionStore';
import { MapInstanceStore } from '../../../server/src/MapInstanceStore';
import { CreaturePresetStore } from '../../../server/src/game/CreaturePresetStore';
import { SpellCatalogStore } from '../../../server/src/game/SpellCatalogStore';
import { VocationStore } from '../../../server/src/game/VocationStore';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import * as enterTicketModule from '../../../server/src/enterTicket';
import * as combatModule from '../../../server/src/combat/combat';

describe('PvP Combat System Tests', () => {
    let collision: MapCollisionStore;
    let instances: MapInstanceStore;
    let creaturePresets: CreaturePresetStore;
    let spellCatalog: SpellCatalogStore;
    let vocations: VocationStore;
    let room: GameRoom;

    beforeEach(() => {
        collision = new MapCollisionStore();
        instances = new MapInstanceStore();
        creaturePresets = new CreaturePresetStore();
        spellCatalog = new SpellCatalogStore();
        vocations = new VocationStore();

        // Spy/Stub methods to avoid file reading and allow custom mapping setups
        vi.spyOn(collision, 'isWalkable').mockReturnValue(true);
        vi.spyOn(collision, 'getZoneIdAt').mockReturnValue(0); // Default open zone
        vi.spyOn(collision, 'getMapSpawn').mockReturnValue({ x: 50, y: 50, z: 0 });
        vi.spyOn(collision, 'resolveJoinPosition').mockImplementation((_mapId, x, y, z) => ({
            tileX: x,
            tileY: y,
            z,
            corrected: false,
        }));

        vi.spyOn(vocations, 'get').mockReturnValue({
            name: 'Knight',
            baseStats: {
                melee: 10,
                magicAttack: 5,
                distanceAttack: 5,
                defense: 10,
                attackSpeed: 100, // Very fast for testing
                defenseAttack: 5,
                health: 100,
                mana: 50,
            },
            growthPerLevel: {
                melee: 1.5,
                magicAttack: 0.5,
                distanceAttack: 0.5,
                defense: 1.0,
                health: 15,
                mana: 5,
            },
        });

        room = new GameRoom(collision, instances, {
            requireWsTicket: false,
            positionSaveIntervalMs: 0,
            creaturePresets,
            spellCatalog,
            vocations,
        });
    });

    function createMockSocket() {
        return {
            readyState: 1, // OPEN
            OPEN: 1,
            send: vi.fn(),
            close: vi.fn(),
        } as any;
    }

    it('should successfully attack another player in mainland (PvP-enabled map)', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        // Join both players at adjacent coordinates in mainland
        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            level: 10,
            experience: 1000,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11, // Adjacent
            z: 0,
            level: 10,
            experience: 1000,
        });

        // Trigger attack
        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        // Verify that target received damage (player_damaged broadcast sent to targetSocket)
        const sentMessages = targetSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        const damageMsg = sentMessages.find((m: any) => m.type === 'player_damaged');

        expect(damageMsg).toBeDefined();
        expect(damageMsg.playerId).toBe(targetId);
        expect(damageMsg.attackerPlayerId).toBe(attackerId);
        expect(damageMsg.damage).toBeGreaterThanOrEqual(0);
    });

    it('broadcast player_damaged só para espectadores no AOI 25×20', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();
        const farSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';
        const farId = 'p_far';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            level: 10,
            experience: 1000,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
            level: 10,
            experience: 1000,
        });

        room.handleMessage(farSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Far',
            playerId: farId,
            mapId: 'mainland',
            tileX: 200,
            tileY: 200,
            z: 0,
            level: 10,
            experience: 1000,
        });

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        const parse = (sock: ReturnType<typeof createMockSocket>) =>
            sock.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string));

        expect(parse(targetSocket).some((m) => m.type === 'player_damaged')).toBe(true);
        expect(parse(farSocket).some((m) => m.type === 'player_damaged')).toBe(false);
    });

    it('should block PvP combat in No-PvP map (e.g. rookgaard)', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'rookgaard',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'rookgaard',
            tileX: 10,
            tileY: 11,
            z: 0,
        });

        // Trigger attack
        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'rookgaard',
            creatureId: targetId,
        });

        // Attacker should receive NO_PVP_MAP error
        const attackerSent = attackerSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        const errorMsg = attackerSent.find((m: any) => m.type === 'error');

        expect(errorMsg).toBeDefined();
        expect(errorMsg.code).toBe('NO_PVP_MAP');

        // Target should NOT have received a player_damaged message
        const targetSent = targetSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        const damageMsg = targetSent.find((m: any) => m.type === 'player_damaged');
        expect(damageMsg).toBeUndefined();
    });

    it('should block PvP if attacker is in a Protection Zone (PZ)', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
        });

        // Mock that attacker is in PZ (ZoneType.PROTECTION_ZONE = 1)
        vi.spyOn(collision, 'getZoneIdAt').mockImplementation((_mapId, x, y, _z) => {
            if (x === 10 && y === 10) return 1; // Attacker inside PZ
            return 0;
        });

        // Trigger attack
        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        // Attacker should receive ATTACKER_IN_PZ error
        const attackerSent = attackerSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        const errorMsg = attackerSent.find((m: any) => m.type === 'error');

        expect(errorMsg).toBeDefined();
        expect(errorMsg.code).toBe('ATTACKER_IN_PZ');
    });

    it('should block PvP if target is in a Protection Zone (PZ)', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
        });

        // Mock that target is in PZ (ZoneType.PROTECTION_ZONE = 1)
        vi.spyOn(collision, 'getZoneIdAt').mockImplementation((_mapId, x, y, _z) => {
            if (x === 10 && y === 11) return 1; // Target inside PZ
            return 0;
        });

        // Trigger attack
        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        // Attacker should receive TARGET_IN_PZ error
        const attackerSent = attackerSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        const errorMsg = attackerSent.find((m: any) => m.type === 'error');

        expect(errorMsg).toBeDefined();
        expect(errorMsg.code).toBe('TARGET_IN_PZ');
    });

    it('should not damage player when attacker is out of melee range', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 12,
            tileY: 10,
            z: 0,
        });

        const processAttackSpy = vi.spyOn(combatModule, 'processAttack');

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        expect(processAttackSpy).not.toHaveBeenCalled();

        const targetObj = (room as any).players.get(targetId);
        expect(targetObj.health).toBe(targetObj.maxHealth);

        const targetSent = targetSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        expect(targetSent.find((m: any) => m.type === 'player_damaged')).toBeUndefined();
    });

    it('should damage player on diagonal adjacency (melee knight)', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            appearance: {
                vocationId: 'knight',
                outfitId: 'knight',
                spriteSheetUrl: '/tiles/characters/knight.png',
                gender: 'male',
            },
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 11,
            tileY: 11,
            z: 0,
        });

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        const targetSent = targetSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        expect(targetSent.find((m: any) => m.type === 'player_damaged')).toBeDefined();
    });

    it('should damage player at 7 SQM when attacker is mage', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_mage';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Mage',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            appearance: {
                vocationId: 'mage',
                outfitId: 'mage',
                spriteSheetUrl: '/tiles/characters/mage.png',
                gender: 'male',
            },
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 17,
            tileY: 10,
            z: 0,
        });

        const processAttackSpy = vi.spyOn(combatModule, 'processAttack');

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        expect(processAttackSpy).toHaveBeenCalled();
        expect(processAttackSpy.mock.calls[0]?.[2]).toBe('magic');

        const targetSent = targetSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        expect(targetSent.find((m: any) => m.type === 'player_damaged')).toBeDefined();
    });

    it('should not damage player beyond 7 SQM when attacker is mage', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_mage';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Mage',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            appearance: {
                vocationId: 'mage',
                outfitId: 'mage',
                spriteSheetUrl: '/tiles/characters/mage.png',
                gender: 'male',
            },
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 18,
            tileY: 10,
            z: 0,
        });

        const processAttackSpy = vi.spyOn(combatModule, 'processAttack');

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        expect(processAttackSpy).not.toHaveBeenCalled();

        const targetSent = targetSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        expect(targetSent.find((m: any) => m.type === 'player_damaged')).toBeUndefined();
    });

    it('should not damage monster when attacker is out of melee range', () => {
        const attackerSocket = createMockSocket();
        const attackerId = 'p_attacker';
        const mobId = 'mob_rat_1';

        vi.spyOn(collision, 'getSpawns').mockReturnValue([
            {
                id: mobId,
                name: 'Rat',
                x: 10,
                y: 15,
                z: 0,
                type: 'monster',
            },
        ]);

        vi.spyOn(creaturePresets, 'getStats').mockReturnValue({
            maxHealth: 30,
            defense: 4,
            attack: 10,
            attackSpeed: 1800,
            xpReward: 25,
            race: 'beast',
            loot: [],
        });

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        const processAttackSpy = vi.spyOn(combatModule, 'processAttack');

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: mobId,
        });

        expect(processAttackSpy).not.toHaveBeenCalled();

        const attackerSent = attackerSocket.send.mock.calls.map((call: any) => JSON.parse(call[0]));
        expect(attackerSent.find((m: any) => m.type === 'creature_damaged')).toBeUndefined();
        expect(attackerSent.find((m: any) => m.type === 'attack_miss')).toMatchObject({
            type: 'attack_miss',
            creatureId: mobId,
            code: 'NOT_ADJACENT',
        });
    });

    it('should initialize player health from ticket if valid', () => {
        const socket = createMockSocket();
        const playerId = 'p_test_health';

        // Mock verified ticket with health using spyOn
        const ticketPayload = {
            characterId: 'char-123',
            accountId: 'acc-123',
            name: 'TestPlayer',
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            direction: 'south' as const,
            level: 5,
            experience: 1000,
            exp: 1000,
            health: 45, // Meia vida
        };

        vi.spyOn(enterTicketModule, 'verifyEnterTicket').mockReturnValue(ticketPayload);

        room.handleMessage(socket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'TestPlayer',
            playerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
            enterTicket: 'mocked-ticket-sig',
        });

        const playerObj = (room as any).players.get(playerId);
        expect(playerObj).toBeDefined();
        expect(playerObj.health).toBe(45);
    });

    it('should apply XP penalty on death if outside PvP Arena', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        // Target joins with high level / experience
        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
            level: 10,
            experience: 10000,
        });

        const targetObj = (room as any).players.get(targetId);
        targetObj.health = 1; // set low health to ensure death on first hit

        // Mock open zone
        vi.spyOn(collision, 'getZoneIdAt').mockReturnValue(0); // Normal zone

        // Mock killing blow
        vi.spyOn(combatModule, 'processAttack').mockReturnValue({
            rawDamage: 10,
            blockedDamage: 0,
            finalDamage: 10,
            isDead: true,
        });

        // Trigger attack
        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        // Target health should be restored, but experience should drop by 10% (10000 -> 9000)
        expect(targetObj.health).toBe(targetObj.maxHealth);
        expect(targetObj.experience).toBe(9000);
    });

    it('should NOT apply XP penalty on death if inside PvP Arena', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
            level: 10,
            experience: 10000,
        });

        const targetObj = (room as any).players.get(targetId);
        targetObj.health = 1;

        // Mock PVP Arena zone (ZoneType.PVP_ARENA = 3)
        vi.spyOn(collision, 'getZoneIdAt').mockReturnValue(3);

        // Mock killing blow
        vi.spyOn(combatModule, 'processAttack').mockReturnValue({
            rawDamage: 10,
            blockedDamage: 0,
            finalDamage: 10,
            isDead: true,
        });

        // Trigger attack
        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        // Target health restored, experience stays exactly 10000 (no loss)
        expect(targetObj.health).toBe(targetObj.maxHealth);
        expect(targetObj.experience).toBe(10000);
    });

    it('should broadcast player_respawned with spawn coordinates on PvP death', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
        });

        const targetObj = (room as any).players.get(targetId);
        targetObj.health = 1;

        vi.spyOn(collision, 'getZoneIdAt').mockReturnValue(0);
        vi.spyOn(combatModule, 'processAttack').mockReturnValue({
            rawDamage: 10,
            blockedDamage: 0,
            finalDamage: 10,
            isDead: true,
        });

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        expect(targetObj.tileX).toBe(50);
        expect(targetObj.tileY).toBe(50);
        expect(targetObj.z).toBe(0);
        expect(targetObj.health).toBe(targetObj.maxHealth);

        const attackerMessages = attackerSocket.send.mock.calls.map((c: any) => JSON.parse(c[0]));
        const respawnMsg = attackerMessages.find((m: any) => m.type === 'player_respawned');
        expect(respawnMsg).toBeDefined();
        expect(respawnMsg.playerId).toBe(targetId);
        expect(respawnMsg.tileX).toBe(50);
        expect(respawnMsg.tileY).toBe(50);
        expect(respawnMsg.z).toBe(0);
        expect(respawnMsg.health).toBe(targetObj.maxHealth);
    });

    it('should recalculate maxHealth after level down on PvP death', () => {
        const attackerSocket = createMockSocket();
        const targetSocket = createMockSocket();

        const attackerId = 'p_attacker';
        const targetId = 'p_target';

        room.handleMessage(attackerSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Attacker',
            playerId: attackerId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 10,
            z: 0,
        });

        room.handleMessage(targetSocket, {
            type: 'join',
            v: PROTOCOL_VERSION,
            name: 'Target',
            playerId: targetId,
            mapId: 'mainland',
            tileX: 10,
            tileY: 11,
            z: 0,
            level: 10,
            experience: 8100,
        });

        const targetObj = (room as any).players.get(targetId);
        const maxHealthBeforeDeath = targetObj.maxHealth;
        targetObj.health = 1;

        vi.spyOn(collision, 'getZoneIdAt').mockReturnValue(0);
        vi.spyOn(combatModule, 'processAttack').mockReturnValue({
            rawDamage: 10,
            blockedDamage: 0,
            finalDamage: 10,
            isDead: true,
        });

        room.handleMessage(attackerSocket, {
            type: 'attack',
            v: PROTOCOL_VERSION,
            mapId: 'mainland',
            creatureId: targetId,
        });

        expect(targetObj.level).toBeLessThan(10);
        expect(targetObj.maxHealth).toBeLessThan(maxHealthBeforeDeath);
        expect(targetObj.health).toBe(targetObj.maxHealth);

        const targetMessages = targetSocket.send.mock.calls.map((c: any) => JSON.parse(c[0]));
        const progressMsg = targetMessages.find((m: any) => m.type === 'player_progress');
        expect(progressMsg).toBeDefined();
        expect(progressMsg.maxHealth).toBe(targetObj.maxHealth);
        expect(progressMsg.health).toBe(targetObj.maxHealth);
    });
});

