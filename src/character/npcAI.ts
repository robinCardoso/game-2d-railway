export interface NpcAIController {
    tickNpcAI(options: {
        nowMs: number;
        npcs: any[];
        player: any;
        TILE_SIZE_SCREEN: number;
        MAP_SIZE: number;
        isEntityAtTile: (tx: number, ty: number, z: number, excludeId?: string) => boolean;
        queryWalkable: (context: any, x: number, y: number, z: number) => any;
        createCollisionContext: () => any;
    }): void;
}

let lastNpcMoveTime = 0;

export const NpcAI: NpcAIController = {
    tickNpcAI(options) {
        const {
            nowMs,
            npcs,
            player,
            TILE_SIZE_SCREEN,
            MAP_SIZE,
            isEntityAtTile,
            queryWalkable,
            createCollisionContext
        } = options;

        npcs.forEach(npc => {
            // 1. VERIFICAÇÃO DE PROXIMIDADE DO JOGADOR (Interação)
            const dxToPlayer = player.tileX - npc.tileX;
            const dyToPlayer = player.tileY - npc.tileY;
            const distToPlayer = Math.abs(dxToPlayer) + Math.abs(dyToPlayer);
            
            const isNearPlayer = (distToPlayer <= 1.5 && player.worldZ === npc.worldZ);

            if (isNearPlayer) {
                // Se o jogador estiver muito perto, o NPC para e olha na direção dele!
                if (npc.animController.currentState === 'walk') {
                    npc.setState('idle');
                }
                
                // Determina a direção olhando para o jogador
                if (Math.abs(dxToPlayer) > Math.abs(dyToPlayer)) {
                    npc.setDirection(dxToPlayer > 0 ? 'right' : 'left');
                } else {
                    npc.setDirection(dyToPlayer > 0 ? 'down' : 'up');
                }

                // Fala aleatoriamente se ainda não estiver falando
                if (!npc.dialogueText && Math.random() < 0.005) {
                    const phrases = [
                        "Olá, aventureiro!",
                        "Belo dia para explorar!",
                        "Precisa de ajuda?",
                        "Aperte Espaço para atacar!",
                        "Aperte X para sentar!",
                        "Aperte H para morrer!"
                    ];
                    npc.speak(phrases[Math.floor(Math.random() * phrases.length)]);
                }
                return; // Interrompe o movimento aleatório enquanto interage
            }

            // 2. MOVIMENTAÇÃO ALEATÓRIA DENTRO DO SPAWN RADIUS
            if (nowMs - lastNpcMoveTime > 3000) {
                if (Math.random() < 0.4) { // 40% de chance de decidir andar
                    const dirs = ['up', 'down', 'left', 'right'] as const;
                    const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
                    npc.setDirection(randomDir);
                    
                    let dx = 0;
                    let dy = 0;
                    if (randomDir === 'up') dy = -1;
                    else if (randomDir === 'down') dy = 1;
                    else if (randomDir === 'left') dx = -1;
                    else if (randomDir === 'right') dx = 1;
                    
                    const newTileX = npc.tileX + dx;
                    const newTileY = npc.tileY + dy;
                    
                    // Valida se a nova coordenada está dentro do Raio Máximo (maxRadius) em relação ao Spawn Original!
                    const isWithinRadius = Math.abs(newTileX - npc.spawnX) <= npc.maxRadius &&
                                           Math.abs(newTileY - npc.spawnY) <= npc.maxRadius;
                    
                    if (isWithinRadius && newTileX >= 0 && newTileX < MAP_SIZE && newTileY >= 0 && newTileY < MAP_SIZE) {
                        const targetPixelX = newTileX * TILE_SIZE_SCREEN;
                        const targetPixelY = newTileY * TILE_SIZE_SCREEN;
                        
                        // Valida colisão de cenário AND se o tile já está ocupado por outro NPC ou pelo Jogador!
                        const isOccupied = isEntityAtTile(newTileX, newTileY, npc.worldZ, npc.id);
                        const scenarioWalkable = queryWalkable(createCollisionContext(), targetPixelX, targetPixelY, npc.worldZ).walkable;
                        
                        if (scenarioWalkable && !isOccupied) {
                            npc.tileX = newTileX;
                            npc.tileY = newTileY;
                            npc.setState('walk');
                        }
                    }
                }
            }
        });

        if (nowMs - lastNpcMoveTime > 3000) {
            lastNpcMoveTime = nowMs;
        }
        
        // Suaviza a posição física dos NPCs em direção ao tile alvo (interpolação simples)
        npcs.forEach(npc => {
            const targetWorldX = npc.tileX * TILE_SIZE_SCREEN;
            const targetWorldY = npc.tileY * TILE_SIZE_SCREEN;
            const speed = 2.5; // Pixels por frame para caminhar fluido
            
            if (npc.worldX < targetWorldX) npc.worldX = Math.min(targetWorldX, npc.worldX + speed);
            else if (npc.worldX > targetWorldX) npc.worldX = Math.max(targetWorldX, npc.worldX - speed);
            
            if (npc.worldY < targetWorldY) npc.worldY = Math.min(targetWorldY, npc.worldY + speed);
            else if (npc.worldY > targetWorldY) npc.worldY = Math.max(targetWorldY, npc.worldY - speed);
            
            if (npc.worldX === targetWorldX && npc.worldY === targetWorldY) {
                if (npc.animController.currentState === 'walk') {
                    npc.setState('idle');
                }
            } else {
                npc.setState('walk');
            }
            
            npc.update(nowMs);
        });
    }
};
