/**
 * Gera ícones PNG 32×32 para a hotbar de magias.
 * Uso: node scripts/generate-spell-icon-sprites.mjs [--update-catalog]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tiles', 'effects', 'spells', 'icons');
const CATALOG_PATH = path.join(ROOT, 'public', 'spell_catalog.json');
const SIZE = 32;

const GROUP_COLORS = {
    attack: { r: 220, g: 72, b: 48 },
    healing: { r: 56, g: 190, b: 120 },
    support: { r: 96, g: 148, b: 230 },
};

const DAMAGE_TINT = {
    melee: { r: 200, g: 200, b: 210 },
    magic: { r: 140, g: 90, b: 220 },
    distance: { r: 90, g: 170, b: 90 },
    healing: { r: 80, g: 220, b: 140 },
};

function setPixel(png, x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (SIZE * y + x) << 2;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
}

function fillCircle(png, cx, cy, radius, r, g, b) {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const dx = x - cx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= radius * radius) {
                setPixel(png, x, y, r, g, b);
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

function iconPathForId(spellId) {
    return `/tiles/effects/spells/icons/${spellId}.png`;
}

function colorForSpell(spell) {
    const group = GROUP_COLORS[spell.group] ?? GROUP_COLORS.attack;
    const dmg = spell.damage?.type;
    const tint = dmg ? DAMAGE_TINT[dmg] : null;
    if (!tint) return group;
    return {
        r: Math.round((group.r + tint.r) / 2),
        g: Math.round((group.g + tint.g) / 2),
        b: Math.round((group.b + tint.b) / 2),
    };
}

function drawIcon(spell) {
    const png = new PNG({ width: SIZE, height: SIZE });
    const base = colorForSpell(spell);
    const cx = 16;
    const cy = 16;

    fillCircle(png, cx, cy, 14, 18, 14, 28, 255);
    drawRing(png, cx, cy, 12, base.r, base.g, base.b, 2);
    fillCircle(png, cx, cy, 8, base.r, base.g, base.b);

    const highlight = {
        r: Math.min(255, base.r + 50),
        g: Math.min(255, base.g + 50),
        b: Math.min(255, base.b + 50),
    };
    fillCircle(png, cx - 4, cy - 4, 3, highlight.r, highlight.g, highlight.b);

    return png;
}

function loadCatalog() {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    return Array.isArray(raw.spells) ? raw.spells : [];
}

const updateCatalog = process.argv.includes('--update-catalog');
const spells = loadCatalog();

fs.mkdirSync(OUT_DIR, { recursive: true });

let wrote = 0;
for (const spell of spells) {
    if (!spell?.id || typeof spell.id !== 'string') continue;
    const id = spell.id.trim();
    if (!id) continue;
    const outPath = path.join(OUT_DIR, `${id}.png`);
    const png = drawIcon(spell);
    fs.writeFileSync(outPath, PNG.sync.write(png));
    wrote += 1;
    if (updateCatalog) {
        spell.icon = iconPathForId(id);
    }
}

if (updateCatalog) {
    fs.writeFileSync(
        CATALOG_PATH,
        JSON.stringify({ spells }, null, 2) + '\n'
    );
}

console.log(`Done — ${wrote} ícone(s) em tiles/effects/spells/icons/`);
if (updateCatalog) {
    console.log('spell_catalog.json atualizado com paths PNG.');
}
