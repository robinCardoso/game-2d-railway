import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../../../shared/protocol.js';
import {
    playerUsesAuthoritativeMovement,
    shouldIgnoreLegacyMove,
} from './moveHandlers.js';

describe('playerUsesAuthoritativeMovement', () => {
    it('true quando characterId presente', () => {
        expect(playerUsesAuthoritativeMovement({ characterId: 'char_1' })).toBe(true);
    });

    it('false em dev sem personagem', () => {
        expect(playerUsesAuthoritativeMovement({ characterId: undefined })).toBe(false);
    });
});

describe('shouldIgnoreLegacyMove', () => {
    const player = { tileX: 40, tileY: 44, z: 0, characterId: undefined as string | undefined };

    it('ignora sync legado no mesmo tile sem seq/direction8 (dev)', () => {
        expect(
            shouldIgnoreLegacyMove(
                {
                    type: 'move',
                    v: PROTOCOL_VERSION,
                    mapId: 'mainland',
                    tileX: 40,
                    tileY: 44,
                    z: 0,
                },
                player
            )
        ).toBe(true);
    });

    it('não ignora passo autoritativo com seq e direction8', () => {
        expect(
            shouldIgnoreLegacyMove(
                {
                    type: 'move',
                    v: PROTOCOL_VERSION,
                    mapId: 'mainland',
                    tileX: 41,
                    tileY: 44,
                    z: 0,
                    seq: 3,
                    direction8: 'east',
                },
                player
            )
        ).toBe(false);
    });

    it('não ignora reserva de steppingDest no mesmo tile', () => {
        expect(
            shouldIgnoreLegacyMove(
                {
                    type: 'move',
                    v: PROTOCOL_VERSION,
                    mapId: 'mainland',
                    tileX: 40,
                    tileY: 44,
                    z: 0,
                    steppingDestTileX: 41,
                    steppingDestTileY: 44,
                },
                player
            )
        ).toBe(false);
    });

    it('não ignora tile diferente em dev legado', () => {
        expect(
            shouldIgnoreLegacyMove(
                {
                    type: 'move',
                    v: PROTOCOL_VERSION,
                    mapId: 'mainland',
                    tileX: 41,
                    tileY: 44,
                    z: 0,
                },
                player
            )
        ).toBe(false);
    });

    it('ignora qualquer move sem seq/direction8 em modo autoritativo', () => {
        expect(
            shouldIgnoreLegacyMove(
                {
                    type: 'move',
                    v: PROTOCOL_VERSION,
                    mapId: 'mainland',
                    tileX: 41,
                    tileY: 44,
                    z: 0,
                },
                { ...player, characterId: 'char_ticket' }
            )
        ).toBe(true);
    });
});
