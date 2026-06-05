import { clampFloorZ } from '../engine';
import { syncGridPlayerVisual, type GridPlayerMotion } from '../movement/gridMovement';
import { toast, popup } from '../utils/popup';
import { HouseData } from '../engine/types';

export interface HouseManagerOptions {
    worldHouses: Record<number, HouseData>;
    player: GridPlayerMotion;
    tileSizeScreen: number;
    setEditingFloor: (z: number) => void;
    updateFloorButtons: () => void;
}

export function initHouseManager(options: HouseManagerOptions) {
    const {
        worldHouses,
        player,
        tileSizeScreen,
        setEditingFloor,
        updateFloorButtons,
    } = options;

    const houseManagerModal = document.getElementById('houseManagerModal')!;
    const houseManagerCloseBtn = document.getElementById('houseManagerCloseBtn');
    const houseManagerCreateBtn = document.getElementById('houseManagerCreateBtn');
    const houseManagerTbody = document.getElementById('houseManagerTbody')!;

    const houseEditModal = document.getElementById('houseEditModal')!;
    const houseEditCloseBtn = document.getElementById('houseEditCloseBtn');
    const houseEditCancelBtn = document.getElementById('houseEditCancelBtn');
    const houseEditSaveBtn = document.getElementById('houseEditSaveBtn');
    const houseEditUseCurrentPosBtn = document.getElementById('houseEditUseCurrentPosBtn');

    const houseEditTitle = document.getElementById('houseEditTitle')!;
    const houseEditId = document.getElementById('houseEditId') as HTMLInputElement;
    const houseEditName = document.getElementById('houseEditName') as HTMLInputElement;
    const houseEditRent = document.getElementById('houseEditRent') as HTMLInputElement;
    const houseEditX = document.getElementById('houseEditX') as HTMLInputElement;
    const houseEditY = document.getElementById('houseEditY') as HTMLInputElement;
    const houseEditZ = document.getElementById('houseEditZ') as HTMLInputElement;

    function closeAllDropdowns() {
        document.querySelectorAll('.menu-item').forEach((item) => {
            item.classList.remove('is-open');
        });
    }

    function refreshHouseManagerTable() {
        if (!houseManagerTbody) return;
        houseManagerTbody.innerHTML = '';
        const houses = Object.values(worldHouses).sort((a, b) => a.id - b.id);
        
        if (houses.length === 0) {
            houseManagerTbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: var(--text-dim);">Nenhuma casa registrada.</td></tr>`;
            return;
        }

        houses.forEach(house => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #2d3139';
            tr.innerHTML = `
                <td style="padding: 8px;">#${house.id}</td>
                <td style="padding: 8px;">${house.name || 'Sem nome'}</td>
                <td style="padding: 8px; color: #fbbf24;">${house.rent} GP</td>
                <td style="padding: 8px; font-family: monospace;">${house.entryX}, ${house.entryY}, ${house.entryZ}</td>
                <td style="padding: 8px; text-align: center;">
                    <button class="floor-btn goto-btn" data-hx="${house.entryX}" data-hy="${house.entryY}" data-hz="${house.entryZ}" style="padding: 2px 6px; font-size: 10px;">📍 Ir</button>
                    <button class="floor-btn edit-btn" data-hid="${house.id}" style="padding: 2px 6px; font-size: 10px;">✏️ Ed</button>
                    <button class="floor-btn del-btn" data-hid="${house.id}" style="padding: 2px 6px; font-size: 10px; border-color: #ef4444; color: #ef4444;">🗑️</button>
                </td>
            `;
            houseManagerTbody.appendChild(tr);
        });

        houseManagerTbody.querySelectorAll('.goto-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = (e.target as HTMLElement).closest('.goto-btn') as HTMLButtonElement;
                const hx = parseInt(b.dataset.hx!);
                const hy = parseInt(b.dataset.hy!);
                const hz = parseInt(b.dataset.hz!);
                player.tileX = hx;
                player.tileY = hy;
                player.worldZ = clampFloorZ(hz);
                setEditingFloor(player.worldZ);
                syncGridPlayerVisual(player, tileSizeScreen);
                updateFloorButtons();
                
                closeAllDropdowns();
                if (houseManagerModal) houseManagerModal.style.display = 'none';
            });
        });

        houseManagerTbody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = (e.target as HTMLElement).closest('.edit-btn') as HTMLButtonElement;
                const hid = parseInt(b.dataset.hid!);
                openHouseEditor(hid);
            });
        });

        houseManagerTbody.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const b = (e.target as HTMLElement).closest('.del-btn') as HTMLButtonElement;
                const hid = parseInt(b.dataset.hid!);
                const confirm = await popup.confirm(`Tem certeza que deseja deletar a casa #${hid}? Isso não apagará os blocos do mapa, apenas o registro oficial.`, 'Deletar Casa');
                if (confirm) {
                    delete worldHouses[hid];
                    refreshHouseManagerTable();
                    toast.success(`Casa #${hid} deletada.`);
                }
            });
        });
    }

    function openHouseEditor(houseId?: number) {
        if (houseId !== undefined && worldHouses[houseId]) {
            const h = worldHouses[houseId];
            houseEditTitle.innerText = `🏠 Editar Casa #${h.id}`;
            houseEditId.value = h.id.toString();
            houseEditName.value = h.name;
            houseEditRent.value = h.rent.toString();
            houseEditX.value = h.entryX.toString();
            houseEditY.value = h.entryY.toString();
            houseEditZ.value = h.entryZ.toString();
        } else {
            houseEditTitle.innerText = `➕ Nova Casa`;
            let newId = 1;
            while (worldHouses[newId]) newId++;
            
            houseEditId.value = newId.toString();
            houseEditName.value = `House ${newId}`;
            houseEditRent.value = '1000';
            houseEditX.value = player.tileX.toString();
            houseEditY.value = player.tileY.toString();
            houseEditZ.value = player.worldZ.toString();
        }
        
        if (houseEditModal) {
            houseEditModal.style.display = 'flex';
            requestAnimationFrame(() => houseEditModal.classList.add('is-open'));
        }
    }

    function closeHouseEditor() {
        if (houseEditModal) {
            houseEditModal.classList.remove('is-open');
            setTimeout(() => { houseEditModal.style.display = 'none'; }, 250);
        }
    }

    houseEditUseCurrentPosBtn?.addEventListener('click', () => {
        houseEditX.value = player.tileX.toString();
        houseEditY.value = player.tileY.toString();
        houseEditZ.value = player.worldZ.toString();
    });

    houseEditCancelBtn?.addEventListener('click', closeHouseEditor);
    houseEditCloseBtn?.addEventListener('click', closeHouseEditor);

    houseEditSaveBtn?.addEventListener('click', () => {
        const id = parseInt(houseEditId.value);
        worldHouses[id] = {
            id,
            name: houseEditName.value || 'Sem nome',
            rent: parseInt(houseEditRent.value) || 0,
            entryX: parseInt(houseEditX.value) || 0,
            entryY: parseInt(houseEditY.value) || 0,
            entryZ: parseInt(houseEditZ.value) || 0
        };
        refreshHouseManagerTable();
        closeHouseEditor();
        toast.success(`Casa salva com sucesso!`);
    });

    const openHouseManager = () => {
        refreshHouseManagerTable();
        if (houseManagerModal) {
            houseManagerModal.style.display = 'flex';
            requestAnimationFrame(() => houseManagerModal.classList.add('is-open'));
        }
    };

    const closeHouseManager = () => {
        if (houseManagerModal) {
            houseManagerModal.classList.remove('is-open');
            setTimeout(() => { houseManagerModal.style.display = 'none'; }, 250);
        }
    };

    document.getElementById('openHouseManagerBtn')?.addEventListener('click', () => {
        closeAllDropdowns();
        openHouseManager();
    });
    document.getElementById('openHouseManagerBtn2')?.addEventListener('click', openHouseManager);
    houseManagerCloseBtn?.addEventListener('click', closeHouseManager);
    houseManagerCreateBtn?.addEventListener('click', () => openHouseEditor());

    return {
        openHouseManager,
        closeHouseManager,
        openHouseEditor,
        refreshHouseManagerTable,
    };
}
