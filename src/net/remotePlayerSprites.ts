import type { PlayerSnapshot } from '../../shared/protocol';
import { SpriteAnimationController } from '../character/spriteAnimation';
import {
    loadOutfitSpriteConfig,
    protocolDirectionToSprite,
} from '../world/playerAppearance';

/**
 * Controladores visuais dos jogadores remotos — carrega sprite uma vez por spriteSheetUrl.
 */
export class RemotePlayerSpriteManager {
    private readonly controllers = new Map<string, SpriteAnimationController>();
    private readonly loading = new Set<string>();

    sync(players: PlayerSnapshot[]): void {
        const activeIds = new Set<string>();
        for (const player of players) {
            activeIds.add(player.playerId);
            void this.ensurePlayer(player);
        }
        for (const id of this.controllers.keys()) {
            if (!activeIds.has(id)) {
                this.controllers.delete(id);
            }
        }
    }

    get(playerId: string): SpriteAnimationController | undefined {
        return this.controllers.get(playerId);
    }

    tick(nowMs: number): void {
        for (const ctrl of this.controllers.values()) {
            ctrl.update(nowMs);
        }
    }

    clear(): void {
        this.controllers.clear();
        this.loading.clear();
    }

    private async ensurePlayer(player: PlayerSnapshot): Promise<void> {
        if (!player.appearance) return;
        if (this.loading.has(player.playerId)) return;

        const existing = this.controllers.get(player.playerId);
        const sheet = player.appearance.spriteSheetUrl;
        if (existing && existing.config.spriteSheetUrl.replace(/^\//, '') === sheet.replace(/^\//, '')) {
            existing.setDirection(protocolDirectionToSprite(player.direction));
            return;
        }

        this.loading.add(player.playerId);
        try {
            const config = await loadOutfitSpriteConfig(player.appearance, player.name);
            const ctrl = new SpriteAnimationController(config);
            ctrl.setDirection(protocolDirectionToSprite(player.direction));
            this.controllers.set(player.playerId, ctrl);
        } catch (err) {
            console.warn('[RemotePlayerSprites] falha ao carregar outfit:', player.name, err);
        } finally {
            this.loading.delete(player.playerId);
        }
    }
}
