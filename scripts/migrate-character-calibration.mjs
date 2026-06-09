/**
 * Migra personagens legados para sidecar `.calibration.json` e enxuga o JSON principal.
 * Uso: npm run migrate:character-calibration
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const charactersDir = path.join(root, 'tiles', 'characters');
const CALIBRATION_SUFFIX = '.calibration.json';
const SCHEMA_VERSION = 1;

const CALIBRATION_KEYS = new Set([
    'frameWidth',
    'frameHeight',
    'offsetX',
    'offsetY',
    'gapX',
    'gapY',
    'anchorX',
    'anchorY',
    'corpseAnchorY',
    'drawScale',
    'sheetLayout',
    'defaultDirection',
    'chromaKey',
    'chromaKeyTolerance',
    'animations',
]);

function walkJsonFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            walkJsonFiles(full, files);
        } else if (entry.endsWith('.json') && !entry.endsWith(CALIBRATION_SUFFIX)) {
            files.push(full);
        }
    }
    return files;
}

function extractCalibration(config) {
    return {
        schemaVersion: SCHEMA_VERSION,
        spriteSheetUrl: config.spriteSheetUrl,
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
        offsetX: config.offsetX ?? 0,
        offsetY: config.offsetY ?? 0,
        gapX: config.gapX ?? 0,
        gapY: config.gapY ?? 0,
        anchorX: config.anchorX ?? 0,
        anchorY: config.anchorY ?? 0,
        corpseAnchorY: config.corpseAnchorY,
        drawScale: config.drawScale,
        sheetLayout: config.sheetLayout ?? 'horizontal',
        defaultDirection: config.defaultDirection ?? 'down',
        chromaKey: config.chromaKey,
        chromaKeyTolerance: config.chromaKeyTolerance,
        animations: JSON.parse(JSON.stringify(config.animations ?? {})),
        updatedAt: new Date().toISOString(),
    };
}

function stripCalibration(config) {
    const result = { ...config };
    for (const key of CALIBRATION_KEYS) {
        delete result[key];
    }
    return result;
}

function hasInlineCalibration(config) {
    return [...CALIBRATION_KEYS].some((key) => key in config);
}

function validateForMigration(config, jsonPath) {
    if (!config.spriteSheetUrl || typeof config.spriteSheetUrl !== 'string') {
        throw new Error(`spriteSheetUrl ausente em ${jsonPath}`);
    }
    if (typeof config.frameWidth !== 'number' || config.frameWidth <= 0) {
        throw new Error(`frameWidth inválido em ${jsonPath}`);
    }
    if (typeof config.frameHeight !== 'number' || config.frameHeight <= 0) {
        throw new Error(`frameHeight inválido em ${jsonPath}`);
    }
    if (!config.animations || typeof config.animations !== 'object') {
        throw new Error(`animations ausente em ${jsonPath}`);
    }
}

const jsonFiles = walkJsonFiles(charactersDir);
let created = 0;
let stripped = 0;
let skipped = 0;
let failed = 0;

for (const jsonPath of jsonFiles) {
    const calPath = jsonPath.replace(/\.json$/i, CALIBRATION_SUFFIX);
    const rel = path.relative(root, jsonPath).replace(/\\/g, '/');

    try {
        const config = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const calExists = fs.existsSync(calPath);
        const inline = hasInlineCalibration(config);

        if (!calExists) {
            validateForMigration(config, rel);
            const doc = extractCalibration(config);
            fs.writeFileSync(calPath, `${JSON.stringify(doc, null, 2)}\n`);
            created++;
            console.log(`[migrate] criado ${path.relative(root, calPath).replace(/\\/g, '/')}`);
        }

        if (inline) {
            const identity = stripCalibration(config);
            fs.writeFileSync(jsonPath, `${JSON.stringify(identity, null, 2)}\n`);
            stripped++;
            console.log(`[migrate] enxugado ${rel}`);
        } else if (calExists) {
            skipped++;
        }
    } catch (err) {
        failed++;
        console.error(`[migrate] falha em ${rel}:`, err instanceof Error ? err.message : err);
    }
}

console.log(
    `[migrate] concluído — sidecars criados: ${created}, JSON enxugados: ${stripped}, já ok: ${skipped}, falhas: ${failed}`
);
process.exit(failed > 0 ? 1 : 0);
