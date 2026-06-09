import type { SpellBarSlot } from './playSpellBar';
import { getSpellForSlot } from './playSpellBar';
import { getPlayAttackCooldownProgress } from '../playCombat';
import { getSpellSlotCooldownProgress, getSpellTooltip } from '../playSpellCast';
import { toast } from '../../utils/popup';

// SPELL_SYSTEM_TODO: poções F1/F2, botão Interagir (fase 6)

export interface PlayCombatHubBridge {
    nowMs: () => number;
    onBasicAttack: () => void;
    onSpellSlot: (slot: SpellBarSlot) => void;
}

let bridge: PlayCombatHubBridge | null = null;

export function setPlayCombatHubBridge(next: PlayCombatHubBridge | null): void {
    bridge = next;
}

function updateCooldownRing(
    el: HTMLElement | null,
    progress: { active: boolean; percent: number },
    hostEl?: HTMLElement | null
): void {
    if (!el) return;
    const pct = progress.active ? `${Math.round(progress.percent * 100)}%` : '0%';
    el.style.setProperty('--cd-pct', pct);
    const host = hostEl ?? el.parentElement;
    host?.classList.toggle('is-on-cooldown', progress.active);
}

function refreshSpellSlotUi(slot: SpellBarSlot): void {
    const btn = document.getElementById(`playCombatSlot${slot}`) as HTMLButtonElement | null;
    const iconImg = btn?.querySelector<HTMLImageElement>('.play-combat-hub__spell-icon img');
    const cooldownEl = btn?.querySelector<HTMLElement>('.play-combat-hub__spell-cooldown');
    const spell = getSpellForSlot(slot);

    if (iconImg) {
        iconImg.src = spell?.icon ?? '/ui/play-hud/combat/slot_empty.svg';
        iconImg.alt = spell?.name ?? '';
    }
    if (btn) {
        btn.title = getSpellTooltip(spell);
        if (!spell?.implemented) {
            btn.dataset.mock = 'true';
        } else {
            delete btn.dataset.mock;
        }
    }
    if (bridge && cooldownEl) {
        updateCooldownRing(
            cooldownEl,
            getSpellSlotCooldownProgress(slot, bridge.nowMs()),
            btn
        );
    }
}

export function refreshPlayCombatHubSpells(): void {
    refreshSpellSlotUi(1);
    refreshSpellSlotUi(2);
    refreshSpellSlotUi(3);
}

export function initPlayCombatHub(): void {
    const attackBtn = document.getElementById('playCombatAttackBtn');
    attackBtn?.addEventListener('click', () => {
        if (!bridge) return;
        const progress = getPlayAttackCooldownProgress(bridge.nowMs());
        if (progress.active) return;
        bridge.onBasicAttack();
    });

    ([1, 2, 3] as SpellBarSlot[]).forEach((slot) => {
        const btn = document.getElementById(`playCombatSlot${slot}`);
        btn?.addEventListener('click', () => {
            if (!bridge) return;
            const spell = getSpellForSlot(slot);
            if (!spell) {
                toast('Equipe uma magia no painel Personagem.');
                return;
            }
            if (!spell.implemented) {
                toast('Magias — sistema em desenvolvimento.');
                return;
            }
            const cd = getSpellSlotCooldownProgress(slot, bridge.nowMs());
            if (cd.active) return;
            bridge.onSpellSlot(slot);
        });
    });

    refreshPlayCombatHubSpells();
}

export function tickPlayCombatHub(): void {
    if (!bridge) return;
    const now = bridge.nowMs();

    const attackBtn = document.getElementById('playCombatAttackBtn');
    const attackCd = attackBtn?.querySelector<HTMLElement>('.play-combat-hub__attack-cooldown');
    updateCooldownRing(attackCd ?? null, getPlayAttackCooldownProgress(now));

    refreshSpellSlotUi(1);
    refreshSpellSlotUi(2);
    refreshSpellSlotUi(3);
}
