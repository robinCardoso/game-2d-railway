/**
 * serverStateStore — estado autoritativo mais recente recebido do servidor via WS.
 *
 * O GameNetClient aplica mensagens aqui ANTES de chamar callbacks para o render/game loop.
 * Isso garante que mesmo com render pausado (Electron minimizado, browser throttlado),
 * o estado seja sempre atualizado e disponível ao restaurar.
 *
 * Regra: nunca ler deste store dentro de draw() para decisões autoritativas —
 * usar callbacks injetados no GameNetClient para aplicar estado no jogo.
 * O store é fonte para diagnóstico e resync visual.
 */

import type { CreatureSnapshot, PlayerSnapshot, ServerMessage } from '../../shared/protocol';

export interface ServerStateStore {
    playersById: Map<string, PlayerSnapshot>;
    creaturesById: Map<string, CreatureSnapshot>;
    myPlayerId: string | null;
    /** performance.now() da última state_sync recebida */
    lastStateSyncAtMs: number;
    /** performance.now() da última creature_sync recebida */
    lastCreatureSyncAtMs: number;
    /** performance.now() do último player_progress recebido */
    lastProgressSyncAtMs: number;
    /** performance.now() do último pong recebido */
    lastPongAtMs: number;
    /** Último RTT medido em ms (-1 = sem medição) */
    lastPingMs: number;
}

export const serverStateStore: ServerStateStore = {
    playersById: new Map(),
    creaturesById: new Map(),
    myPlayerId: null,
    lastStateSyncAtMs: 0,
    lastCreatureSyncAtMs: 0,
    lastProgressSyncAtMs: 0,
    lastPongAtMs: 0,
    lastPingMs: -1,
};

let _pendingPingT = 0;

export function recordPingSent(t: number): void {
    _pendingPingT = t;
}

export function applyServerMessageToStore(msg: ServerMessage): void {
    const now = performance.now();

    switch (msg.type) {
        case 'welcome':
            serverStateStore.myPlayerId = msg.playerId;
            serverStateStore.playersById.clear();
            for (const p of msg.players) {
                serverStateStore.playersById.set(p.playerId, p);
            }
            if (msg.creatures) {
                serverStateStore.creaturesById.clear();
                for (const c of msg.creatures) {
                    serverStateStore.creaturesById.set(c.creatureId, c);
                }
                serverStateStore.lastCreatureSyncAtMs = now;
            }
            serverStateStore.lastStateSyncAtMs = now;
            break;

        case 'state_sync':
            serverStateStore.playersById.clear();
            for (const p of msg.players) {
                serverStateStore.playersById.set(p.playerId, p);
            }
            serverStateStore.lastStateSyncAtMs = now;
            break;

        case 'player_joined':
            serverStateStore.playersById.set(msg.player.playerId, msg.player);
            break;

        case 'player_left':
            serverStateStore.playersById.delete(msg.playerId);
            break;

        case 'player_moved': {
            const existing = serverStateStore.playersById.get(msg.playerId);
            if (existing) {
                existing.tileX = msg.tileX;
                existing.tileY = msg.tileY;
                existing.z = msg.z;
                existing.mapId = msg.mapId;
                existing.instanceId = msg.instanceId;
                if (msg.direction) existing.direction = msg.direction;
                if (msg.stepDurationMs !== undefined) {
                    existing.stepDurationMs = msg.stepDurationMs;
                }
            }
            break;
        }

        case 'creature_sync':
            serverStateStore.creaturesById.clear();
            for (const c of msg.creatures) {
                serverStateStore.creaturesById.set(c.creatureId, c);
            }
            serverStateStore.lastCreatureSyncAtMs = now;
            break;

        case 'creature_moved': {
            const c = serverStateStore.creaturesById.get(msg.creatureId);
            if (c) {
                c.tileX = msg.tileX;
                c.tileY = msg.tileY;
                c.z = msg.z;
                if (msg.direction) c.direction = msg.direction;
                if (msg.stepDurationMs !== undefined) {
                    c.stepDurationMs = msg.stepDurationMs;
                }
            }
            break;
        }

        case 'creature_damaged': {
            const c = serverStateStore.creaturesById.get(msg.creatureId);
            if (c) {
                c.health = msg.health;
                c.maxHealth = msg.maxHealth;
            }
            break;
        }

        case 'creature_died': {
            const c = serverStateStore.creaturesById.get(msg.creatureId);
            if (c) {
                c.isDead = true;
                c.tileX = msg.tileX;
                c.tileY = msg.tileY;
                c.z = msg.z;
            }
            break;
        }

        case 'creature_respawned': {
            const c = serverStateStore.creaturesById.get(msg.creatureId);
            if (c) {
                c.tileX = msg.tileX;
                c.tileY = msg.tileY;
                c.z = msg.z;
                c.health = msg.health;
                c.maxHealth = msg.maxHealth;
                c.isDead = false;
            }
            break;
        }

        case 'player_progress':
            serverStateStore.lastProgressSyncAtMs = now;
            break;

        case 'player_damaged': {
            const p = serverStateStore.playersById.get(msg.playerId);
            if (p) {
                p.health = msg.health;
                p.maxHealth = msg.maxHealth;
            }
            break;
        }

        case 'player_died': {
            const p = serverStateStore.playersById.get(msg.playerId);
            if (p) {
                p.health = 0;
            }
            break;
        }

        case 'player_respawned': {
            const p = serverStateStore.playersById.get(msg.playerId);
            if (p) {
                p.tileX = msg.tileX;
                p.tileY = msg.tileY;
                p.z = msg.z;
                p.mapId = msg.mapId;
                p.instanceId = msg.instanceId;
                p.health = msg.health;
                p.maxHealth = msg.maxHealth;
                if (msg.mana !== undefined) p.mana = msg.mana;
                if (msg.maxMana !== undefined) p.maxMana = msg.maxMana;
            }
            break;
        }

        case 'pong':
            serverStateStore.lastPongAtMs = now;
            if (_pendingPingT > 0 && msg.t === _pendingPingT) {
                serverStateStore.lastPingMs = Math.round(now - _pendingPingT);
                _pendingPingT = 0;
            }
            break;

        default:
            break;
    }
}

export function resetServerStateStore(): void {
    serverStateStore.playersById.clear();
    serverStateStore.creaturesById.clear();
    serverStateStore.myPlayerId = null;
    serverStateStore.lastStateSyncAtMs = 0;
    serverStateStore.lastCreatureSyncAtMs = 0;
    serverStateStore.lastProgressSyncAtMs = 0;
    serverStateStore.lastPongAtMs = 0;
    serverStateStore.lastPingMs = -1;
    _pendingPingT = 0;
}
