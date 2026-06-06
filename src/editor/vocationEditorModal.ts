import { calculateStatsForLevel, type VocationConfig } from '../engine/character/calculateStats';
import {
    dispatchVocationsUpdated,
    fillVocationSelect,
    isDefaultVocationId,
    type VocationsMap,
} from '../game-data/vocationUi';
import { apiFetch } from '../shared/apiFetch';
import { toast, popup } from '../utils/popup';

let vocations: VocationsMap = {};
let activeVocId: string | null = null;

export function initVocationEditor(): void {
    const modal = document.getElementById('vocationEditorModal') as HTMLDivElement | null;
    const openBtn = document.getElementById('openVocationEditorBtn');
    const gearBtn = document.getElementById('charVocationGearBtn');
    const closeBtn = document.getElementById('vocCloseBtn');
    const cancelBtn = document.getElementById('vocCancelBtn');
    const confirmBtn = document.getElementById('vocConfirmBtn') as HTMLButtonElement | null;
    const deleteBtn = document.getElementById('vocDeleteBtn') as HTMLButtonElement | null;
    const addBtn = document.getElementById('vocAddBtn');
    const vocForm = document.getElementById('vocForm');

    if (!modal || !confirmBtn) return;

    const showModal = () => {
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.add('is-open');
        });
    };

    const closeModal = () => {
        modal.classList.remove('is-open');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 250);
    };

    const openModal = async () => {
        closeAllDropdownsSafe();
        showModal();
        try {
            const res = await apiFetch('/api/get-vocations');
            if (!res.ok) throw new Error('Erro ao carregar vocações do servidor.');
            const data = await res.json();
            vocations = (data.vocations || {}) as VocationsMap;

            const keys = Object.keys(vocations);
            if (keys.length > 0) {
                selectVocation(keys[0]);
            } else {
                selectVocation(null);
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Falha ao iniciar gerenciador de vocações.');
        }
    };

    /** Fecha dropdowns do menu superior sem depender de menuBar. */
    function closeAllDropdownsSafe(): void {
        document.querySelectorAll('#mainMenubar .menu-item.is-open').forEach((item) => {
            item.classList.remove('is-open');
        });
    }

    openBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void openModal();
    });
    gearBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void openModal();
    });
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    addBtn?.addEventListener('click', () => selectVocation(null));

    vocForm?.querySelectorAll('input').forEach((el) => {
        el.addEventListener('input', updateSimulation);
    });

    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!activeVocId) return;
            if (isDefaultVocationId(activeVocId)) {
                toast.error('Não é possível excluir as vocações padrão do jogo.');
                return;
            }

            const ok = await popup.confirm(
                `Tem certeza que deseja excluir a vocação <strong>${activeVocId.toUpperCase()}</strong>?`,
                'Confirmar Exclusão'
            );
            if (!ok) return;

            delete vocations[activeVocId];
            const nextId = Object.keys(vocations)[0] ?? null;
            await saveToServer(nextId);
        };
    }

    confirmBtn.onclick = async () => {
        const rawId = (document.getElementById('vocIdInput') as HTMLInputElement).value.trim();
        const id = rawId.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!id) {
            toast.error('O ID da vocação é obrigatório e deve conter apenas letras, números e sublinhados.');
            return;
        }

        const draft = readDraftFromForm();
        if (!draft.name) {
            toast.error('O Nome Exibido é obrigatório.');
            return;
        }

        const previousId = activeVocId;
        vocations[id] = draft;
        if (previousId && previousId !== id) {
            delete vocations[previousId];
        }

        await saveToServer(id);
    };
}

function readDraftFromForm(): VocationConfig {
    const name = (document.getElementById('vocNameInput') as HTMLInputElement).value.trim();
    const num = (id: string, fallback = 0) => {
        const v = (document.getElementById(id) as HTMLInputElement).value;
        const parsed = id.startsWith('vocGrowth') ? parseFloat(v) : parseInt(v, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    return {
        name,
        baseStats: {
            melee: num('vocBaseMelee', 10),
            magicAttack: num('vocBaseMagic', 1),
            distanceAttack: num('vocBaseDist', 2),
            defense: num('vocBaseDef', 10),
            attackSpeed: num('vocBaseAtkSpd', 1000),
            defenseAttack: num('vocBaseDefAtk', 0),
            health: num('vocBaseHp', 150),
            mana: num('vocBaseMana', 30),
        },
        growthPerLevel: {
            melee: num('vocGrowthMelee', 2),
            magicAttack: num('vocGrowthMagic', 0.5),
            distanceAttack: num('vocGrowthDist', 1),
            defense: num('vocGrowthDef', 1.5),
            health: num('vocGrowthHp', 20),
            mana: num('vocGrowthMana', 10),
        },
    };
}

async function saveToServer(selectIdAfter: string | null): Promise<void> {
    try {
        const res = await apiFetch('/api/save-vocations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vocations }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Erro desconhecido ao salvar.');
        }

        const result = (await res.json()) as { vocations?: VocationsMap };
        if (result.vocations) {
            vocations = result.vocations;
        }

        dispatchVocationsUpdated(vocations);

        const playerVocationEl = document.getElementById('charPlayerVocation') as HTMLSelectElement | null;
        if (playerVocationEl) {
            fillVocationSelect(playerVocationEl, vocations);
        }

        toast.success('Vocações salvas! Dropdowns e motor atualizados.');
        renderVocList();
        selectVocation(selectIdAfter && vocations[selectIdAfter] ? selectIdAfter : Object.keys(vocations)[0] ?? null);
    } catch (err: unknown) {
        popup.alert(
            `Erro ao salvar vocações: ${err instanceof Error ? err.message : String(err)}`,
            'Erro ao Salvar'
        );
    }
}

function renderVocList(): void {
    const container = document.getElementById('vocListContainer');
    if (!container) return;
    container.innerHTML = '';
    for (const [id, config] of Object.entries(vocations)) {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.background = id === activeVocId ? 'var(--accent-color)' : '#1a1d24';
        item.style.color = '#fff';
        item.style.borderRadius = '4px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '11px';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        const label = document.createElement('span');
        label.textContent = config.name || id;
        item.appendChild(label);

        const keyBadge = document.createElement('span');
        keyBadge.style.opacity = '0.5';
        keyBadge.style.fontSize = '9px';
        keyBadge.textContent = id;
        item.appendChild(keyBadge);

        item.onclick = () => selectVocation(id);
        container.appendChild(item);
    }
}

function selectVocation(id: string | null): void {
    activeVocId = id;
    renderVocList();

    const deleteBtn = document.getElementById('vocDeleteBtn') as HTMLButtonElement | null;
    const idInput = document.getElementById('vocIdInput') as HTMLInputElement | null;

    if (!id) {
        if (idInput) {
            idInput.value = '';
            idInput.disabled = false;
        }
        if (deleteBtn) deleteBtn.style.display = 'none';
        resetFormToDefaults();
    } else {
        const config = vocations[id];
        if (!config) return;
        if (idInput) {
            idInput.value = id;
            idInput.disabled = isDefaultVocationId(id);
        }
        if (deleteBtn) {
            deleteBtn.style.display = isDefaultVocationId(id) ? 'none' : 'block';
        }
        loadVocationIntoForm(config);
    }
    updateSimulation();
}

function loadVocationIntoForm(config: VocationConfig): void {
    (document.getElementById('vocNameInput') as HTMLInputElement).value = config.name || '';
    (document.getElementById('vocBaseMelee') as HTMLInputElement).value = String(config.baseStats.melee ?? 10);
    (document.getElementById('vocBaseDist') as HTMLInputElement).value = String(config.baseStats.distanceAttack ?? 2);
    (document.getElementById('vocBaseMagic') as HTMLInputElement).value = String(config.baseStats.magicAttack ?? 1);
    (document.getElementById('vocBaseDef') as HTMLInputElement).value = String(config.baseStats.defense ?? 10);
    (document.getElementById('vocBaseHp') as HTMLInputElement).value = String(config.baseStats.health ?? 150);
    (document.getElementById('vocBaseMana') as HTMLInputElement).value = String(config.baseStats.mana ?? 30);
    (document.getElementById('vocBaseAtkSpd') as HTMLInputElement).value = String(config.baseStats.attackSpeed ?? 1000);
    (document.getElementById('vocBaseDefAtk') as HTMLInputElement).value = String(config.baseStats.defenseAttack ?? 5);

    (document.getElementById('vocGrowthMelee') as HTMLInputElement).value = String(config.growthPerLevel.melee ?? 2);
    (document.getElementById('vocGrowthDist') as HTMLInputElement).value = String(config.growthPerLevel.distanceAttack ?? 1);
    (document.getElementById('vocGrowthMagic') as HTMLInputElement).value = String(config.growthPerLevel.magicAttack ?? 0.5);
    (document.getElementById('vocGrowthDef') as HTMLInputElement).value = String(config.growthPerLevel.defense ?? 1.5);
    (document.getElementById('vocGrowthHp') as HTMLInputElement).value = String(config.growthPerLevel.health ?? 20);
    (document.getElementById('vocGrowthMana') as HTMLInputElement).value = String(config.growthPerLevel.mana ?? 10);
}

function resetFormToDefaults(): void {
    (document.getElementById('vocNameInput') as HTMLInputElement).value = '';
    (document.getElementById('vocBaseMelee') as HTMLInputElement).value = '10';
    (document.getElementById('vocBaseDist') as HTMLInputElement).value = '2';
    (document.getElementById('vocBaseMagic') as HTMLInputElement).value = '1';
    (document.getElementById('vocBaseDef') as HTMLInputElement).value = '10';
    (document.getElementById('vocBaseHp') as HTMLInputElement).value = '150';
    (document.getElementById('vocBaseMana') as HTMLInputElement).value = '30';
    (document.getElementById('vocBaseAtkSpd') as HTMLInputElement).value = '1000';
    (document.getElementById('vocBaseDefAtk') as HTMLInputElement).value = '5';

    (document.getElementById('vocGrowthMelee') as HTMLInputElement).value = '2.0';
    (document.getElementById('vocGrowthDist') as HTMLInputElement).value = '1.0';
    (document.getElementById('vocGrowthMagic') as HTMLInputElement).value = '0.5';
    (document.getElementById('vocGrowthDef') as HTMLInputElement).value = '1.5';
    (document.getElementById('vocGrowthHp') as HTMLInputElement).value = '20';
    (document.getElementById('vocGrowthMana') as HTMLInputElement).value = '10';
}

function updateSimulation(): void {
    const draft = readDraftFromForm();
    const stats = calculateStatsForLevel(draft, 100);

    const set = (id: string, value: string | number) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    set('simHp', stats.health);
    set('simMana', stats.mana);
    set('simMelee', stats.melee);
    set('simDef', stats.defense);
    set('simDist', stats.distanceAttack);
    set('simMagic', stats.magicAttack);
    set('simAtkSpd', stats.attackSpeed);
    set('simDefAtk', stats.defenseAttack);
}
