import type { SpectatorTile } from '../../../shared/creatureSpectatorRange.js';
import type { ServerMessage } from '../../../shared/protocol.js';

/** Envia evento de criatura só para jogadores no aware range (OTCv8 25×20). */
export type BroadcastCreatureEvent = (
    room: string,
    creatureId: string,
    message: ServerMessage,
    eventTile?: SpectatorTile
) => void;
