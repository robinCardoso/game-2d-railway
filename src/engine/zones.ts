export enum ZoneType {
    NORMAL = 0,
    PROTECTION_ZONE = 1, // PZ: Sem penalidade, não pode atacar, logout liberado sem battle sign.
    NO_LOGOUT = 2,       // Não desloga instantaneamente
    PVP_ARENA = 3,       // Sem penalidade de morte
    HOUSE = 4            // Casa privada (requer houseId vinculado)
}

export const ZONE_COLORS: Record<number, string> = {
    [ZoneType.NORMAL]: 'transparent',
    [ZoneType.PROTECTION_ZONE]: 'rgba(253, 224, 71, 0.4)', // Amarelo
    [ZoneType.NO_LOGOUT]: 'rgba(239, 68, 68, 0.4)',        // Vermelho
    [ZoneType.PVP_ARENA]: 'rgba(249, 115, 22, 0.4)',       // Laranja
    [ZoneType.HOUSE]: 'rgba(56, 189, 248, 0.4)',           // Azul Claro
};

export const ZONE_NAMES: Record<number, string> = {
    [ZoneType.NORMAL]: 'Limpar Zona (Normal)',
    [ZoneType.PROTECTION_ZONE]: 'Protection Zone (PZ)',
    [ZoneType.NO_LOGOUT]: 'No Logout Zone',
    [ZoneType.PVP_ARENA]: 'PvP Arena',
    [ZoneType.HOUSE]: 'House Zone (Privada)',
};
