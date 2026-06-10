/**
 * Gera ícones PNG 32×32 para itens do catálogo (`public/item_catalog.json`).
 * Uso: node scripts/generate-item-icon-sprites.mjs [--update-catalog]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tiles', 'items', 'icons');
const CATALOG_PATH = path.join(ROOT, 'public', 'item_catalog.json');
const SIZE = 32;

function setPixel(png, x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (SIZE * y + x) << 2;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
}

function fillRect(png, x0, y0, w, h, r, g, b, a = 255) {
    for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
            setPixel(png, x, y, r, g, b, a);
        }
    }
}

function fillCircle(png, cx, cy, radius, r, g, b, a = 255) {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const dx = x - cx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= radius * radius) {
                setPixel(png, x, y, r, g, b, a);
            }
        }
    }
}

function drawRing(png, cx, cy, radius, r, g, b, thickness = 2) {
    const outer = radius + thickness;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d >= radius && d <= outer) {
                setPixel(png, x, y, r, g, b);
            }
        }
    }
}

function drawBoot(png, x0, y0, r, g, b, highlight) {
    fillRect(png, x0, y0, 10, 14, r, g, b);
    fillRect(png, x0 - 2, y0 + 12, 14, 6, r, g, b);
    fillRect(png, x0 + 1, y0 + 2, 3, 8, highlight.r, highlight.g, highlight.b);
}

function drawCoin(png) {
    fillCircle(png, 16, 16, 13, 200, 160, 40);
    fillCircle(png, 16, 16, 10, 240, 200, 60);
    drawRing(png, 16, 16, 8, 180, 130, 20, 1);
    fillCircle(png, 13, 12, 2, 255, 230, 120);
}

function drawRingIcon(png) {
    fillCircle(png, 16, 16, 14, 28, 22, 18, 255);
    fillCircle(png, 16, 16, 9, 18, 14, 12, 255);
    drawRing(png, 16, 16, 10, 220, 180, 50, 3);
    fillCircle(png, 12, 11, 2, 255, 240, 180);
}

function drawArmor(png, r, g, b) {
    fillRect(png, 9, 8, 14, 16, r, g, b);
    fillRect(png, 7, 10, 4, 10, r, g, b);
    fillRect(png, 21, 10, 4, 10, r, g, b);
    fillRect(png, 11, 6, 10, 4, Math.min(255, r + 30), Math.min(255, g + 30), Math.min(255, b + 30));
    fillRect(png, 12, 12, 8, 2, Math.max(0, r - 40), Math.max(0, g - 40), Math.max(0, b - 40));
}

function drawHelmet(png) {
    fillRect(png, 10, 14, 12, 10, 120, 125, 135);
    for (let y = 8; y <= 14; y++) {
        const w = 6 + (14 - y);
        fillRect(png, 16 - Math.floor(w / 2), y, w, 1, 150, 155, 165);
    }
    fillRect(png, 9, 22, 14, 3, 90, 95, 105);
    fillRect(png, 12, 10, 4, 3, 190, 195, 205);
}

function drawAmulet(png) {
    drawRing(png, 16, 8, 3, 200, 180, 60, 2);
    fillRect(png, 15, 10, 2, 6, 200, 180, 60);
    fillCircle(png, 16, 20, 6, 40, 180, 90);
    fillCircle(png, 14, 18, 2, 120, 240, 150);
}

function drawPotion(png) {
    fillRect(png, 13, 10, 6, 14, 180, 50, 60);
    fillRect(png, 12, 8, 8, 3, 140, 140, 150);
    fillRect(png, 14, 7, 4, 2, 100, 100, 110);
    fillRect(png, 14, 12, 4, 8, 220, 40, 50);
    fillRect(png, 15, 13, 2, 4, 255, 100, 110);
}

function drawSword(png) {
    fillRect(png, 20, 6, 3, 18, 200, 205, 215);
    fillRect(png, 17, 22, 9, 3, 140, 90, 40);
    fillRect(png, 15, 24, 13, 2, 100, 70, 30);
    fillRect(png, 21, 7, 1, 14, 240, 245, 255);
}

function drawShield(png) {
    for (let y = 8; y < 26; y++) {
        const t = (y - 8) / 18;
        const w = Math.round(14 - Math.abs(t - 0.5) * 10);
        fillRect(png, 16 - Math.floor(w / 2), y, w, 1, 80, 110, 160);
    }
    fillRect(png, 15, 14, 2, 8, 200, 180, 60);
    fillRect(png, 12, 16, 8, 2, 200, 180, 60);
}

function drawDefaultGem(png, r, g, b) {
    fillCircle(png, 16, 16, 12, 20, 18, 28, 255);
    fillCircle(png, 16, 18, 8, r, g, b);
    fillCircle(png, 13, 15, 2, Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60));
}

function drawItemIcon(item) {
    const png = new PNG({ width: SIZE, height: SIZE });
    const id = item.id ?? '';
    const slot = item.slot ?? '';
    const category = item.category ?? 'loot';

    if (id.includes('coin') || id.includes('gold')) {
        drawCoin(png);
        return png;
    }
    if (id.includes('potion') || id.includes('flask')) {
        drawPotion(png);
        return png;
    }
    if (id.includes('sword') || id.includes('blade')) {
        drawSword(png);
        return png;
    }
    if (id.includes('shield')) {
        drawShield(png);
        return png;
    }
    if (slot === 'ring' || id.includes('ring')) {
        drawRingIcon(png);
        return png;
    }
    if (slot === 'amulet' || id.includes('amulet')) {
        drawAmulet(png);
        return png;
    }
    if (slot === 'head' || id.includes('helmet') || id.includes('hat')) {
        drawHelmet(png);
        return png;
    }
    if (slot === 'body' || id.includes('armor') || id.includes('plate')) {
        const dark = id.includes('leather');
        drawArmor(png, dark ? 120 : 90, dark ? 80 : 100, dark ? 50 : 130);
        return png;
    }
    if (slot === 'feet' || id.includes('boot')) {
        const fast = id.includes('haste');
        const base = fast ? { r: 40, g: 180, b: 200 } : { r: 110, g: 75, b: 45 };
        const hi = fast
            ? { r: 120, g: 240, b: 255 }
            : { r: 160, g: 120, b: 80 };
        drawBoot(png, 8, 8, base.r, base.g, base.b, hi);
        drawBoot(png, 16, 8, base.r, base.g, base.b, hi);
        if (fast) {
            fillRect(png, 4, 14, 3, 1, 180, 240, 255);
            fillRect(png, 2, 16, 5, 1, 180, 240, 255);
            fillRect(png, 26, 14, 3, 1, 180, 240, 255);
        }
        return png;
    }

    if (category === 'loot') {
        drawCoin(png);
        return png;
    }

    drawDefaultGem(png, 140, 100, 200);
    return png;
}

function defaultSpriteBlock(itemId) {
    return {
        iconUrl: `tiles/items/icons/${itemId}.png`,
        frameWidth: 32,
        frameHeight: 32,
        gridCols: 1,
        gridRows: 1,
    };
}

function loadCatalog() {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    return Array.isArray(raw.items) ? raw.items : [];
}

const updateCatalog = process.argv.includes('--update-catalog');
const items = loadCatalog();

fs.mkdirSync(OUT_DIR, { recursive: true });

let wrote = 0;
for (const item of items) {
    if (!item?.id || typeof item.id !== 'string') continue;
    const id = item.id.trim();
    if (!id) continue;
    const outPath = path.join(OUT_DIR, `${id}.png`);
    const png = drawItemIcon(item);
    fs.writeFileSync(outPath, PNG.sync.write(png));
    wrote += 1;

    if (updateCatalog) {
        if (!item.sprite) {
            item.sprite = defaultSpriteBlock(id);
        }
        item.implemented = true;
    }
}

if (updateCatalog) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify({ items }, null, 2) + '\n');
}

console.log(`Done — ${wrote} ícone(s) em tiles/items/icons/`);
if (updateCatalog) {
    console.log('item_catalog.json atualizado (sprite + implemented=true).');
}
