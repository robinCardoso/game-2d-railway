/**
 * Persistência do MAP_REGISTRY no localStorage (custom maps + overrides de builtins).
 */

export interface MapEntry {
    id: string;
    name: string;
    file: string;
    size: number;
    instanced: boolean;
    pvpEnabled?: boolean;
    description?: string;
    minLevel?: number;
}

const CUSTOM_ENTRIES_KEY = 'game2d_map_registry_custom_v1';
const OVERRIDES_KEY = 'game2d_map_registry_overrides_v1';

function isValidMapEntry(raw: unknown): raw is MapEntry {
    if (!raw || typeof raw !== 'object') return false;
    const o = raw as Record<string, unknown>;
    return (
        typeof o.id === 'string' &&
        o.id.trim().length > 0 &&
        typeof o.name === 'string' &&
        typeof o.file === 'string' &&
        Number.isFinite(o.size) &&
        typeof o.instanced === 'boolean'
    );
}

function normalizeEntry(raw: MapEntry): MapEntry | null {
    const id = raw.id.trim().slice(0, 48);
    if (!/^[a-z0-9_-]+$/.test(id)) return null;

    const size = Math.min(256, Math.max(8, Math.floor(raw.size)));
    const file = raw.file.trim().replace(/^\//, '').slice(0, 120);
    if (!file.startsWith('maps/') || file.includes('..')) return null;

    return {
        id: id,
        name: raw.name.trim().slice(0, 96) || id,
        file: file,
        size: size,
        instanced: !!raw.instanced,
        pvpEnabled: typeof raw.pvpEnabled === 'boolean' ? raw.pvpEnabled : undefined,
        description:
            typeof raw.description === 'string'
                ? raw.description.trim().slice(0, 256)
                : undefined,
        minLevel:
            Number.isFinite(raw.minLevel) && Number(raw.minLevel) >= 0
                ? Math.floor(Number(raw.minLevel))
                : undefined,
    };
}

function readJsonArray(key: string): unknown[] {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        console.warn(`[MapRegistry] Falha ao ler ${key}`);
        return [];
    }
}

function readOverrides(): Record<string, Partial<MapEntry>> {
    try {
        const raw = localStorage.getItem(OVERRIDES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Mescla entradas do localStorage no registry em memória (chamar uma vez na inicialização).
 */
export function hydrateMapRegistry(
    registry: MapEntry[],
    builtinIds: ReadonlySet<string>
): void {
    const overrides = readOverrides();
    for (const [id, partial] of Object.entries(overrides)) {
        if (!builtinIds.has(id)) continue;
        const idx = registry.findIndex((m) => m.id === id);
        if (idx === -1) continue;
        const merged = { ...registry[idx], ...partial, id: registry[idx].id };
        const normalized = normalizeEntry(merged as MapEntry);
        if (normalized) registry[idx] = normalized;
    }

    const customRaw = readJsonArray(CUSTOM_ENTRIES_KEY);
    for (const item of customRaw) {
        if (!isValidMapEntry(item)) continue;
        const normalized = normalizeEntry(item);
        if (!normalized || builtinIds.has(normalized.id)) continue;
        const existing = registry.findIndex((m) => m.id === normalized.id);
        if (existing >= 0) {
            registry[existing] = normalized;
        } else {
            registry.push(normalized);
        }
    }
}

/**
 * Grava mapas customizados e overrides de builtins no localStorage.
 */
export function persistMapRegistry(
    registry: readonly MapEntry[],
    builtinIds: ReadonlySet<string>
): void {
    try {
        const custom = registry
            .filter((e) => !builtinIds.has(e.id))
            .map((e) => ({ ...e }));
        localStorage.setItem(CUSTOM_ENTRIES_KEY, JSON.stringify(custom));

        const overrides: Record<string, Partial<MapEntry>> = {};
        for (const entry of registry) {
            if (!builtinIds.has(entry.id)) continue;
            overrides[entry.id] = {
                name: entry.name,
                file: entry.file,
                size: entry.size,
                instanced: entry.instanced,
                pvpEnabled: entry.pvpEnabled,
                description: entry.description,
                minLevel: entry.minLevel,
            };
        }
        localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    } catch (err) {
        console.warn('[MapRegistry] Não foi possível persistir no localStorage:', err);
    }
}
