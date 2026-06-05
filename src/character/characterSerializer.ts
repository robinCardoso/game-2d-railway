import type { CharacterSpriteConfig } from './spriteAnimation';

// Um preset padrão caso o usuário não tenha importado nenhum arquivo JSON de personagem
export function createDefaultCharacterConfig(): CharacterSpriteConfig {
    return {
        name: 'Default Warrior',
        spriteSheetUrl: 'tiles/characters/knight.png', // Fallback básico
        frameWidth: 64,
        frameHeight: 64,
        defaultDirection: 'down',
        animations: {
            // Se for um tile estático de 32x32, configuramos todos os estados para apontar para a única linha
            'idle_up':    { row: 0, frames: 1, speedFps: 1, loop: true },
            'idle_down':  { row: 0, frames: 1, speedFps: 1, loop: true },
            'idle_left':  { row: 0, frames: 1, speedFps: 1, loop: true },
            'idle_right': { row: 0, frames: 1, speedFps: 1, loop: true },
            
            'walk_up':    { row: 0, frames: 1, speedFps: 5, loop: true },
            'walk_down':  { row: 0, frames: 1, speedFps: 5, loop: true },
            'walk_left':  { row: 0, frames: 1, speedFps: 5, loop: true },
            'walk_right': { row: 0, frames: 1, speedFps: 5, loop: true },
            
            'attack_up':    { row: 0, frames: 1, speedFps: 5, loop: false },
            'attack_down':  { row: 0, frames: 1, speedFps: 5, loop: false },
            'attack_left':  { row: 0, frames: 1, speedFps: 5, loop: false },
            'attack_right': { row: 0, frames: 1, speedFps: 5, loop: false }
        }
    };
}

export function serializeCharacterConfig(config: CharacterSpriteConfig): string {
    return JSON.stringify(config, null, 2);
}

export function parseCharacterConfig(jsonString: string): CharacterSpriteConfig {
    const raw = JSON.parse(jsonString);
    
    // Validações básicas de campos essenciais
    if (!raw.name || typeof raw.name !== 'string') {
        throw new Error('Nome do personagem inválido ou ausente.');
    }
    if (!raw.spriteSheetUrl || typeof raw.spriteSheetUrl !== 'string') {
        throw new Error('URL da spritesheet inválida ou ausente.');
    }
    if (typeof raw.frameWidth !== 'number' || raw.frameWidth <= 0) {
        throw new Error('Largura do frame inválida.');
    }
    if (typeof raw.frameHeight !== 'number' || raw.frameHeight <= 0) {
        throw new Error('Altura do frame inválida.');
    }
    if (!raw.animations || typeof raw.animations !== 'object') {
        throw new Error('Mapeamento de animações ausente.');
    }

    if (raw.offsetX !== undefined && typeof raw.offsetX !== 'number') throw new Error('offsetX deve ser número.');
    if (raw.offsetY !== undefined && typeof raw.offsetY !== 'number') throw new Error('offsetY deve ser número.');
    if (raw.gapX !== undefined && typeof raw.gapX !== 'number') throw new Error('gapX deve ser número.');
    if (raw.gapY !== undefined && typeof raw.gapY !== 'number') throw new Error('gapY deve ser número.');
    if (raw.anchorX !== undefined && typeof raw.anchorX !== 'number') throw new Error('anchorX deve ser número.');
    if (raw.anchorY !== undefined && typeof raw.anchorY !== 'number') throw new Error('anchorY deve ser número.');
    if (raw.drawScale !== undefined && (typeof raw.drawScale !== 'number' || raw.drawScale <= 0)) {
        throw new Error('drawScale deve ser número positivo.');
    }
    if (raw.chromaKey !== undefined && typeof raw.chromaKey !== 'boolean') throw new Error('chromaKey deve ser booleano.');

    return raw as CharacterSpriteConfig;
}
