import { ENGINE_CONFIG } from '../engine/config';
import { SpriteAnimationController, CharacterSpriteConfig, CharacterState, Direction } from './spriteAnimation';
import { getSpriteTilePlacement } from './spriteDraw';

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

    update(nowMs: number, movementDurationMs?: number) {
        this.animController.update(nowMs, movementDurationMs);
        
        // Limpa o balão de fala após o tempo expirar
        if (this.dialogueText && nowMs > this.dialogueTimer) {
            this.dialogueText = null;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: { x: number, y: number }, tileSize: number) {
        if (!this.animController.isLoaded || !this.animController.image) return;
        const rect = this.animController.getSourceRect();
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

        // Desenha balão de fala se houver texto ativo
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
        const rect = this.animController.getSourceRect();
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
