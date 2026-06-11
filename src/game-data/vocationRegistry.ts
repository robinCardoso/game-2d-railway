import type { VocationConfig } from '../engine/character/calculateStats';
import { VOCATIONS as BUNDLED_VOCATIONS } from './default/vocations';
import { resolveApiUrl } from '../shared/apiUrl';
import { assetLoader } from './assetLoader';

const VOCATIONS_URL = '/vocations.json';

let runtimeVocations: Record<string, VocationConfig> = { ...BUNDLED_VOCATIONS };

function normalizeVocationsMap(raw: unknown): Record<string, VocationConfig> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out: Record<string, VocationConfig> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const row = value as Record<string, unknown>;
        if (typeof row.name !== 'string' || !row.baseStats || !row.growthPerLevel) continue;
        out[key] = value as VocationConfig;
    }
    return Object.keys(out).length > 0 ? out : null;
}

export function getRuntimeVocations(): Readonly<Record<string, VocationConfig>> {
    return runtimeVocations;
}

export function getVocationById(vocationId: string | undefined | null): VocationConfig {
    const id = (vocationId ?? '').trim();
    if (id && runtimeVocations[id]) return runtimeVocations[id];
    if (runtimeVocations.knight) return runtimeVocations.knight;
    const first = Object.values(runtimeVocations)[0];
    if (first) return first;
    return BUNDLED_VOCATIONS.knight;
}

export function applyRuntimeVocations(vocations: Record<string, VocationConfig>): void {
    const normalized = normalizeVocationsMap(vocations);
    if (normalized) {
        runtimeVocations = normalized;
    }
}

/** Carrega vocações de `/vocations.json` (volume ou repo); fallback = bundle estático. */
export async function loadRuntimeVocations(): Promise<Record<string, VocationConfig>> {
    try {
        let raw;
        if (assetLoader.isPackaged()) {
            raw = await assetLoader.getJson<any>('vocations.json');
        } else {
            const res = await fetch(resolveApiUrl(VOCATIONS_URL), { cache: 'no-store' });
            if (res.ok) {
                raw = await res.json();
            }
        }
        
        if (raw) {
            const normalized = normalizeVocationsMap(raw);
            if (normalized) {
                runtimeVocations = normalized;
                console.log(`[VocationRegistry] ${Object.keys(runtimeVocations).length} vocação(ões) carregada(s).`);
                return runtimeVocations;
            }
        }
    } catch (err) {
        console.warn('[VocationRegistry] Falha ao carregar vocations.json:', err);
    }

    runtimeVocations = { ...BUNDLED_VOCATIONS };
    return runtimeVocations;
}

/** Reexport para compatibilidade durante transição. */
export { BUNDLED_VOCATIONS as VOCATIONS };
