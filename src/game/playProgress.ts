/** Celebra level up só quando o nível sobe dentro da sessão atual (não no login/sync). */
export function shouldCelebrateSessionLevelUp(sessionLevel: number, newLevel: number): boolean {
    return Math.max(1, Math.floor(newLevel)) > Math.max(1, Math.floor(sessionLevel));
}
