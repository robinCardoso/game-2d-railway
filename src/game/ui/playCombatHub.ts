import { markHudUpdate } from '../debug/playPerformanceMonitor';
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
const lastSlotCooldownActive: Record<SpellBarSlot, boolean> = { 1: false, 2: false, 3: false };
let lastAttackCooldownActive = false;

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

function updateSpellSlotCooldown(
    slot: SpellBarSlot,
    progress: { active: boolean; percent: number }
): void {
    const btn = document.getElementById(`playCombatSlot${slot}`);
    const cooldownEl = btn?.querySelector<HTMLElement>('.play-combat-hub__spell-cooldown');
    updateCooldownRing(cooldownEl ?? null, progress, btn);
}

function refreshSpellSlotContent(slot: SpellBarSlot): void {
    const btn = document.getElementById(`playCombatSlot${slot}`) as HTMLButtonElement | null;
    const iconImg = btn?.querySelector<HTMLImageElement>('.play-combat-hub__spell-icon img');
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
}

export function refreshPlayCombatHubSpells(): void {
    markHudUpdate('spellBar');
    refreshSpellSlotContent(1);
    refreshSpellSlotContent(2);
    refreshSpellSlotContent(3);
    if (bridge) {
        const now = bridge.nowMs();
        for (const slot of [1, 2, 3] as SpellBarSlot[]) {
            const progress = getSpellSlotCooldownProgress(slot, now);
            updateSpellSlotCooldown(slot, progress);
            lastSlotCooldownActive[slot] = progress.active;
        }
    }
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
                toast.info('Equipe uma magia no painel Personagem.');
                return;
            }
            if (!spell.implemented) {
                toast.info('Magias — sistema em desenvolvimento.');
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

    const attackProgress = getPlayAttackCooldownProgress(now);
    if (attackProgress.active || lastAttackCooldownActive) {
        markHudUpdate('spellBar');
        const attackBtn = document.getElementById('playCombatAttackBtn');
        const attackCd = attackBtn?.querySelector<HTMLElement>('.play-combat-hub__attack-cooldown');
        updateCooldownRing(attackCd ?? null, attackProgress, attackBtn);
    }
    lastAttackCooldownActive = attackProgress.active;

    for (const slot of [1, 2, 3] as SpellBarSlot[]) {
        const progress = getSpellSlotCooldownProgress(slot, now);
        if (progress.active || lastSlotCooldownActive[slot]) {
            markHudUpdate('spellBar');
            updateSpellSlotCooldown(slot, progress);
        }
        lastSlotCooldownActive[slot] = progress.active;
    }
}

export function resetPlayCombatHubCooldownTracking(): void {
    lastAttackCooldownActive = false;
    lastSlotCooldownActive[1] = false;
    lastSlotCooldownActive[2] = false;
    lastSlotCooldownActive[3] = false;
}
