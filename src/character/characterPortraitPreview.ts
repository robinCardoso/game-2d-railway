import { resolveAnimationSourceRect } from './sheetFrameLayout';
import { fetchCharacterConfigMerged } from './characterCalibrationLoader';
import { resolveApiUrl } from '../shared/apiUrl';

interface PortraitConfig {
    frameWidth: number;
    frameHeight: number;
    offsetX?: number;
    offsetY?: number;
    gapX?: number;
    gapY?: number;
    sheetLayout?: 'horizontal' | 'vertical';
    chromaKey?: boolean;
    chromaKeyTolerance?: number;
    animations: Record<string, { row: number; startFrame?: number; frames?: number }>;
}

/**
 * Desenha preview estático do personagem (frame sul idle/walk) em um canvas.
 * Usado por roster, criação e HUD do Play.
 */
export async function drawCharacterPortraitPreview(
    canvas: HTMLCanvasElement,
    spriteSheetUrl: string
): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cleanPath = spriteSheetUrl.replace(/^\//, '');
    let config: PortraitConfig | null = null;
    try {
        config = (await fetchCharacterConfigMerged(spriteSheetUrl)) as PortraitConfig | null;
    } catch (e) {
        console.warn('[characterPortraitPreview] Config indisponível:', e);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
    });
    img.src = resolveApiUrl('/' + cleanPath);
    if (!(await loaded)) return;

    const frameWidth = config?.frameWidth ?? 32;
    const frameHeight = config?.frameHeight ?? 32;
    const offsetX = config?.offsetX ?? 0;
    const offsetY = config?.offsetY ?? 0;
    const gapX = config?.gapX ?? 0;
    const gapY = config?.gapY ?? 0;
    const useChromaKey = config?.chromaKey ?? false;
    const tolerance = config?.chromaKeyTolerance ?? 50;
    const sheetLayout = config?.sheetLayout ?? 'horizontal';

    const rawAnim = config?.animations?.['idle_down'] || config?.animations?.['walk_down'];
    const anim = {
        row: rawAnim?.row ?? 0,
        startFrame: rawAnim?.startFrame ?? 0,
        frames: rawAnim?.frames ?? 1,
        speedFps: 5,
        loop: true,
    };

    const { sx, sy } = resolveAnimationSourceRect(
        {
            name: '',
            spriteSheetUrl: '',
            frameWidth,
            frameHeight,
            defaultDirection: 'down',
            animations: {},
            offsetX,
            offsetY,
            gapX,
            gapY,
            sheetLayout,
        },
        anim,
        0,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.floor(Math.min(canvas.width / frameWidth, canvas.height / frameHeight));
    const drawW = frameWidth * scale;
    const drawH = frameHeight * scale;
    const drawX = Math.floor((canvas.width - drawW) / 2);
    const drawY = Math.floor((canvas.height - drawH) / 2);

    if (useChromaKey) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameWidth;
        tempCanvas.height = frameHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.drawImage(img, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            const imgData = tempCtx.getImageData(0, 0, frameWidth, frameHeight);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                if (r >= 255 - tolerance && g <= tolerance && b >= 255 - tolerance) {
                    d[i + 3] = 0;
                }
            }
            tempCtx.putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
        }
    } else {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
    }
}
