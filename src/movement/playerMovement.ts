import {
    buildMovementKeyState,
    getActiveStepFacing,
    primeMovementFacingKeys,
    resetGridMovementInputState,
    resolveSpriteDirection,
    tickGridMovement,
} from './gridMovement';

export interface PlayerMovementController {
    updateMovement(options: {
        keys: Record<string, boolean>;
        player: any;
        gridMovement: any;
        activeCharacterController: any;
        camera: { x: number; y: number };
        canvas: HTMLCanvasElement;
        TILE_SIZE_SCREEN: number;
        MAP_SIZE: number;
        ENGINE_CONFIG: any;
        editingFloor: number;
        isWalkable: (x: number, y: number, z: number) => any;
        isTerrainWalkable?: (x: number, y: number, z: number) => any;
        canCommitStepToTile?: (destTileX: number, destTileY: number, z: number) => boolean;
        isStairHoleAtTile: (tx: number, ty: number, z: number) => boolean;
        getStepDurationForTile: (tx: number, ty: number, z: number) => number;
        updateFloorButtons: () => void;
        refreshPlayerMovementSpeed: (nowMs: number) => void;
        posXEl: HTMLElement;
        posYEl: HTMLElement;
        posZEl: HTMLElement;
    }): { editingFloor: number };
    teleportPlayer(options: {
        player: any;
        gridMovement: any;
        camera: { x: number; y: number };
        canvas: HTMLCanvasElement;
        x: number;
        y: number;
        z: number;
        TILE_SIZE_SCREEN: number;
        MAP_SIZE: number;
        ENGINE_CONFIG: any;
        updateFloorButtons: () => void;
        posXEl: HTMLElement;
        posYEl: HTMLElement;
        posZEl: HTMLElement;
    }): { editingFloor: number };
}

export const PlayerMovement: PlayerMovementController = {
    updateMovement(options) {
        const nowMs = performance.now();
        const {
            keys,
            player,
            gridMovement,
            activeCharacterController,
            camera,
            canvas,
            TILE_SIZE_SCREEN,
            MAP_SIZE,
            ENGINE_CONFIG,
            updateFloorButtons,
            refreshPlayerMovementSpeed,
            posXEl,
            posYEl,
            posZEl,
        } = options;

        let editingFloor = options.editingFloor;

        if (!gridMovement.stepping) {
            refreshPlayerMovementSpeed(nowMs);
        }

        primeMovementFacingKeys(gridMovement, keys);
        const keyState = buildMovementKeyState(keys);

        // 1. Grid primeiro — novo passo/direção só após deslize anterior concluir
        const zBefore = player.worldZ;
        tickGridMovement({
            player,
            controller: gridMovement,
            nowMs,
            keys: keyState,
            deps: {
                tileSize: TILE_SIZE_SCREEN,
                mapSize: MAP_SIZE,
                minFloorZ: ENGINE_CONFIG.MIN_FLOOR_Z,
                maxFloorZ: ENGINE_CONFIG.MAX_FLOOR_Z,
                isWalkablePixels: (x, y, z) => options.isWalkable(x, y, z),
                isTerrainWalkablePixels: options.isTerrainWalkable
                    ? (x, y, z) => options.isTerrainWalkable!(x, y, z)
                    : undefined,
                canCommitStepToTile: options.canCommitStepToTile,
                isStairHoleAtTile: (tx, ty, z) => options.isStairHoleAtTile(tx, ty, z),
                getStepDurationMs: (tx, ty, z) => options.getStepDurationForTile(tx, ty, z),
            },
        });

        // 2. Sprite — face travada durante deslize; teclas novas só após concluir
        const lockedFacing = getActiveStepFacing(gridMovement);
        const spriteDir = lockedFacing ?? resolveSpriteDirection(gridMovement, keys);
        if (spriteDir) {
            const animDirMap = {
                north: 'up',
                south: 'down',
                west: 'left',
                east: 'right',
            } as const;
            activeCharacterController.setDirection(animDirMap[spriteDir]);
        }

        // 3. Transições de estados de animação baseadas no movimento do grid
        if (activeCharacterController.currentState !== 'attack' &&
            activeCharacterController.currentState !== 'cast' &&
            activeCharacterController.currentState !== 'sit' &&
            activeCharacterController.currentState !== 'dead') {
            if (gridMovement.stepping) {
                activeCharacterController.setState('walk');
            } else {
                activeCharacterController.setState('idle');
            }
        } else if (gridMovement.stepping) {
            activeCharacterController.setState('walk');
        }

        // 4. Tick de animação do sprite do player
        activeCharacterController.update(nowMs, gridMovement.stepDurationMs);

        // 5. Se o jogador mudou de andar (Z), sincroniza e atualiza o andar de edição ativo no painel
        if (player.worldZ !== zBefore) {
            editingFloor = player.worldZ;
            updateFloorButtons();
        }

        // 6. Atualização de Câmera centralizada no player com offset manual de arrasto (arredondado para evitar frestas/linhas pretas)
        const zoom = (camera as any).zoom || 1.0;
        const visibleW = canvas.width / zoom;
        const visibleH = canvas.height / zoom;
        camera.x = Math.floor(player.worldX - visibleW / 2 + ((camera as any).offsetX || 0));
        camera.y = Math.floor(player.worldY - visibleH / 2 + ((camera as any).offsetY || 0));

        // 7. Atualização do rodapé/UI de coordenadas e posições
        if (posXEl) posXEl.innerText = player.tileX.toString();
        if (posYEl) posYEl.innerText = player.tileY.toString();
        if (posZEl) posZEl.innerText = player.worldZ.toString();

        return { editingFloor };
    },

    teleportPlayer(options) {
        const {
            player,
            gridMovement,
            camera,
            canvas,
            x,
            y,
            z,
            TILE_SIZE_SCREEN,
            MAP_SIZE,
            ENGINE_CONFIG,
            updateFloorButtons,
            posXEl,
            posYEl,
            posZEl,
        } = options;

        // 1. Clampa as coordenadas inseridas para os limites físicos reais do mapa
        const clampedX = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(x)));
        const clampedY = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(y)));
        const clampedZ = Math.max(ENGINE_CONFIG.MIN_FLOOR_Z, Math.min(ENGINE_CONFIG.MAX_FLOOR_Z, Math.floor(z)));

        resetGridMovementInputState(gridMovement);

        // 2. Atualiza os dados físicos tridimensionais do jogador
        player.tileX = clampedX;
        player.tileY = clampedY;
        player.worldZ = clampedZ;

        // 3. Converte as coordenadas do tile físico em pixels de renderização do Canvas
        player.worldX = clampedX * TILE_SIZE_SCREEN;
        player.worldY = clampedY * TILE_SIZE_SCREEN;

        // Reset offsets on teleport
        if ('offsetX' in camera) (camera as any).offsetX = 0;
        if ('offsetY' in camera) (camera as any).offsetY = 0;

        // 4. Centraliza a câmera instantaneamente na nova coordenada (arredondado para evitar frestas)
        const zoom = (camera as any).zoom || 1.0;
        const visibleW = canvas.width / zoom;
        const visibleH = canvas.height / zoom;
        camera.x = Math.floor(player.worldX - visibleW / 2);
        camera.y = Math.floor(player.worldY - visibleH / 2);

        // 5. Atualiza o andar ativo na barra de andares laterais
        updateFloorButtons();

        // 6. Atualiza os textos e chips de coordenadas do rodapé
        if (posXEl) posXEl.innerText = clampedX.toString();
        if (posYEl) posYEl.innerText = clampedY.toString();
        if (posZEl) posZEl.innerText = clampedZ.toString();

        return { editingFloor: clampedZ };
    }
};
