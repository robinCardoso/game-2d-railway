import { filterCreatureSnapshotsForViewer } from '../../../shared/creatureSpectatorRange.js';
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
    playersVisibleToViewer: (
        viewer: Pick<ConnectedPlayer, 'tileX' | 'tileY' | 'z'>,
        room: string
    ) => PlayerSnapshot[];
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
    const lastStateHashByPlayer = new Map<string, number>();
    const lastCreatureHashByPlayer = new Map<string, number>();

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
                for (const pid of info.players) {
                    const p = ctx.getPlayerById(pid);
                    if (!p || p.socket.readyState !== p.socket.OPEN) continue;

                    const visible = ctx.playersVisibleToViewer(p, room);
                    const stateHash = hashPlayerSnapshots(visible);
                    if (lastStateHashByPlayer.get(pid) === stateHash) continue;

                    lastStateHashByPlayer.set(pid, stateHash);
                    p.socket.send(
                        JSON.stringify({
                            type: 'state_sync',
                            v: PROTOCOL_VERSION,
                            players: visible,
                        })
                    );
                }
            }

            if (sendCreature) {
                const snapshots = ctx.creatures.ensureRoom(room, info.mapId, info.instanceId);
                for (const pid of info.players) {
                    const p = ctx.getPlayerById(pid);
                    if (!p || p.socket.readyState !== p.socket.OPEN) continue;

                    const visible = filterCreatureSnapshotsForViewer(
                        { tileX: p.tileX, tileY: p.tileY, z: p.z },
                        snapshots
                    );
                    const creatureHash = hashCreatureSnapshots(visible);
                    if (lastCreatureHashByPlayer.get(pid) === creatureHash) continue;

                    lastCreatureHashByPlayer.set(pid, creatureHash);
                    p.socket.send(
                        JSON.stringify({
                            type: 'creature_sync',
                            v: PROTOCOL_VERSION,
                            mapId: info.mapId,
                            instanceId: info.instanceId,
                            creatures: visible,
                        })
                    );
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
