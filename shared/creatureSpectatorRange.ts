import type { CreatureSnapshot, PlayerSnapshot } from './protocol.js';

/** OTCv8 / Tibia client viewport — alinhado a `Map::clientMap*` no servidor OTC. */
export const CREATURE_AWARE_WIDTH = 25;
export const CREATURE_AWARE_HEIGHT = 20;
export const CREATURE_AWARE_LEFT = 12;
export const CREATURE_AWARE_RIGHT = 12;
export const CREATURE_AWARE_TOP = 9;
export const CREATURE_AWARE_BOTTOM = 10;

export interface SpectatorTile {
    tileX: number;
    tileY: number;
    z: number;
}

export interface SpectatorViewer extends SpectatorTile {}

/** Jogador enxerga o tile do evento (mesmo andar, retângulo 25×20 centrado no viewer). */
export function isTileInSpectatorRange(viewer: SpectatorViewer, event: SpectatorTile): boolean {
    return isTileInCreatureSpectatorRange(viewer, event);
}

/** @deprecated Alias — preferir `isTileInSpectatorRange`. */
export function isTileInCreatureSpectatorRange(
    viewer: SpectatorViewer,
    event: SpectatorTile
): boolean {
    if (viewer.z !== event.z) return false;
    const dx = event.tileX - viewer.tileX;
    const dy = event.tileY - viewer.tileY;
    return (
        dx >= -CREATURE_AWARE_LEFT &&
        dx <= CREATURE_AWARE_RIGHT &&
        dy >= -CREATURE_AWARE_TOP &&
        dy <= CREATURE_AWARE_BOTTOM
    );
}

export function filterCreatureSnapshotsForViewer<T extends CreatureSnapshot>(
    viewer: SpectatorViewer,
    creatures: readonly T[]
): T[] {
    return creatures.filter((c) =>
        isTileInSpectatorRange(viewer, {
            tileX: c.tileX,
            tileY: c.tileY,
            z: c.z,
        })
    );
}

export function filterPlayerSnapshotsForViewer<T extends Pick<PlayerSnapshot, 'tileX' | 'tileY' | 'z'>>(
    viewer: SpectatorViewer,
    players: readonly T[]
): T[] {
    return players.filter((p) =>
        isTileInSpectatorRange(viewer, {
            tileX: p.tileX,
            tileY: p.tileY,
            z: p.z,
        })
    );
}

/** Algum jogador enxerga o tile da criatura (retângulo 25×20 OTC). */
export function creatureHasPlayerInAwareRange(
    creature: SpectatorTile,
    players: readonly SpectatorTile[]
): boolean {
    return players.some((p) => isTileInSpectatorRange(p, creature));
}
