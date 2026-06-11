/**
 * Gera strips PNG (fundo magenta #FF00FF) para VFX de magia.
 * Uso: node scripts/generate-spell-cast-sprites.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'tiles', 'effects', 'spells', 'cast');

const FRAME = 64;
const MAGENTA = { r: 255, g: 0, b: 255, a: 255 };

function fillMagenta(png) {
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const i = (png.width * y + x) << 2;
            png.data[i] = MAGENTA.r;
            png.data[i + 1] = MAGENTA.g;
            png.data[i + 2] = MAGENTA.b;
            png.data[i + 3] = MAGENTA.a;
        }
    }
}

function setPixel(png, x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const i = (png.width * y + x) << 2;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
}

function drawLine(png, x0, y0, x1, y1, r, g, b, w = 2) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        for (let dy = -w; dy <= w; dy++) {
            for (let dx = -w; dx <= w; dx++) {
                if (dx * dx + dy * dy <= w * w + 1) setPixel(png, x + dx, y + dy, r, g, b);
            }
        }
    }
}

function drawEllipseOutline(png, cx, cy, rx, ry, r, g, b, thickness = 2) {
    const steps = 64;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * rx);
        const y = Math.round(cy + Math.sin(a) * ry);
        if (i > 0) drawLine(png, px, py, x, y, r, g, b, thickness);
        px = x;
        py = y;
    }
}

function drawArc(png, cx, cy, radius, start, end, r, g, b, w = 3) {
    const steps = 24;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= steps; i++) {
        const t = start + ((end - start) * i) / steps;
        const x = Math.round(cx + Math.cos(t) * radius);
        const y = Math.round(cy + Math.sin(t) * radius);
        if (i > 0) drawLine(png, px, py, x, y, r, g, b, w);
        px = x;
        py = y;
    }
}

function drawGlow(png, cx, cy, radius, r, g, b) {
    for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d > radius) continue;
            const a = Math.round((1 - d / radius) * 200);
            setPixel(png, x, y, r, g, b, a);
        }
    }
}

const SPECS = {
    knight_brutal_strike: {
        frameCount: 4,
        fps: 14,
        drawScale: 1.2,
        rotateToTarget: true,
        durationMs: 280,
        draw(frame, png, ox) {
            const cx = ox + 18;
            const cy = FRAME - 22;
            const reach = 12 + frame * 14;
            drawLine(png, cx, cy, cx + reach, cy - 6 - frame * 2, 254, 240, 138, 2);
            drawLine(png, cx + 2, cy + 1, cx + reach - 2, cy - 4 - frame * 2, 255, 255, 255, 1);
        },
    },
    knight_ground_slam: {
        frameCount: 5,
        fps: 12,
        drawScale: 1.25,
        rotateToTarget: false,
        durationMs: 520,
        draw(frame, png, ox) {
            const cx = ox + FRAME / 2;
            const cy = FRAME - 18;
            const rx = 8 + frame * 9;
            const ry = 4 + frame * 5;
            drawEllipseOutline(png, cx, cy, rx, ry, 249, 115, 22, 2);
            if (frame > 0) {
                drawEllipseOutline(png, cx, cy, rx * 0.55, ry * 0.55, 253, 186, 116, 1);
            }
            for (let i = 0; i < 4 + frame; i++) {
                const a = (i / (4 + frame)) * Math.PI * 2 + frame * 0.3;
                const d = 6 + frame * 5;
                setPixel(
                    png,
                    Math.round(cx + Math.cos(a) * d),
                    Math.round(cy + Math.sin(a) * d * 0.5),
                    120,
                    113,
                    108
                );
            }
        },
    },
    knight_front_sweep: {
        frameCount: 4,
        fps: 12,
        drawScale: 1.3,
        rotateToTarget: true,
        durationMs: 380,
        draw(frame, png, ox) {
            const cx = ox + FRAME / 2;
            const cy = FRAME - 20;
            const spread = 0.35 + frame * 0.22;
            drawArc(png, cx, cy, 28, -spread, spread, 251, 146, 60, 3);
            drawArc(png, cx, cy, 24, -spread * 0.85, spread * 0.85, 254, 243, 199, 1);
        },
    },
    melee_default: {
        frameCount: 4,
        fps: 12,
        drawScale: 1.1,
        rotateToTarget: true,
        durationMs: 300,
        draw(frame, png, ox) {
            SPECS.knight_brutal_strike.draw(frame, png, ox);
        },
    },
    magic_default: {
        frameCount: 4,
        fps: 10,
        drawScale: 1.15,
        rotateToTarget: false,
        durationMs: 420,
        draw(frame, png, ox) {
            const cx = ox + FRAME / 2;
            const cy = FRAME / 2 + 4;
            drawGlow(png, cx, cy, 8 + frame * 6, 147, 197, 253);
            drawGlow(png, cx, cy, 4 + frame * 3, 255, 255, 255);
        },
    },
};

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [id, spec] of Object.entries(SPECS)) {
    const width = FRAME * spec.frameCount;
    const png = new PNG({ width, height: FRAME });
    fillMagenta(png);
    for (let f = 0; f < spec.frameCount; f++) {
        spec.draw(f, png, f * FRAME);
    }

    const pngPath = path.join(OUT_DIR, `${id}.png`);
    fs.writeFileSync(pngPath, PNG.sync.write(png));

    const json = {
        sheetUrl: `/tiles/effects/spells/cast/${id}.png`,
        frameWidth: FRAME,
        frameHeight: FRAME,
        frameCount: spec.frameCount,
        fps: spec.fps,
        drawScale: spec.drawScale,
        rotateToTarget: spec.rotateToTarget,
        durationMs: spec.durationMs,
    };
    fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(json, null, 2) + '\n');
    console.log('wrote', id);
}

console.log('Done — tiles/effects/spells/cast/');
