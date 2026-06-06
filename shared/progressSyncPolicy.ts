/** Entrada para decidir se progress_sync do cliente pode alterar XP no servidor. */
export interface ProgressSyncPolicyInput {
    isProduction: boolean;
    allowClientProgressSync: boolean;
    requireWsTicket: boolean;
}

/** Produção nunca aceita XP do cliente; dev exige opt-in explícito e sem ticket WS. */
export function shouldAcceptClientProgressSync(input: ProgressSyncPolicyInput): boolean {
    if (input.isProduction) return false;
    if (!input.allowClientProgressSync) return false;
    if (input.requireWsTicket) return false;
    return true;
}
