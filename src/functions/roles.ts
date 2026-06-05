export type AccountType = 'Player' | 'Tutor' | 'GM';

export interface RolePermissions {
    canEditMap: boolean;         // Pode pintar, apagar, usar balde, etc.
    canToggleCollision: boolean;   // Pode desativar colisão (Ghost/Noclip)
    canTeleport: boolean;        // Pode clicar para ir direto para um tile/andar
    prefix: string;              // Prefixo exibido na interface/nome
    color: string;               // Cor visual do cargo
    description: string;         // Descrição para tooltip ou UI
}

export const ROLE_PERMISSIONS: Record<AccountType, RolePermissions> = {
    Player: {
        canEditMap: false,
        canToggleCollision: false,
        canTeleport: false,
        prefix: '[Player]',
        color: '#94a3b8', // Cinza slate
        description: 'Jogador comum. Sujeito às restrições físicas do mapa.'
    },
    Tutor: {
        canEditMap: false,
        canToggleCollision: false,
        canTeleport: true, // Tutores podem usar atalhos de teleporte para ajudar
        prefix: '[Tutor]',
        color: '#38bdf8', // Azul celeste moderno
        description: 'Ajudante. Pode navegar e se teleportar para testar, sem editar.'
    },
    GM: {
        canEditMap: true,
        canToggleCollision: true,
        canTeleport: true,
        prefix: '[GM]',
        color: '#f43f5e', // Vermelho/Rosa vibrante premium
        description: 'Game Master. Acesso total a ferramentas de edição e noclip.'
    }
};

/**
 * Retorna as permissões para um determinado tipo de conta.
 */
export function getRolePermissions(role: AccountType): RolePermissions {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Player;
}
