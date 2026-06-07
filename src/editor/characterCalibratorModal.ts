import type { CharacterSpriteConfig } from '../character/spriteAnimation';
import { getAnimationFrameIndexAtCell } from '../character/sheetFrameLayout';
import {
    CharacterAnimationDraft,
    parseAnimationInputFields,
    type AnimationInputValues,
} from './characterAnimationDraft';
import { computeFrameDimensionsFromGrid } from './calibratorGrid';
import { createBorderSetCalibratorUi, type BorderSetCellAssignment } from './borderSetCalibratorUi';
import { inferBorderSlotGrid } from './borderSetExport';
import { previewCellForSlotCoords } from './borderNeighborSlots';
import { INNER_CORNER_4_SLOTS } from './borderNeighborSlots';
import {
    formatCombinedPreviewStatus,
    pickInnerCornerPreviewIndex,
    pickPreviewGridCell,
    renderBorderSetPreview,
    renderInnerCornerPreviewStrip,
} from './borderSetPreview';
import { toast, popup } from '../utils/popup';

export interface CalibratorOpenOptions {
    /** map: tile único; borderSet: conjunto auto-borda; character: personagem */
    mode?: 'map' | 'character' | 'borderSet';
    initialGridCols?: number;
    initialGridRows?: number;
    /** Modo borderSet: rótulo fill (ex. grass) */
    borderSetFillTerrain?: string;
    /** Células salvas ao reeditar conjunto auto-borda */
    initialBorderSetCells?: BorderSetCellAssignment[];
    initialBorderSlotCols?: number;
    initialBorderSlotRows?: number;
    /** Modo mapa: abre diálogo de exportação em lote da grade inteira */
    onBatchExport?: (result: CalibrationResult, scope: 'all' | 'selected') => void;
}

export interface CalibrationResult {
    frameWidth: number;
    frameHeight: number;
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
    anchorX: number;
    anchorY: number;
    animations: any;
    currentState: string;
    currentDirection: string;
    sheetLayout: string;
    selectedFrameCol?: number;
    selectedFrameRow?: number;
    /** Frames escolhidos no modo seleção múltipla (ordem de clique) */
    selectedFrames?: Array<{ col: number; row: number }>;
    /** Modo borderSet: máscara por célula */
    borderSetCells?: BorderSetCellAssignment[];
    gridCols?: number;
    gridRows?: number;
    borderSlotCols?: number;
    borderSlotRows?: number;
}

let activeCalibratorSession: AbortController | null = null;

export function openCharacterCalibrator(
    imageElement: HTMLImageElement,
    initialConfig: CharacterSpriteConfig,
    initialState: string,
    initialDirection: string,
    onConfirm: (result: CalibrationResult) => void,
    options?: CalibratorOpenOptions
) {
    const modal = document.getElementById('calibratorModal');
    const closeBtn = document.getElementById('calibratorClose');
    const cancelBtn = document.getElementById('calCancelBtn');
    const confirmBtn = document.getElementById('calConfirmBtn');
    const borderConfirmBtn = document.getElementById('calBorderConfirmBtn');
    const canvas = document.getElementById('calibratorCanvas') as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');

    // Elementos da Esquerda: Zoom
    const calZoomInput = document.getElementById('calZoom') as HTMLInputElement;
    const calZoomValSpan = document.getElementById('calZoomVal') as HTMLSpanElement;

    // Submenu 1: Grade de Fatiamento
    const calFrameWidthInput = document.getElementById('calFrameWidth') as HTMLInputElement;
    const calFrameHeightInput = document.getElementById('calFrameHeight') as HTMLInputElement;
    const calOffsetXInput = document.getElementById('calOffsetX') as HTMLInputElement;
    const calOffsetYInput = document.getElementById('calOffsetY') as HTMLInputElement;
    const calGapXInput = document.getElementById('calGapX') as HTMLInputElement;
    const calGapYInput = document.getElementById('calGapY') as HTMLInputElement;
    const calSheetLayoutSelect = document.getElementById('calSheetLayout') as HTMLSelectElement;

    // Submenu 2: Âncora
    const calAnchorXInput = document.getElementById('calAnchorX') as HTMLInputElement;
    const calAnchorYInput = document.getElementById('calAnchorY') as HTMLInputElement;

    // Submenu 3: Animações
    const calAnimStateSelect = document.getElementById('calAnimState') as HTMLSelectElement;
    const calAnimDirSelect = document.getElementById('calAnimDir') as HTMLSelectElement;
    const calAnimRowInput = document.getElementById('calAnimRow') as HTMLInputElement;
    const calAnimStartFrameInput = document.getElementById('calAnimStartFrame') as HTMLInputElement;
    const calAnimFramesInput = document.getElementById('calAnimFrames') as HTMLInputElement;
    const calAnimSpeedInput = document.getElementById('calAnimSpeed') as HTMLInputElement;

    const calImageSizeLabel = document.getElementById('calImageSizeLabel');
    const calGridColsInput = document.getElementById('calGridCols') as HTMLInputElement;
    const calGridRowsInput = document.getElementById('calGridRows') as HTMLInputElement;
    const calGridApplyBtn = document.getElementById('calGridApplyBtn');
    const calGrid1x1Btn = document.getElementById('calGrid1x1Btn');
    const calGrid4x4Btn = document.getElementById('calGrid4x4Btn');
    const calGridResultLabel = document.getElementById('calGridResultLabel');
    const calGridRemainderLabel = document.getElementById('calGridRemainderLabel');
    const calibratorAnimPanel = document.getElementById('calibratorAnimPanel');
    const calibratorMapFramePanel = document.getElementById('calibratorMapFramePanel');
    const calMapFrameColInput = document.getElementById('calMapFrameCol') as HTMLInputElement;
    const calMapFrameRowInput = document.getElementById('calMapFrameRow') as HTMLInputElement;
    const calMapFrameSummary = document.getElementById('calMapFrameSummary');
    const calMapFrameTotal = document.getElementById('calMapFrameTotal');
    const calibratorInstructionHint = document.getElementById('calibratorInstructionHint');
    const calBatchExportBtn = document.getElementById('calBatchExportBtn');
    const calBatchExportSelectedBtn = document.getElementById('calBatchExportSelectedBtn') as HTMLButtonElement | null;
    const calibratorBatchBtnGroup = document.getElementById('calibratorBatchBtnGroup');
    const calMapMultiSelectToggle = document.getElementById('calMapMultiSelectToggle') as HTMLInputElement | null;
    const calMapMultiSelectTools = document.getElementById('calMapMultiSelectTools');
    const calMapSelectAllBtn = document.getElementById('calMapSelectAllBtn');
    const calMapClearSelectionBtn = document.getElementById('calMapClearSelectionBtn');
    const calMapSelectionSummary = document.getElementById('calMapSelectionSummary');
    const calibratorBorderSetPanel = document.getElementById('calibratorBorderSetPanel');
    const calBorderCellList = document.getElementById('calBorderCellList');
    const calBorderSetBadge = document.getElementById('calBorderSetBadge');
    const calBorderPickHint = document.getElementById('calBorderPickHint');
    const calBorderMaskHint = document.getElementById('calBorderMaskHint');
    const calBorderPreset3x3 = document.getElementById('calBorderPreset3x3');
    const calBorderPreset4x4 = document.getElementById('calBorderPreset4x4');
    const calBorderPresetInnerL = document.getElementById('calBorderPresetInnerL');
    const calBorderPreviewCanvas = document.getElementById('calBorderPreviewCanvas') as HTMLCanvasElement | null;
    const calBorderInnerPreviewCanvas = document.getElementById(
        'calBorderInnerPreviewCanvas'
    ) as HTMLCanvasElement | null;
    const calBorderPreviewStatus = document.getElementById('calBorderPreviewStatus');

    if (!modal || !canvas || !ctx) return;

    if (activeCalibratorSession) {
        activeCalibratorSession.abort();
        activeCalibratorSession = null;
    }

    const abortController = new AbortController();
    activeCalibratorSession = abortController;
    const { signal } = abortController;

    /** Evita listeners duplicados ao reabrir o modal (corrompia saves de animação). */
    const bind = (
        target: EventTarget | null | undefined,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions
    ) => {
        target?.addEventListener(type, listener, { ...options, signal });
    };

    const imageW = imageElement.naturalWidth || imageElement.width;
    const imageH = imageElement.naturalHeight || imageElement.height;
    const isBorderSetMode = options?.mode === 'borderSet';
    const isMapMode = options?.mode === 'map';

    if (calibratorAnimPanel) {
        calibratorAnimPanel.style.display = isMapMode || isBorderSetMode ? 'none' : '';
    }
    if (calibratorMapFramePanel) {
        calibratorMapFramePanel.style.display = isMapMode ? '' : 'none';
    }
    if (calibratorBorderSetPanel) {
        calibratorBorderSetPanel.style.display = isBorderSetMode ? '' : 'none';
    }
    if (confirmBtn) {
        confirmBtn.style.display = isBorderSetMode ? 'none' : '';
    }
    if (borderConfirmBtn) {
        borderConfirmBtn.style.display = isBorderSetMode ? '' : 'none';
    }
    if (calibratorInstructionHint) {
        if (isBorderSetMode) {
            calibratorInstructionHint.innerHTML =
                '💡 <strong>Conjunto auto-borda:</strong> Use <em>9 vizinhos</em> ou <em>4 cardinais</em>. Selecione o slot (ex. «↑ Acima da grama»), clique o tile na sheet com filete no lado que encosta na grama. Confira a prévia 3×3 antes de confirmar.';
        } else {
            calibratorInstructionHint.innerHTML = isMapMode
                ? '💡 <strong>Tile único:</strong> Informe colunas e linhas da spritesheet, clique em <em>Aplicar divisão</em>, depois clique no sprite desejado (ou use os campos à direita). Confirme para extrair só esse frame — ou use <em>Exportar todos os frames</em> para gerar a sheet inteira de uma vez.'
                : '💡 <strong>Instrução:</strong> Clique na imagem para definir a Margem de Início do primeiro frame. Clique e arraste para alinhar a grade de fatiamento com precisão milimétrica!';
        }
    }
    if (calBatchExportBtn) {
        calBatchExportBtn.style.display = isMapMode ? '' : 'none';
    }
    if (calibratorBatchBtnGroup) {
        calibratorBatchBtnGroup.style.display = isMapMode ? '' : 'none';
    }

    const borderSetUi =
        isBorderSetMode && calBorderCellList
            ? createBorderSetCalibratorUi({
                  listEl: calBorderCellList,
                  badgeEl: calBorderSetBadge,
                  pickHintEl: calBorderPickHint,
                  maskHintEl: calBorderMaskHint,
                  fillTerrain: options?.borderSetFillTerrain ?? 'grass',
                  onChange: () => {
                      renderCalibrator();
                      updateBorderPreview();
                  },
                  onActiveCellChange: () => renderCalibrator(),
              })
            : null;

    // Cópia profunda das configurações para manipulação interativa no modal
    let localFrameWidth = initialConfig.frameWidth > 0 ? initialConfig.frameWidth : imageW;
    let localFrameHeight = initialConfig.frameHeight > 0 ? initialConfig.frameHeight : imageH;
    let localOffsetX = initialConfig.offsetX ?? 0;
    let localOffsetY = initialConfig.offsetY ?? 0;
    let localGapX = initialConfig.gapX ?? 0;
    let localGapY = initialConfig.gapY ?? 0;
    let localAnchorX = initialConfig.anchorX ?? 0;
    let localAnchorY = initialConfig.anchorY ?? 0;
    let localSheetLayout = initialConfig.sheetLayout || 'horizontal';

    const animDraft = new CharacterAnimationDraft(
        initialConfig.animations,
        initialState,
        initialDirection,
        { defaultSpeedFps: 5, clone: true }
    );
    let activeState = animDraft.activeState;
    let activeDirection = animDraft.activeDirection;

    let localGridCols = Math.max(1, options?.initialGridCols ?? (isMapMode ? 1 : 1));
    let localGridRows = Math.max(1, options?.initialGridRows ?? (isMapMode ? 1 : 1));

    const savedBorderCells = options?.initialBorderSetCells ?? [];
    const inferredSlotGrid = inferBorderSlotGrid(savedBorderCells);
    let borderSlotCols = Math.max(
        1,
        options?.initialBorderSlotCols ?? inferredSlotGrid.cols
    );
    let borderSlotRows = Math.max(
        1,
        options?.initialBorderSlotRows ?? inferredSlotGrid.rows
    );

    function syncBorderSlotGridFromUi(): void {
        if (!borderSetUi) return;
        const size = borderSetUi.getSlotGridSize();
        borderSlotCols = size.cols;
        borderSlotRows = size.rows;
    }

    function updateBorderPreview(): void {
        if (!isBorderSetMode || !borderSetUi || !calBorderPreviewCanvas) return;
        syncBorderSlotGridFromUi();
        const cells = borderSetUi.getAssignments(borderSlotCols, borderSlotRows);
        const active = borderSetUi.hasActiveSlot() ? borderSetUi.getActiveCell() : null;
        const activeMask =
            active && borderSetUi.hasActiveSlot()
                ? borderSetUi.getMaskAt(active.col, active.row)
                : 0;
        const highlight =
            active && borderSetUi.hasActiveSlot()
                ? previewCellForSlotCoords(
                      borderSetUi.getSlotLayoutMode(),
                      active.col,
                      active.row,
                      borderSlotCols,
                      borderSlotRows
                  )
                : null;
        const outer = renderBorderSetPreview({
            canvas: calBorderPreviewCanvas,
            image: imageElement,
            frameWidth: localFrameWidth,
            frameHeight: localFrameHeight,
            offsetX: localOffsetX,
            offsetY: localOffsetY,
            gapX: localGapX,
            gapY: localGapY,
            cells,
            statusEl: null,
            highlightPreviewCell: highlight,
        });

        let inner: ReturnType<typeof renderInnerCornerPreviewStrip> | null = null;
        if (calBorderInnerPreviewCanvas) {
            inner = renderInnerCornerPreviewStrip({
                canvas: calBorderInnerPreviewCanvas,
                image: imageElement,
                frameWidth: localFrameWidth,
                frameHeight: localFrameHeight,
                offsetX: localOffsetX,
                offsetY: localOffsetY,
                gapX: localGapX,
                gapY: localGapY,
                cells,
                highlightMask: activeMask > 0 ? activeMask : null,
            });
        }

        if (calBorderPreviewStatus) {
            const text = formatCombinedPreviewStatus(outer, inner);
            calBorderPreviewStatus.textContent = text;
            const hasMissing =
                outer.missingMasks.length > 0 || (inner?.missingMasks.length ?? 0) > 0;
            calBorderPreviewStatus.classList.toggle('is-error', hasMissing);
        }
    }

    // Ajusta o Canvas para a imagem real
    canvas.width = imageW;
    canvas.height = imageH;

    function updateImageSizeLabel(): void {
        if (calImageSizeLabel) {
            calImageSizeLabel.textContent = `Imagem: ${imageW} × ${imageH} px`;
        }
    }

    function syncGridInputsToLocal(): void {
        if (calGridColsInput) calGridColsInput.value = String(localGridCols);
        if (calGridRowsInput) calGridRowsInput.value = String(localGridRows);
    }

    function readGridInputsFromUI(): { cols: number; rows: number } {
        const cols = Math.max(1, parseInt(calGridColsInput?.value ?? '1', 10) || 1);
        const rows = Math.max(1, parseInt(calGridRowsInput?.value ?? '1', 10) || 1);
        return { cols, rows };
    }

    function updateDivisionPreview(result: ReturnType<typeof computeFrameDimensionsFromGrid>): void {
        if (calGridResultLabel) {
            calGridResultLabel.textContent = `Frame calculado: ${result.frameWidth} × ${result.frameHeight} px (${result.cols}×${result.rows})`;
        }
        if (calGridRemainderLabel) {
            if (result.remainderX > 0 || result.remainderY > 0) {
                const parts: string[] = [];
                if (result.remainderX > 0) parts.push(`${result.remainderX}px à direita`);
                if (result.remainderY > 0) parts.push(`${result.remainderY}px abaixo`);
                calGridRemainderLabel.textContent = `⚠ Sobram ${parts.join(' e ')} — ajuste margem, gap ou nº de frames.`;
                calGridRemainderLabel.style.display = 'block';
            } else {
                calGridRemainderLabel.style.display = 'none';
            }
        }
    }

    function applyGridDivision(cols: number, rows: number, showToast = true): boolean {
        localGridCols = Math.max(1, Math.floor(cols) || 1);
        localGridRows = Math.max(1, Math.floor(rows) || 1);
        syncGridInputsToLocal();

        const result = computeFrameDimensionsFromGrid(
            imageW,
            imageH,
            localGridCols,
            localGridRows,
            localOffsetX,
            localOffsetY,
            localGapX,
            localGapY
        );

        if (result.frameWidth < 1 || result.frameHeight < 1) {
            toast.error('Divisão inválida: frame ficaria com 0 px. Reduza colunas/linhas ou margens.');
            updateDivisionPreview(result);
            return false;
        }

        localFrameWidth = result.frameWidth;
        localFrameHeight = result.frameHeight;
        calFrameWidthInput.value = String(localFrameWidth);
        calFrameHeightInput.value = String(localFrameHeight);
        updateDivisionPreview(result);
        renderCalibrator();
        updateBorderPreview();
        if (borderSetUi && !isBorderSetMode) {
            borderSetUi.rebuildCellList(localGridCols, localGridRows);
        }
        if (showToast) {
            toast.success(`Grade ${localGridCols}×${localGridRows} → frames ${localFrameWidth}×${localFrameHeight} px`);
        }
        return true;
    }

    function previewDivisionFromUI(): void {
        const { cols, rows } = readGridInputsFromUI();
        const result = computeFrameDimensionsFromGrid(
            imageW,
            imageH,
            cols,
            rows,
            localOffsetX,
            localOffsetY,
            localGapX,
            localGapY
        );
        updateDivisionPreview(result);
    }

    // Inicializa os inputs com os dados correntes
    calFrameWidthInput.value = localFrameWidth.toString();
    calFrameHeightInput.value = localFrameHeight.toString();
    syncGridInputsToLocal();
    updateImageSizeLabel();
    calOffsetXInput.value = localOffsetX.toString();
    calOffsetYInput.value = localOffsetY.toString();
    calGapXInput.value = localGapX.toString();
    calGapYInput.value = localGapY.toString();
    calAnchorXInput.value = localAnchorX.toString();
    calAnchorYInput.value = localAnchorY.toString();
    if (calSheetLayoutSelect) {
        calSheetLayoutSelect.value = localSheetLayout;
    }

    calAnimStateSelect.value = activeState;
    calAnimDirSelect.value = activeDirection;

    function parseCalAnimInputs(): AnimationInputValues {
        return parseAnimationInputFields(
            {
                row: calAnimRowInput.value,
                startFrame: calAnimStartFrameInput.value,
                frames: calAnimFramesInput.value,
                speedFps: calAnimSpeedInput.value,
            },
            { defaultSpeedFps: 5 }
        );
    }

    function applyAnimInputsToUI(values: AnimationInputValues): void {
        calAnimRowInput.value = values.row.toString();
        calAnimStartFrameInput.value = values.startFrame.toString();
        calAnimFramesInput.value = values.frames.toString();
        calAnimSpeedInput.value = values.speedFps.toString();
    }

    function syncAnimationToUI(): void {
        animDraft.setActive(activeState, activeDirection);
        applyAnimInputsToUI(animDraft.writeInputsForActive());
    }

    function syncUIToAnimation(): void {
        animDraft.setActive(activeState, activeDirection);
        animDraft.readInputs(parseCalAnimInputs());
    }

    // Atualiza a visualização do Zoom
    function updateZoom() {
        const zoom = parseInt(calZoomInput.value, 10) / 100;
        calZoomValSpan.innerText = `${Math.round(zoom * 100)}%`;
        canvas.style.width = `${canvas.width * zoom}px`;
        canvas.style.height = `${canvas.height * zoom}px`;
    }

    bind(calZoomInput, 'input', updateZoom);

    let selectedFrameCol = isMapMode || isBorderSetMode ? -1 : 0;
    let selectedFrameRow = isMapMode || isBorderSetMode ? -1 : 0;
    let syncingMapFrameUI = false;
    let mapMultiSelectMode = false;
    const selectedFramesList: Array<{ col: number; row: number }> = [];

    if (calMapMultiSelectToggle) calMapMultiSelectToggle.checked = false;
    selectedFramesList.length = 0;
    updateMultiSelectUI();

    function pickFrameAtClientPoint(clientX: number, clientY: number): { col: number; row: number } | null {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = Math.round((clientX - rect.left) * scaleX);
        const clickY = Math.round((clientY - rect.top) * scaleY);

        const col = Math.floor((clickX - localOffsetX) / (localFrameWidth + localGapX));
        const row = Math.floor((clickY - localOffsetY) / (localFrameHeight + localGapY));

        const cols = Math.floor((canvas.width - localOffsetX) / (localFrameWidth + localGapX));
        const rows = Math.floor((canvas.height - localOffsetY) / (localFrameHeight + localGapY));

        if (col >= 0 && col < cols && row >= 0 && row < rows) {
            return { col, row };
        }
        return null;
    }

    function applyFramePick(col: number, row: number): void {
        selectedFrameCol = col;
        selectedFrameRow = row;

        if (isMapMode && mapMultiSelectMode) {
            toggleFrameInSelection(col, row);
            updateMultiSelectUI();
        } else if (isMapMode) {
            toast.info(`Frame selecionado: col ${col + 1}, linha ${row + 1}`);
        } else if (!isBorderSetMode) {
            // Modo personagem (character anim calibrator)
            // Se layout for vertical, a animação varia nas linhas (rows) e a linha da animação é a coluna (col)
            // Se for horizontal, a animação varia nas colunas (cols) e a linha da animação é a linha (row)
            if (localSheetLayout === 'vertical') {
                calAnimRowInput.value = col.toString();
                calAnimStartFrameInput.value = row.toString();
            } else {
                calAnimRowInput.value = row.toString();
                calAnimStartFrameInput.value = col.toString();
            }
            calAnimRowInput.dispatchEvent(new Event('input'));
            calAnimStartFrameInput.dispatchEvent(new Event('input'));
            toast.info(`Selecionado frame da animação: linha ${calAnimRowInput.value}, frame inicial ${calAnimStartFrameInput.value}`);
        }

        renderCalibrator();
    }

    function findSelectedFrameIndex(col: number, row: number): number {
        return selectedFramesList.findIndex((f) => f.col === col && f.row === row);
    }

    function toggleFrameInSelection(col: number, row: number): void {
        const idx = findSelectedFrameIndex(col, row);
        if (idx >= 0) {
            selectedFramesList.splice(idx, 1);
        } else {
            selectedFramesList.push({ col, row });
        }
    }

    function buildCalibrationPayload(): CalibrationResult {
        return {
            frameWidth: localFrameWidth,
            frameHeight: localFrameHeight,
            offsetX: localOffsetX,
            offsetY: localOffsetY,
            gapX: localGapX,
            gapY: localGapY,
            anchorX: localAnchorX,
            anchorY: localAnchorY,
            animations: animDraft.toAnimations(),
            currentState: activeState,
            currentDirection: activeDirection,
            sheetLayout: localSheetLayout,
            selectedFrameCol,
            selectedFrameRow,
            selectedFrames:
                selectedFramesList.length > 0 ? [...selectedFramesList] : undefined,
        };
    }

    function updateMultiSelectUI(): void {
        const count = selectedFramesList.length;
        if (calMapSelectionSummary) {
            calMapSelectionSummary.style.display = mapMultiSelectMode ? 'block' : 'none';
            calMapSelectionSummary.textContent =
                count === 0
                    ? 'Clique nos tiles para selecionar (clique de novo desmarca)'
                    : `${count} frame${count === 1 ? '' : 's'} selecionado${count === 1 ? '' : 's'}`;
        }
        if (calBatchExportSelectedBtn) {
            calBatchExportSelectedBtn.style.display = mapMultiSelectMode ? '' : 'none';
            calBatchExportSelectedBtn.disabled = count < 1;
            calBatchExportSelectedBtn.textContent =
                count > 0
                    ? `✅ Exportar selecionados (${count})`
                    : '✅ Exportar selecionados';
        }
        if (confirmBtn && !isBorderSetMode) {
            confirmBtn.style.display = mapMultiSelectMode ? 'none' : '';
        }
        if (calMapMultiSelectTools) {
            calMapMultiSelectTools.classList.toggle('is-visible', mapMultiSelectMode);
        }
    }

    function getVisibleGridSize(): { cols: number; rows: number } {
        const cols = Math.floor((canvas.width - localOffsetX) / (localFrameWidth + localGapX));
        const rows = Math.floor((canvas.height - localOffsetY) / (localFrameHeight + localGapY));
        return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
    }

    function hasMapFrameSelection(): boolean {
        return selectedFrameCol >= 0 && selectedFrameRow >= 0;
    }

    function clampFrameSelection(): void {
        const { cols, rows } = getVisibleGridSize();
        if (cols < 1 || rows < 1 || !hasMapFrameSelection()) return;
        selectedFrameCol = Math.min(Math.max(0, selectedFrameCol), cols - 1);
        selectedFrameRow = Math.min(Math.max(0, selectedFrameRow), rows - 1);
    }

    function updateMapFrameUI(): void {
        if (!isMapMode) return;
        const { cols, rows } = getVisibleGridSize();
        const total = cols * rows;
        clampFrameSelection();

        if (calMapFrameTotal) {
            calMapFrameTotal.textContent = total > 0
                ? `Grade visível: ${cols}×${rows} = ${total} frames (${localFrameWidth}×${localFrameHeight} px cada)`
                : 'Grade visível: — (defina colunas/linhas e aplique a divisão)';
        }
        if (calMapFrameSummary) {
            const selectionCount = selectedFramesList.length;
            if (mapMultiSelectMode) {
                calMapFrameSummary.textContent =
                    selectionCount > 0
                        ? `Último clique: col ${selectedFrameCol + 1}, linha ${selectedFrameRow + 1}`
                        : 'Nenhum tile marcado ainda';
            } else if (hasMapFrameSelection()) {
                const idx = selectedFrameRow * cols + selectedFrameCol + 1;
                calMapFrameSummary.textContent = total > 0
                    ? `Selecionado: col ${selectedFrameCol + 1}, linha ${selectedFrameRow + 1} (índice ${idx} de ${total})`
                    : `Selecionado: col ${selectedFrameCol + 1}, linha ${selectedFrameRow + 1}`;
            } else {
                calMapFrameSummary.textContent = 'Nenhum tile selecionado — clique na imagem';
            }
        }
        if (calMapFrameColInput && calMapFrameRowInput && !mapMultiSelectMode) {
            syncingMapFrameUI = true;
            calMapFrameColInput.max = String(Math.max(1, cols));
            calMapFrameRowInput.max = String(Math.max(1, rows));
            if (hasMapFrameSelection()) {
                calMapFrameColInput.value = String(selectedFrameCol + 1);
                calMapFrameRowInput.value = String(selectedFrameRow + 1);
            } else {
                calMapFrameColInput.value = '';
                calMapFrameRowInput.value = '';
            }
            syncingMapFrameUI = false;
        }
    }

    function applyMapFrameFromInputs(): void {
        if (syncingMapFrameUI || !isMapMode) return;
        const { cols, rows } = getVisibleGridSize();
        if (cols < 1 || rows < 1) return;
        const col = (parseInt(calMapFrameColInput?.value ?? '1', 10) || 1) - 1;
        const row = (parseInt(calMapFrameRowInput?.value ?? '1', 10) || 1) - 1;
        if (col >= 0 && col < cols && row >= 0 && row < rows) {
            selectedFrameCol = col;
            selectedFrameRow = row;
            renderCalibrator();
        }
    }

    // Desenha a grade
    function renderCalibrator() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Desenha a spritesheet de fundo
        ctx.drawImage(imageElement, 0, 0);

        // 2. Desenha a grade vermelha com base no frameWidth/Height atuais
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
        ctx.lineWidth = 1;

        const cols = Math.floor((canvas.width - localOffsetX) / (localFrameWidth + localGapX));
        const rows = Math.floor((canvas.height - localOffsetY) / (localFrameHeight + localGapY));

        const activeAnim = animDraft.getDef(activeState, activeDirection);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = localOffsetX + c * (localFrameWidth + localGapX);
                const y = localOffsetY + r * (localFrameHeight + localGapY);

                // Grade vermelha padrão
                ctx.strokeRect(x, y, localFrameWidth, localFrameHeight);

                // Destaque do(s) frame(s) em modo mapa
                if (isMapMode && hasMapFrameSelection()) {
                    const multiIdx = mapMultiSelectMode
                        ? findSelectedFrameIndex(c, r)
                        : -1;
                    const isSingleSelected =
                        !mapMultiSelectMode && r === selectedFrameRow && c === selectedFrameCol;
                    const isMultiSelected = mapMultiSelectMode && multiIdx >= 0;

                    if (isSingleSelected || isMultiSelected) {
                        ctx.strokeStyle = '#22c55e';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(x + 1, y + 1, localFrameWidth - 2, localFrameHeight - 2);
                        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
                        ctx.fillRect(x + 2, y + 2, localFrameWidth - 4, localFrameHeight - 4);

                        ctx.fillStyle = '#22c55e';
                        ctx.font = 'bold 11px sans-serif';
                        if (isMultiSelected) {
                            ctx.fillText(String(multiIdx + 1), x + 5, y + 14);
                        } else {
                            ctx.fillText('SELECIONADO', x + 6, y + 18);
                        }

                        ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
                        ctx.lineWidth = 1;
                    }
                }

                // Destaque da animação ativa (com wrap para a linha/coluna seguinte)
                const animFrameIndex =
                    activeAnim && !isMapMode
                        ? getAnimationFrameIndexAtCell(
                              c,
                              r,
                              activeAnim,
                              localSheetLayout,
                              cols,
                              rows
                          )
                        : null;
                const isActive = animFrameIndex !== null;

                if (isActive && !isMapMode) {
                    // Desenha borda verde brilhante
                    ctx.strokeStyle = '#4ade80';
                    ctx.lineWidth = 2.5;
                    ctx.strokeRect(x + 1, y + 1, localFrameWidth - 2, localFrameHeight - 2);
                    
                    // Desenha preenchimento verde translúcido
                    ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
                    ctx.fillRect(x + 2, y + 2, localFrameWidth - 4, localFrameHeight - 4);
                    
                    // Desenha o ponto azul (cyan) no meio do frame selecionado
                    ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
                    ctx.fillRect(x + localFrameWidth / 2 - 2, y + localFrameHeight / 2 - 2, 4, 4);
                    
                    // Adiciona o número do frame da animação no topo-esquerdo do bloco
                    ctx.fillStyle = '#4ade80';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText(`F${animFrameIndex! + 1}`, x + 6, y + 18);
                    
                    // Restaura estilos padrão para os próximos retângulos da grade
                    ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
                    ctx.lineWidth = 1;
                }

                if (isBorderSetMode && borderSetUi) {
                    const mask = borderSetUi.getMaskAt(c, r);
                    const src = borderSetUi.getSourceAt(c, r);
                    const isSourceHere = src.col === c && src.row === r;
                    if (isSourceHere && mask > 0) {
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.85)';
                        ctx.font = 'bold 11px sans-serif';
                        ctx.fillText(`M${mask}`, x + 5, y + 14);
                    }
                }
            }
        }

        if (isBorderSetMode && borderSetUi?.hasActiveSlot()) {
            const active = borderSetUi.getActiveCell();
            const src = borderSetUi.getSourceAt(active.col, active.row);
            if (src.col >= 0 && src.col < cols && src.row >= 0 && src.row < rows) {
                const x = localOffsetX + src.col * (localFrameWidth + localGapX);
                const y = localOffsetY + src.row * (localFrameHeight + localGapY);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3;
                ctx.strokeRect(x + 1, y + 1, localFrameWidth - 2, localFrameHeight - 2);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
                ctx.fillRect(x + 2, y + 2, localFrameWidth - 4, localFrameHeight - 4);
                ctx.fillStyle = '#22c55e';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText('ATIVO', x + 6, y + 18);
            }
        }

        const preview = computeFrameDimensionsFromGrid(
            canvas.width,
            canvas.height,
            localGridCols,
            localGridRows,
            localOffsetX,
            localOffsetY,
            localGapX,
            localGapY
        );
        if (preview.remainderX > 0) {
            const x =
                localOffsetX +
                localGridCols * preview.frameWidth +
                (localGridCols - 1) * localGapX;
            ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
            ctx.fillRect(x, localOffsetY, preview.remainderX, canvas.height - localOffsetY);
        }
        if (preview.remainderY > 0) {
            const y =
                localOffsetY +
                localGridRows * preview.frameHeight +
                (localGridRows - 1) * localGapY;
            ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
            ctx.fillRect(localOffsetX, y, canvas.width - localOffsetX, preview.remainderY);
        }

        if (isMapMode) {
            updateMapFrameUI();
        }
    }

    // Clique no canvas — seleção de frames (mapa) ou tile de borda (borderSet)
    bind(
        canvas,
        'click',
        (e) => {
            const picked = pickFrameAtClientPoint((e as MouseEvent).clientX, (e as MouseEvent).clientY);
            if (!picked) return;
            if (isMapMode) {
                applyFramePick(picked.col, picked.row);
            } else if (isBorderSetMode && borderSetUi) {
                if (borderSetUi.handleCanvasPick(picked.col, picked.row)) {
                    renderCalibrator();
                    toast.info(
                        `Tile sheet Col ${picked.col + 1} · Lin ${picked.row + 1} associado ao slot ativo.`,
                        2800
                    );
                } else {
                    toast.info('Clique numa célula da prévia 3×3 ou num slot à direita, depois clique na imagem.');
                }
            }
        }
    );

    bind(
        calBorderPreviewCanvas,
        'click',
        (e) => {
            if (!isBorderSetMode || !borderSetUi) return;
            const grid = pickPreviewGridCell(calBorderPreviewCanvas, e.clientX, e.clientY);
            if (!grid) return;
            if (grid.x === 1 && grid.y === 1) {
                toast.info('O centro é a grama — clique numa célula de pedra ao redor.');
                return;
            }
            const pick = borderSetUi.selectSlotFromPreviewGrid(grid.x, grid.y);
            if (!pick.ok) {
                toast.info('Esta célula não tem slot correspondente.');
                return;
            }
            syncBorderSlotGridFromUi();
            renderCalibrator();
            updateBorderPreview();
            const active = borderSetUi.getActiveCell();
            const meta = borderSetUi.getMaskAt(active.col, active.row);
            toast.info(
                `Posição M${meta} ativa. Clique o tile na imagem à esquerda (filete encostando na grama).`,
                3200
            );
        }
    );

    bind(
        calBorderInnerPreviewCanvas,
        'click',
        (e) => {
            if (!isBorderSetMode || !borderSetUi) return;
            const col = pickInnerCornerPreviewIndex(
                calBorderInnerPreviewCanvas,
                e.clientX,
                e.clientY
            );
            if (col === null) return;
            const mask = INNER_CORNER_4_SLOTS[col]?.mask ?? 0;
            if (mask <= 0) return;
            if (!borderSetUi.ensureAndSelectInnerCorner(mask)) {
                toast.error('Não foi possível ativar o slot desta quina interna.');
                return;
            }
            syncBorderSlotGridFromUi();
            renderCalibrator();
            updateBorderPreview();
            toast.info(
                `Quina interna M${mask} ativa. Clique o tile em L na sheet à esquerda.`,
                3200
            );
        }
    );

    // Arraste para alinhar margem (desativado durante seleção múltipla no modo mapa)
    let isDragging = false;
    let hasDragged = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let originalOffsetX = 0;
    let originalOffsetY = 0;

    bind(canvas, 'mousedown', (e) => {
        if (isMapMode && mapMultiSelectMode) return;
        isDragging = true;
        hasDragged = false;
        dragStartX = (e as MouseEvent).clientX;
        dragStartY = (e as MouseEvent).clientY;
        originalOffsetX = localOffsetX;
        originalOffsetY = localOffsetY;
    });

    bind(window, 'mousemove', (e) => {
        if (!isDragging) return;

        const me = e as MouseEvent;
        const dx = me.clientX - dragStartX;
        const dy = me.clientY - dragStartY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasDragged = true;
        }

        if (hasDragged) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            localOffsetX = Math.round(originalOffsetX + dx * scaleX);
            localOffsetY = Math.round(originalOffsetY + dy * scaleY);

            calOffsetXInput.value = localOffsetX.toString();
            calOffsetYInput.value = localOffsetY.toString();
            renderCalibrator();
        }
    });

    bind(window, 'mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        if (!hasDragged && !isMapMode && !isBorderSetMode) {
            const picked = pickFrameAtClientPoint((e as MouseEvent).clientX, (e as MouseEvent).clientY);
            if (picked) applyFramePick(picked.col, picked.row);
        }
    });

    // Inputs globais atualizam em tempo real
    const gridInputs = [
        calFrameWidthInput, calFrameHeightInput, calOffsetXInput,
        calOffsetYInput, calGapXInput, calGapYInput, calAnchorXInput, calAnchorYInput
    ];
    gridInputs.forEach(el => {
        bind(el, 'input', () => {
            const fw = parseInt(calFrameWidthInput.value, 10);
            const fh = parseInt(calFrameHeightInput.value, 10);
            localFrameWidth = Number.isFinite(fw) && fw > 0 ? fw : localFrameWidth;
            localFrameHeight = Number.isFinite(fh) && fh > 0 ? fh : localFrameHeight;
            localOffsetX = parseInt(calOffsetXInput.value, 10) || 0;
            localOffsetY = parseInt(calOffsetYInput.value, 10) || 0;
            localGapX = parseInt(calGapXInput.value, 10) || 0;
            localGapY = parseInt(calGapYInput.value, 10) || 0;
            localAnchorX = Number.isFinite(parseInt(calAnchorXInput.value, 10))
                ? parseInt(calAnchorXInput.value, 10)
                : 0;
            localAnchorY = Number.isFinite(parseInt(calAnchorYInput.value, 10))
                ? parseInt(calAnchorYInput.value, 10)
                : 0;
            previewDivisionFromUI();
            renderCalibrator();
        });
    });

    bind(calGridApplyBtn, 'click', () => {
        const { cols, rows } = readGridInputsFromUI();
        applyGridDivision(cols, rows, true);
    });

    bind(calGrid1x1Btn, 'click', () => {
        applyGridDivision(1, 1, true);
    });

    bind(calGrid4x4Btn, 'click', () => {
        applyGridDivision(4, 4, true);
    });

    bind(calBorderPreset3x3, 'click', () => {
        borderSlotCols = 3;
        borderSlotRows = 3;
        borderSetUi?.applyFullNeighborPreset();
        toast.info(
            '9 slots = pedra ao redor da grama. «↑ Acima» usa M4 (filete embaixo do PNG). Clique cada slot e o tile na sheet.'
        );
    });

    bind(calBorderPreset4x4, 'click', () => {
        borderSlotCols = 4;
        borderSlotRows = 1;
        borderSetUi?.applyCardinalPreset();
        toast.info(
            '4 cardinais: ↑ M4 · → M8 · ↓ M1 · ← M2. Clique cada slot e o tile na sheet.'
        );
    });

    bind(calBorderPresetInnerL, 'click', () => {
        const size = borderSetUi?.getSlotGridSize();
        const hasNeighbor = (size?.rows ?? 0) >= 3 && (size?.cols ?? 0) >= 3;
        if (hasNeighbor) {
            borderSetUi?.appendInnerCornerSlots();
        } else {
            borderSetUi?.applyFullNeighborPreset();
            borderSetUi?.appendInnerCornerSlots();
        }
        const after = borderSetUi?.getSlotGridSize();
        if (after) {
            borderSlotCols = after.cols;
            borderSlotRows = after.rows;
        }
        updateBorderPreview();
        toast.info(
            'Slots M3, M6, M12, M9 criados na lista (role até o fim). Clique cada quina na prévia ou na lista, depois o tile na sheet.',
            5500
        );
    });

    [calGridColsInput, calGridRowsInput].forEach((el) => {
        bind(el, 'input', () => {
            const { cols, rows } = readGridInputsFromUI();
            localGridCols = cols;
            localGridRows = rows;
            previewDivisionFromUI();
            renderCalibrator();
        });
    });

    bind(calMapFrameColInput, 'input', applyMapFrameFromInputs);
    bind(calMapFrameRowInput, 'change', applyMapFrameFromInputs);
    bind(calMapFrameRowInput, 'input', applyMapFrameFromInputs);
    bind(calMapFrameColInput, 'change', applyMapFrameFromInputs);

    bind(calMapMultiSelectToggle, 'change', () => {
        mapMultiSelectMode = calMapMultiSelectToggle.checked;
        updateMultiSelectUI();
        updateMapFrameUI();
        renderCalibrator();
    });

    bind(calMapSelectAllBtn, 'click', () => {
        const { cols, rows } = getVisibleGridSize();
        if (cols < 1 || rows < 1) return;
        selectedFramesList.length = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                selectedFramesList.push({ col: c, row: r });
            }
        }
        mapMultiSelectMode = true;
        if (calMapMultiSelectToggle) calMapMultiSelectToggle.checked = true;
        updateMultiSelectUI();
        renderCalibrator();
        toast.info(`${selectedFramesList.length} frames marcados.`);
    });

    bind(calMapClearSelectionBtn, 'click', () => {
        selectedFramesList.length = 0;
        updateMultiSelectUI();
        renderCalibrator();
    });

    bind(calSheetLayoutSelect, 'change', () => {
        localSheetLayout = calSheetLayoutSelect.value as 'horizontal' | 'vertical';
        renderCalibrator();
    });

    // Mudança de Estado/Direção sincroniza inputs secundários
    bind(calAnimStateSelect, 'change', () => {
        animDraft.setActive(activeState, activeDirection);
        const vals = animDraft.switchSelection(
            calAnimStateSelect.value,
            activeDirection,
            parseCalAnimInputs()
        );
        activeState = animDraft.activeState;
        activeDirection = animDraft.activeDirection;
        applyAnimInputsToUI(vals);
        renderCalibrator();
    });

    bind(calAnimDirSelect, 'change', () => {
        animDraft.setActive(activeState, activeDirection);
        const vals = animDraft.switchSelection(
            activeState,
            calAnimDirSelect.value,
            parseCalAnimInputs()
        );
        activeState = animDraft.activeState;
        activeDirection = animDraft.activeDirection;
        applyAnimInputsToUI(vals);
        renderCalibrator();
    });

    // Inputs das configurações de animação salvam em tempo real
    const animInputs = [calAnimRowInput, calAnimStartFrameInput, calAnimFramesInput, calAnimSpeedInput];
    animInputs.forEach(el => {
        bind(el, 'input', () => {
            syncUIToAnimation();
            renderCalibrator();
        });
    });

    function closeModal() {
        abortController.abort();
        if (activeCalibratorSession === abortController) {
            activeCalibratorSession = null;
        }
        modal?.classList.remove('is-open');
    }

    bind(closeBtn, 'click', closeModal);
    bind(cancelBtn, 'click', closeModal);

    bind(calBatchExportBtn, 'click', async () => {
        if (!isMapMode || !options?.onBatchExport) return;
        if (localFrameWidth < 1 || localFrameHeight < 1) {
            toast.error('Defina a grade (colunas/linhas + Aplicar divisão) antes de exportar.');
            return;
        }
        const { cols, rows } = getVisibleGridSize();
        if (cols * rows < 2) {
            toast.error(
                'A grade precisa ter 2 ou mais frames. Informe colunas/linhas e clique em Aplicar divisão.'
            );
            return;
        }
        if (selectedFramesList.length > 0) {
            const ok = await popup.confirm(
                `Você tem <strong>${selectedFramesList.length}</strong> frame(s) marcados.<br><br>Exportar <strong>todos os ${cols * rows}</strong> da grade cria um PNG por célula.<br><br>Para variantes aleatórias use <strong>✅ Exportar selecionados</strong> (1 arquivo).<br><br>Exportar a sheet inteira mesmo assim?`,
                'Exportar todos os frames'
            );
            if (!ok) return;
        }
        options.onBatchExport(buildCalibrationPayload(), 'all');
    });

    bind(calBatchExportSelectedBtn, 'click', () => {
        if (!isMapMode || !options?.onBatchExport) return;
        if (selectedFramesList.length < 1) {
            toast.error('Selecione pelo menos 1 frame (ative seleção múltipla e clique nos tiles).');
            return;
        }
        if (localFrameWidth < 1 || localFrameHeight < 1) {
            toast.error('Defina a grade antes de exportar.');
            return;
        }
        options.onBatchExport(buildCalibrationPayload(), 'selected');
    });

    bind(confirmBtn, 'click', () => {
        if (localFrameWidth < 1 || localFrameHeight < 1) {
            toast.error('Largura e altura do frame devem ser maiores que 0. Use "Aplicar divisão" ou ajuste manualmente.');
            return;
        }
        if (isMapMode) {
            const { cols, rows } = getVisibleGridSize();
            if (cols * rows <= 1 && (imageW > localFrameWidth || imageH > localFrameHeight)) {
                toast.error('A grade está em 1×1 — a imagem inteira seria exportada. Defina colunas/linhas e aplique a divisão antes de confirmar.');
                return;
            }
            if (!mapMultiSelectMode && !hasMapFrameSelection()) {
                toast.error('Clique em um tile da imagem para selecionar o frame antes de confirmar.');
                return;
            }
        }
        syncUIToAnimation();
        onConfirm({
            frameWidth: localFrameWidth,
            frameHeight: localFrameHeight,
            offsetX: localOffsetX,
            offsetY: localOffsetY,
            gapX: localGapX,
            gapY: localGapY,
            anchorX: localAnchorX,
            anchorY: localAnchorY,
            animations: animDraft.toAnimations(),
            currentState: activeState,
            currentDirection: activeDirection,
            sheetLayout: localSheetLayout,
            selectedFrameCol: hasMapFrameSelection() ? selectedFrameCol : undefined,
            selectedFrameRow: hasMapFrameSelection() ? selectedFrameRow : undefined,
        });
        closeModal();
    });

    bind(borderConfirmBtn, 'click', () => {
        if (!isBorderSetMode || !borderSetUi) return;
        if (localFrameWidth < 1 || localFrameHeight < 1) {
            toast.error('Defina a grade (Aplicar divisão) antes de confirmar.');
            return;
        }
        syncBorderSlotGridFromUi();
        const cells = borderSetUi.getAssignments(borderSlotCols, borderSlotRows);
        onConfirm({
            frameWidth: localFrameWidth,
            frameHeight: localFrameHeight,
            offsetX: localOffsetX,
            offsetY: localOffsetY,
            gapX: localGapX,
            gapY: localGapY,
            anchorX: localAnchorX,
            anchorY: localAnchorY,
            animations: animDraft.toAnimations(),
            currentState: activeState,
            currentDirection: activeDirection,
            sheetLayout: localSheetLayout,
            borderSetCells: cells,
            gridCols: localGridCols,
            gridRows: localGridRows,
            borderSlotCols,
            borderSlotRows,
        });
        closeModal();
    });

    // Inicialização do Modal
    if (isBorderSetMode) {
        if (initialConfig.frameWidth > 0 && initialConfig.frameHeight > 0) {
            localFrameWidth = initialConfig.frameWidth;
            localFrameHeight = initialConfig.frameHeight;
            localOffsetX = initialConfig.offsetX ?? 0;
            localOffsetY = initialConfig.offsetY ?? 0;
            localGapX = initialConfig.gapX ?? 0;
            localGapY = initialConfig.gapY ?? 0;
            calFrameWidthInput.value = String(localFrameWidth);
            calFrameHeightInput.value = String(localFrameHeight);
            calOffsetXInput.value = String(localOffsetX);
            calOffsetYInput.value = String(localOffsetY);
            calGapXInput.value = String(localGapX);
            calGapYInput.value = String(localGapY);
        }

        if (savedBorderCells.length > 0) {
            const slotGrid = inferBorderSlotGrid(savedBorderCells);
            borderSlotCols = slotGrid.cols;
            borderSlotRows = slotGrid.rows;
            borderSetUi?.loadAssignments(savedBorderCells, borderSlotCols, borderSlotRows);
            const size = borderSetUi?.getSlotGridSize();
            if (size) {
                borderSlotCols = size.cols;
                borderSlotRows = size.rows;
            }
        } else {
            borderSetUi?.applyFullNeighborPreset();
            borderSlotCols = 3;
            borderSlotRows = 3;
            toast.info('Preset «9 vizinhos» aplicado. Clique na prévia ou na lista, depois o tile na sheet.', 4000);
        }

        applyGridDivision(localGridCols, localGridRows, false);
    } else if (isMapMode && (localGridCols > 1 || localGridRows > 1)) {
        applyGridDivision(localGridCols, localGridRows, false);
    } else if (initialConfig.frameWidth <= 0 || initialConfig.frameHeight <= 0) {
        applyGridDivision(localGridCols, localGridRows, false);
    } else if (isMapMode) {
        const computedCols = Math.max(
            1,
            Math.floor((imageW - localOffsetX) / (localFrameWidth + localGapX))
        );
        const computedRows = Math.max(
            1,
            Math.floor((imageH - localOffsetY) / (localFrameHeight + localGapY))
        );
        if (computedCols > 1 || computedRows > 1) {
            localGridCols = computedCols;
            localGridRows = computedRows;
            syncGridInputsToLocal();
        }
        previewDivisionFromUI();
    } else {
        previewDivisionFromUI();
    }
    syncAnimationToUI();
    updateMultiSelectUI();
    updateZoom();
    modal.classList.add('is-open');
    renderCalibrator();
    updateBorderPreview();
}
