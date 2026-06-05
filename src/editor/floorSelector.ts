import {
    clampFloorZ,
    formatFloorLabel,
    getAllFloorZs,
} from '../engine/config';

export interface FloorSelectorController {
    setActive(z: number): void;
    getActive(): number;
}

/**
 * Monta os botões de andar (-7 … +7) dinamicamente a partir da engine.
 */
export function initFloorSelector(
    containerId: string,
    initialZ: number,
    onSelect: (z: number) => void
): FloorSelectorController {
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`#${containerId} não encontrado`);
    }

    container.innerHTML = '';
    container.classList.add('floor-selector-scroll');

    let activeZ = clampFloorZ(initialZ);

    for (const z of getAllFloorZs()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'floor-btn floor-btn--compact';
        btn.dataset.z = String(z);
        btn.title = `Editar / jogar no andar ${formatFloorLabel(z)}`;
        btn.textContent = formatFloorLabel(z);
        btn.addEventListener('click', () => {
            activeZ = z;
            onSelect(z);
            syncActiveClass(container, z);
        });
        container.appendChild(btn);
    }

    syncActiveClass(container, activeZ);

    return {
        setActive(z: number) {
            activeZ = clampFloorZ(z);
            syncActiveClass(container, activeZ);
        },
        getActive() {
            return activeZ;
        },
    };
}

function syncActiveClass(container: HTMLElement, z: number): void {
    container.querySelectorAll<HTMLButtonElement>('.floor-btn--compact').forEach((btn) => {
        const bz = parseInt(btn.dataset.z ?? '0', 10);
        btn.classList.toggle('active', bz === z);
    });
}
