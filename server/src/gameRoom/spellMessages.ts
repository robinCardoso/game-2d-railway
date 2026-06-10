export function spellCastErrorMessage(code?: string): string {
    switch (code) {
        case 'SPELL_NOT_EQUIPPED':
            return 'Esta magia não está equipada nos seus slots.';
        case 'SPELL_NOT_LEARNED':
            return 'Você ainda não aprendeu esta magia.';
        case 'SPELL_NOT_ALLOWED_FOR_VOCATION':
        case 'VOCATION_BLOCKED':
            return 'Sua vocação não pode usar esta magia.';
        case 'SPELL_LEVEL_TOO_LOW':
        case 'LEVEL_TOO_LOW':
            return 'Level insuficiente para esta magia.';
        case 'NOT_ENOUGH_MANA':
            return 'Mana insuficiente.';
        case 'SPELL_COOLDOWN':
            return 'Aguarde o cooldown da magia.';
        case 'GROUP_COOLDOWN':
            return 'Aguarde o cooldown do grupo de magias.';
        case 'OUT_OF_RANGE':
            return 'Alvo fora de alcance.';
        case 'CREATURE_NOT_FOUND':
            return 'Alvo inválido.';
        case 'SPELL_NOT_IMPLEMENTED':
            return 'Magia ainda não disponível.';
        default:
            return 'Não foi possível conjurar a magia.';
    }
}
