import { ENGINE_CONFIG } from '../engine/config';
import { SpriteAnimationController, CharacterSpriteConfig, CharacterState, Direction } from './spriteAnimation';
import { getSpriteTilePlacement } from './spriteDraw';
import type { MobLootEntry, MobRace } from '../game-data/mobPresetTypes';
import {
    createFloatingDamageEntry,
    createFloatingXpEntry,
    drawFloatingDamages,
    pruneFloatingDamages,
    type FloatingDamageEntry,
} from '../game/floatingCombatText';

export class GameEntity {
    id: string;
    name: string;
    tileX: number;
    tileY: number;
    worldX: number = 0;
    worldY: number = 0;
    worldZ: number;
    animController: SpriteAnimationController;
    type: 'monster' | 'npc';

    spawnX: number;
    spawnY: number;
    maxRadius: number = 3;
    dialogueText: string | null = null;
    dialogueTimer: number = 0;
    private floatingDamages: FloatingDamageEntry[] = [];

    combatMaxHealth = 0;
    combatHealth = 0;
    combatDefense = 0;
    combatAttack = 0;
    combatAttackSpeed = 1600;
    xpReward = 0;
    race: MobRace = 'beast';
    lootTable: MobLootEntry[] = [];
    isDead = false;
    /** Timestamp performance.now() quando morreu. */
    deathAtMs?: number;
    /** Corpo some da tela após animação / tempo mínimo. */
    corpseVisibleUntilMs?: number;
    /** Respawn local (offline) ou espelho do servidor (online). */
    respawnAtMs?: number;
    /** Corpo já removido visualmente; entidade aguarda respawn lógico. */
    corpseHidden = false;
    isChasing = false;
    lastAggroMoveTime = 0;
    lastSeenPlayerTileX?: number;
    lastSeenPlayerTileY?: number;
    reactAfterMs?: number;
    wakeUntilMs?: number;
    /** Tile reservado durante deslize (rede ou animação local). */
    stepDestTileX?: number;
    stepDestTileY?: number;

    constructor(
        id: string,
        name: string,
        config: CharacterSpriteConfig,
        tileX: number,
        tileY: number,
        z: number,
        maxRadius = 3,
        type: 'monster' | 'npc' = 'npc',
        tileSize: number = ENGINE_CONFIG.TILE_SIZE
    ) {
        this.id = id;
        this.name = name;
        this.tileX = tileX;
        this.tileY = tileY;
        this.spawnX = tileX;
        this.spawnY = tileY;
        this.maxRadius = maxRadius;
        this.syncWorldToTile(tileSize);
        this.worldZ = z;
        this.type = type;
        this.animController = new SpriteAnimationController(config);
    }

    /** Alinha posição em pixels ao tile lógico (grid fixo; sprite pode ser maior/menor). */
    syncWorldToTile(tileSize: number = ENGINE_CONFIG.TILE_SIZE): void {
        this.worldX = this.tileX * tileSize;
        this.worldY = this.tileY * tileSize;
    }

    /** Tile do pé — usa posição visual (worldX/Y), não tile lógico adiantado pela rede. */
    getFootTile(tileSize: number = ENGINE_CONFIG.TILE_SIZE): { tileX: number; tileY: number } {
        return {
            tileX: Math.floor(this.worldX / tileSize),
            tileY: Math.floor(this.worldY / tileSize),
        };
    }

    /** Tiles que bloqueiam movimento (pé + destino do deslize + tile lógico pendente). */
    getOccupiedTiles(tileSize: number = ENGINE_CONFIG.TILE_SIZE): Array<{ tileX: number; tileY: number }> {
        const seen = new Set<string>();
        const out: Array<{ tileX: number; tileY: number }> = [];
        const add = (tileX: number, tileY: number) => {
            const key = `${tileX},${tileY}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ tileX, tileY });
        };

        const foot = this.getFootTile(tileSize);
        add(foot.tileX, foot.tileY);

        const atLogical =
            Math.abs(this.worldX - this.tileX * tileSize) < 0.5 &&
            Math.abs(this.worldY - this.tileY * tileSize) < 0.5;
        if (!atLogical) {
            add(this.tileX, this.tileY);
        }

        if (this.stepDestTileX !== undefined && this.stepDestTileY !== undefined) {
            add(this.stepDestTileX, this.stepDestTileY);
        }

        return out;
    }

    occupiesTile(tx: number, ty: number, z: number, tileSize: number = ENGINE_CONFIG.TILE_SIZE): boolean {
        if (this.worldZ !== z || this.isDead) return false;
        return this.getOccupiedTiles(tileSize).some((t) => t.tileX === tx && t.tileY === ty);
    }

    setState(state: CharacterState) {
        this.animController.setState(state);
    }

    setDirection(dir: Direction) {
        this.animController.setDirection(dir);
    }

    speak(text: string, durationMs = 4000) {
        this.dialogueText = text;
        this.dialogueTimer = performance.now() + durationMs;
    }

    /** Número de dano flutuante (sobe e some) — não usa balão de fala. */
    spawnFloatingDamage(damage: number, nowMs: number = performance.now()): void {
        this.floatingDamages = pruneFloatingDamages(this.floatingDamages, nowMs);
        this.floatingDamages.push(
            createFloatingDamageEntry(damage, nowMs, this.floatingDamages.length)
        );
    }

    /** XP ganho — mesmo estilo do dano (fonte + contorno), verde, sem balão. */
    spawnFloatingXp(xp: number, nowMs: number = performance.now()): void {
        if (xp <= 0) return;
        this.floatingDamages = pruneFloatingDamages(this.floatingDamages, nowMs);
        this.floatingDamages.push(
            createFloatingXpEntry(xp, nowMs, this.floatingDamages.length)
        );
    }

    initCombatStats(stats: {
        maxHealth: number;
        defense: number;
        attack: number;
        attackSpeed: number;
        xpReward: number;
        race: MobRace;
        loot: MobLootEntry[];
    }): void {
        this.combatMaxHealth = stats.maxHealth;
        this.combatHealth = stats.maxHealth;
        this.combatDefense = stats.defense;
        this.combatAttack = stats.attack;
        this.combatAttackSpeed = stats.attackSpeed;
        this.xpReward = stats.xpReward;
        this.race = stats.race;
        this.lootTable = stats.loot;
        this.isDead = false;
        this.deathAtMs = undefined;
        this.corpseVisibleUntilMs = undefined;
        this.respawnAtMs = undefined;
        this.corpseHidden = false;
    }

    update(nowMs: number, movementDurationMs?: number) {
        this.animController.update(nowMs, movementDurationMs);
        
        // Limpa o balão de fala após o tempo expirar
        if (this.dialogueText && nowMs > this.dialogueTimer) {
            this.dialogueText = null;
        }

        this.floatingDamages = pruneFloatingDamages(this.floatingDamages, nowMs);
    }

    /** Retângulo de desenho com âncora de corpo quando aplicável. */
    getDrawSourceRect() {
        const rect = this.animController.getSourceRect();
        if (
            this.isDead &&
            this.animController.currentState === 'dead' &&
            this.animController.config.corpseAnchorY !== undefined
        ) {
            return { ...rect, ay: this.animController.config.corpseAnchorY };
        }
        return rect;
    }

    draw(ctx: CanvasRenderingContext2D, camera: { x: number, y: number }, tileSize: number) {
        if (!this.animController.isLoaded || !this.animController.image) return;
        const rect = this.getDrawSourceRect();
        const drawScale = this.animController.config.drawScale ?? 1;
        const zoom = (camera as { zoom?: number }).zoom || 1.0;
        const placement = getSpriteTilePlacement(
            this.worldX,
            this.worldY,
            camera.x,
            camera.y,
            tileSize,
            rect,
            drawScale,
            zoom
        );
        
        ctx.globalAlpha = 1.0;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            this.animController.image,
            rect.sx, rect.sy, rect.sw, rect.sh - 0.5,
            placement.drawX, placement.drawY,
            placement.drawW, placement.drawH
        );

        drawFloatingDamages(
            ctx,
            this.floatingDamages,
            placement.drawX + placement.drawW / 2,
            placement.drawY,
            performance.now()
        );

        // Balão de fala (NPC) — não usar para dano/XP de combate
        if (this.dialogueText) {
            ctx.font = 'bold 9px sans-serif';
            const textWidth = ctx.measureText(this.dialogueText).width;
            const paddingX = 8;
            const bubbleW = textWidth + paddingX * 2;
            const bubbleH = 16;
            
            const bx = this.worldX - camera.x + tileSize / 2 - bubbleW / 2;
            const by = this.worldY - camera.y - 24; // Acima da cabeça
            
            // Fundo escuro com borda do balão
            ctx.fillStyle = 'rgba(15, 17, 23, 0.9)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            
            ctx.beginPath();
            ctx.rect(bx, by, bubbleW, bubbleH);
            ctx.fill();
            ctx.stroke();
            
            // Desenha triângulo do balão (apontando para baixo)
            ctx.beginPath();
            ctx.moveTo(this.worldX - camera.x + tileSize / 2 - 4, by + bubbleH);
            ctx.lineTo(this.worldX - camera.x + tileSize / 2 + 4, by + bubbleH);
            ctx.lineTo(this.worldX - camera.x + tileSize / 2, by + bubbleH + 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Texto da fala
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.dialogueText, this.worldX - camera.x + tileSize / 2, by + bubbleH / 2);
        }
    }

    /** Posição de desenho do sprite (útil para nome flutuante). */
    getDrawPlacement(camera: { x: number; y: number; zoom?: number }, tileSize: number) {
        const rect = this.getDrawSourceRect();
        const drawScale = this.animController.config.drawScale ?? 1;
        const zoom = camera.zoom ?? 1;
        return getSpriteTilePlacement(
            this.worldX,
            this.worldY,
            camera.x,
            camera.y,
            tileSize,
            rect,
            drawScale,
            zoom
        );
    }
}
