/**
 * Chave de sala: `mapId` (público) ou `mapId@instanceId` (dungeon instanciada).
 */

export function buildRoomKey(mapId: string, instanceId?: string | null): string {
    const id = mapId.trim();
    if (!instanceId || instanceId.length === 0) return id;
    return `${id}@${instanceId}`;
}

export function parseRoomKey(roomKey: string): { mapId: string; instanceId?: string } {
    const at = roomKey.indexOf('@');
    if (at === -1) return { mapId: roomKey };
    return {
        mapId: roomKey.slice(0, at),
        instanceId: roomKey.slice(at + 1) || undefined,
    };
}

export function sameRoom(
    a: { mapId: string; instanceId?: string | null },
    b: { mapId: string; instanceId?: string | null }
): boolean {
    return buildRoomKey(a.mapId, a.instanceId) === buildRoomKey(b.mapId, b.instanceId);
}
