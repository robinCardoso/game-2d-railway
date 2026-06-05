import { apiFetch } from '../shared/apiFetch';
import type { BorderSetCellAssignment } from './borderSetCalibratorUi';
import type { BorderMaskExport, BorderSetCalibrationPayload } from './borderSetExport';

export const BORDER_SET_OPTION_PREFIX = 'border-set:';

export interface BorderSetManifestEntry {
    id: string;
    label: string;
    fillTerrain: string;
    category: string;
    sheetFile: string;
    sheetRelativePath: string;
    calibration: Omit<BorderSetCalibrationPayload, 'borderSetCells'>;
    cells: BorderSetCellAssignment[];
    masks: Record<string, string>;
    walkable?: boolean;
}

export interface SaveBorderSetPayload {
    setId: string;
    label: string;
    fillTerrain: string;
    category: string;
    sheetBase64: string;
    calibration: BorderSetCalibrationPayload;
    masks: BorderMaskExport[];
    walkable?: boolean;
}

export async function fetchBorderSets(): Promise<BorderSetManifestEntry[]> {
    const response = await apiFetch('/api/list-auto-border-sets');
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Falha ao listar conjuntos auto-borda.');
    }
    const data = await response.json();
    return (data.sets ?? []) as BorderSetManifestEntry[];
}

export async function saveBorderSet(payload: SaveBorderSetPayload): Promise<{ setId: string }> {
    const response = await apiFetch('/api/save-border-set', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Erro ao salvar conjunto auto-borda.');
    }
    const result = await response.json();
    return { setId: result.setId as string };
}

export interface BorderSetUsageResult {
    setId: string;
    label: string;
    totalCells: number;
    maps: Array<{ mapId: string; mapFile: string; cellCount: number }>;
}

export async function fetchBorderSetUsage(setId: string): Promise<BorderSetUsageResult> {
    const response = await apiFetch(`/api/border-set-usage?setId=${encodeURIComponent(setId)}`);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Falha ao verificar uso do conjunto.');
    }
    return (await response.json()) as BorderSetUsageResult;
}

export async function deleteBorderSet(setId: string, force = false): Promise<void> {
    const response = await apiFetch(
        `/api/delete-border-set?setId=${encodeURIComponent(setId)}&force=${force ? 'true' : 'false'}`,
        { method: 'DELETE' }
    );
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Erro ao excluir conjunto auto-borda.');
    }
}

export function borderSetOptionValue(setId: string): string {
    return `${BORDER_SET_OPTION_PREFIX}${setId}`;
}

export function parseBorderSetOptionValue(value: string): string | null {
    if (!value.startsWith(BORDER_SET_OPTION_PREFIX)) return null;
    const id = value.slice(BORDER_SET_OPTION_PREFIX.length).trim();
    return id || null;
}
