/**
 * Instâncias de rede para mapas `instanced: true`.
 * Jogadores sem `instanceId` entram na mesma sala até MAX_PLAYERS_PER_INSTANCE.
 */

const MAX_PLAYERS_PER_INSTANCE = 8;

interface ServerInstance {
    instanceId: string;
    templateMapId: string;
    playerIds: Set<string>;
    createdAt: number;
}

export class MapInstanceStore {
    private instances = new Map<string, ServerInstance>();

    private generateId(): string {
        return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * Resolve instanceId para join: usa o enviado, ou agrupa em instância aberta do template.
     */
    resolveInstanceId(templateMapId: string, requested?: string | null): string {
        if (requested && requested.length > 0) {
            const key = requested;
            if (!this.instances.has(key)) {
                this.instances.set(key, {
                    instanceId: key,
                    templateMapId,
                    playerIds: new Set(),
                    createdAt: Date.now(),
                });
            }
            return key;
        }

        for (const inst of this.instances.values()) {
            if (
                inst.templateMapId === templateMapId &&
                inst.playerIds.size < MAX_PLAYERS_PER_INSTANCE
            ) {
                return inst.instanceId;
            }
        }

        const instanceId = this.generateId();
        this.instances.set(instanceId, {
            instanceId,
            templateMapId,
            playerIds: new Set(),
            createdAt: Date.now(),
        });
        return instanceId;
    }

    trackPlayer(instanceId: string | undefined, playerId: string): void {
        if (!instanceId) return;
        const inst = this.instances.get(instanceId);
        if (inst) inst.playerIds.add(playerId);
    }

    untrackPlayer(instanceId: string | undefined, playerId: string): void {
        if (!instanceId) return;
        const inst = this.instances.get(instanceId);
        if (!inst) return;
        inst.playerIds.delete(playerId);
        if (inst.playerIds.size === 0) {
            this.instances.delete(instanceId);
        }
    }
}
