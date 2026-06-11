import type { WebSocket } from 'ws';
import type { MobLootEntry } from '../../../src/game-data/mobPresetTypes.js';
import { applyAutolootGrants } from '../../../shared/inventoryAutoloot.js';
import {
    createEmptyInventory,
    type CharacterInventoryDocument,
} from '../../../shared/inventory.js';
import { rollMobLoot } from '../../../shared/mobLoot.js';
import type { ServerMessage } from '../../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../../shared/protocol.js';
import {
    buildServerChatBroadcast,
    sendChatToPlayers,
} from '../chat/chatService.js';
import {
    getCharacterInventory,
    replaceCharacterInventory,
} from '../db/repositories/inventory.repo.js';
import { isDatabaseConfigured } from '../db/pool.js';
import {
    getDevCharacterInventory,
    setDevCharacterInventory,
} from './devInventoryStore.js';
import type { ConnectedPlayer } from '../gameRoom/types.js';
import { loadServerItemCatalog } from './itemCatalogStore.js';

export interface GrantAutolootContext {
    send: (socket: WebSocket, message: ServerMessage) => void;
}

function formatGrantLabel(itemId: string, quantity: number, itemName?: string): string {
    const label = itemName ?? itemId;
    return quantity > 1 ? `${quantity}× ${label}` : label;
}

function aggregateGrants(grants: { itemId: string; quantity: number }[]): { itemId: string; quantity: number }[] {
    const totals = new Map<string, number>();
    for (const row of grants) {
        totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity);
    }
    return [...totals.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function buildLootChatText(
    granted: { itemId: string; quantity: number }[],
    overflow: { itemId: string; quantity: number }[]
): string | null {
    const catalog = loadServerItemCatalog();
    const byId = new Map(catalog.items.map((i) => [i.id, i]));

    const merged = aggregateGrants(granted);
    if (merged.length === 0 && overflow.length === 0) return null;

    const parts: string[] = [];
    for (const row of merged) {
        const name = byId.get(row.itemId)?.name;
        parts.push(formatGrantLabel(row.itemId, row.quantity, name));
    }

    if (parts.length === 0) return null;

    let text = `Você recebeu: ${parts.join(', ')}.`;
    if (overflow.length > 0) {
        text += ' (Mochila cheia — parte do loot foi perdida.)';
    }
    return text;
}

async function persistAutolootInventory(
    player: ConnectedPlayer,
    inventory: ReturnType<typeof applyAutolootGrants>['inventory']
): Promise<CharacterInventoryDocument | null> {
    if (!player.characterId) return null;

    if (!isDatabaseConfigured()) {
        return setDevCharacterInventory(player.characterId, inventory);
    }
    if (!player.accountId) return null;

    return replaceCharacterInventory(player.characterId, player.accountId, inventory);
}

/** Rola loot do mob e adiciona à mochila (autoloot autoritativo). */
export async function grantMobAutoloot(
    player: ConnectedPlayer,
    lootTable: MobLootEntry[],
    ctx: GrantAutolootContext
): Promise<void> {
    if (!player.characterId) return;

    const rolled = rollMobLoot(lootTable);
    if (rolled.length === 0) return;

    const catalog = loadServerItemCatalog();
    const current = isDatabaseConfigured()
        ? ((await getCharacterInventory(player.characterId, player.accountId!)) ??
              createEmptyInventory())
        : getDevCharacterInventory(player.characterId);

    const { inventory, granted, overflow } = applyAutolootGrants(current, rolled, catalog);
    if (granted.length === 0) {
        if (rolled.length > 0 && catalog.items.length === 0) {
            console.error(
                '[grantMobAutoloot] Loot rolado mas catálogo vazio — verifique item_catalog.json no volume.'
            );
        }
        return;
    }

    const saved = await persistAutolootInventory(player, inventory);
    if (!saved) return;

    ctx.send(player.socket, {
        type: 'inventory_updated',
        v: PROTOCOL_VERSION,
        playerId: player.id,
        inventory: saved,
    });

    const chatText = buildLootChatText(granted, overflow);
    if (chatText) {
        const broadcast = buildServerChatBroadcast('loot', chatText, 'loot', Date.now());
        sendChatToPlayers(
            [
                {
                    id: player.id,
                    name: player.name,
                    mapId: player.mapId,
                    instanceId: player.instanceId,
                    tileX: player.tileX,
                    tileY: player.tileY,
                    z: player.z,
                    socket: player.socket,
                },
            ],
            broadcast
        );
    }
}
