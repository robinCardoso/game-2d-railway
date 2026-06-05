/**
 * Processador de Imagem utilitário para Chroma Keying (Color Keying).
 * Remove cores de fundo sólidas (como o Rosa Magenta #FF00FF comum em Tibia/RPG Maker)
 * convertendo os pixels correspondentes em 100% transparentes na inicialização.
 */

export interface RGBAColor {
    r: number;
    g: number;
    b: number;
}

export const MAGIC_PINK: RGBAColor = { r: 255, g: 0, b: 255 }; // #FF00FF

/**
 * Remove a cor de chroma key (fundo) especificada de uma imagem e retorna uma promessa com a nova imagem limpa.
 * A operação é realizada em um Canvas temporário (offscreen) no momento do carregamento para manter
 * o desempenho de renderização da engine em 100%.
 */
export function removeChromaKey(
    imageSource: HTMLImageElement | string,
    keyColor: RGBAColor = MAGIC_PINK,
    tolerance = 25
): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            try {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.naturalWidth || img.width;
                tempCanvas.height = img.naturalHeight || img.height;
                
                const ctx = tempCanvas.getContext('2d');
                if (!ctx) {
                    resolve(img);
                    return;
                }
                
                // Desenha a imagem original no canvas temporário
                ctx.drawImage(img, 0, 0);
                
                // Extrai os dados dos pixels
                const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const { data } = imgData;
                
                // Usa a cor explícita recebida (fallback para MAGIC_PINK),
                // mantendo comportamento previsível mesmo com spritesheets heterogêneas.
                const detectedKeyColor = keyColor ?? {
                    r: data[0],
                    g: data[1],
                    b: data[2]
                };
                
                // Varre os pixels substituindo o Chroma Key por transparente
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];     // R
                    const g = data[i + 1]; // G
                    const b = data[i + 2]; // B
                    
                    // Calcula a distância Manhattan entre a cor do pixel e a cor chave detectada
                    const colorDistance = Math.abs(r - detectedKeyColor.r) + 
                                          Math.abs(g - detectedKeyColor.g) + 
                                          Math.abs(b - detectedKeyColor.b);
                    
                    if (colorDistance <= tolerance) {
                        data[i + 3] = 0; // Alpha = 0 (Totalmente Transparente)
                    }
                }
                
                // Coloca os pixels modificados de volta no canvas
                ctx.putImageData(imgData, 0, 0);
                
                // Cria e carrega a imagem final processada de alta performance
                const processedImg = new Image();
                processedImg.src = tempCanvas.toDataURL('image/png');
                processedImg.onload = () => {
                    resolve(processedImg);
                };
                processedImg.onerror = () => {
                    resolve(img); // Fallback caso ocorra falha de segurança (CORS)
                };
            } catch (err) {
                console.error('[Image Processor] Erro ao aplicar Chroma Key:', err);
                resolve(img); // Fallback seguro
            }
        };
        
        img.onerror = (e) => {
            reject(e);
        };
        
        // Define o source
        if (typeof imageSource === 'string') {
            img.src = imageSource;
        } else {
            img.src = imageSource.src;
        }
    });
}

/** Limite de pixels (~16 MP) para upscale pontual no editor sem travar o navegador. */
const UPSCALE_MAX_OUTPUT_PIXELS = 16_000_000;

/**
 * Escala pixel art por fator inteiro (2x/3x) com vizinho mais próximo (sem blur).
 * Uma passagem em canvas — adequado para spritesheets de personagem no Studio.
 */
export function upscalePixelArtDataUrl(imageSrc: string, scale: 2 | 3): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            const outW = w * scale;
            const outH = h * scale;
            if (outW * outH > UPSCALE_MAX_OUTPUT_PIXELS) {
                reject(
                    new Error(
                        `Spritesheet grande demais para ${scale}x (${outW}×${outH}). Reduza a imagem ou use fator menor.`
                    )
                );
                return;
            }
            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas 2D indisponível.'));
                return;
            }
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, outW, outH);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Erro ao carregar spritesheet.'));
        img.src = imageSrc;
    });
}
