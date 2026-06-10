import { PROTOCOL_VERSION, type PlayerSnapshot } from '../../../shared/protocol.js';
import { hashCreatureSnapshots, hashPlayerSnapshots } from '../../../shared/snapshotSync.js';
import type { RoomCreatureManager } from '../game/RoomCreatureManager.js';
import type { ConnectedPlayer } from './types.js';

/** Intervalo entre state_sync periódico (ms). 0 = desabilitado. */
export const STATE_SNAPSHOT_INTERVAL_MS = Number(
    process.env['PLAYER_STATE_SNAPSHOT_INTERVAL_MS'] ?? 1000
);
/** Intervalo entre creature_sync periódico (ms). 0 = desabilitado. */
export const CREATURE_SNAPSHOT_INTERVAL_MS = Number(
    process.env['CREATURE_SNAPSHOT_INTERVAL_MS'] ?? 1000
);

export interface PeriodicSnapshotContext {
    getOnlineCount: () => number;
    getPlayers: () => Iterable<ConnectedPlayer>;
    getPlayerById: (playerId: string) => ConnectedPlayer | undefined;
    roomKey: (player: Pick<ConnectedPlayer, 'mapId' | 'instanceId'>) => string;
    playersInRoom: (room: string) => PlayerSnapshot[];
    creatures: RoomCreatureManager;
}

export function startPeriodicSnapshots(ctx: PeriodicSnapshotContext): ReturnType<typeof setInterval> | null {
    if (STATE_SNAPSHOT_INTERVAL_MS <= 0 && CREATURE_SNAPSHOT_INTERVAL_MS <= 0) return null;

    const interval = Math.min(
        STATE_SNAPSHOT_INTERVAL_MS > 0 ? STATE_SNAPSHOT_INTERVAL_MS : Infinity,
        CREATURE_SNAPSHOT_INTERVAL_MS > 0 ? CREATURE_SNAPSHOT_INTERVAL_MS : Infinity
    );

    if (!Number.isFinite(interval) || interval <= 0) return null;

    let lastStateSyncMs = 0;
    let lastCreatureSyncMs = 0;
    const lastStateHashByRoom = new Map<string, number>();
    const lastCreatureHashByRoom = new Map<string, number>();

    return setInterval(() => {
        if (ctx.getOnlineCount() === 0) return;

        const now = Date.now();

        const rooms = new Map<string, { mapId: string; instanceId?: string; players: string[] }>();
        for (const p of ctx.getPlayers()) {
            const key = ctx.roomKey(p);
            if (!rooms.has(key)) {
                rooms.set(key, { mapId: p.mapId, instanceId: p.instanceId, players: [] });
            }
            rooms.get(key)!.players.push(p.id);
        }

        const sendState =
            STATE_SNAPSHOT_INTERVAL_MS > 0 && now - lastStateSyncMs >= STATE_SNAPSHOT_INTERVAL_MS;
        const sendCreature =
            CREATURE_SNAPSHOT_INTERVAL_MS > 0 &&
            now - lastCreatureSyncMs >= CREATURE_SNAPSHOT_INTERVAL_MS;

        if (!sendState && !sendCreature) return;

        for (const [room, info] of rooms) {
            if (sendState) {
                const players = ctx.playersInRoom(room);
                const stateHash = hashPlayerSnapshots(players);
                if (lastStateHashByRoom.get(room) !== stateHash) {
                    lastStateHashByRoom.set(room, stateHash);
                    const payload = JSON.stringify({
                        type: 'state_sync',
                        v: PROTOCOL_VERSION,
                        players,
                    });
                    for (const pid of info.players) {
                        const p = ctx.getPlayerById(pid);
                        if (p && p.socket.readyState === p.socket.OPEN) {
                            p.socket.send(payload);
                        }
                    }
                }
            }

            if (sendCreature) {
                const snapshots = ctx.creatures.ensureRoom(room, info.mapId, info.instanceId);
                if (snapshots.length > 0) {
                    const creatureHash = hashCreatureSnapshots(snapshots);
                    if (lastCreatureHashByRoom.get(room) !== creatureHash) {
                        lastCreatureHashByRoom.set(room, creatureHash);
                        const payload = JSON.stringify({
                            type: 'creature_sync',
                            v: PROTOCOL_VERSION,
                            mapId: info.mapId,
                            instanceId: info.instanceId,
                            creatures: snapshots,
                        });
                        for (const pid of info.players) {
                            const p = ctx.getPlayerById(pid);
                            if (p && p.socket.readyState === p.socket.OPEN) {
                                p.socket.send(payload);
                            }
                        }
                    }
                } else {
                    lastCreatureHashByRoom.delete(room);
                }
            }
        }

        if (sendState) lastStateSyncMs = now;
        if (sendCreature) lastCreatureSyncMs = now;
    }, interval);
}

export function stopPeriodicSnapshots(timer: ReturnType<typeof setInterval> | null): void {
    if (timer) {
        clearInterval(timer);
    }
}
