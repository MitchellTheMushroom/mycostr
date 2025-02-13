import { EventEmitter } from 'events';

interface CoordinationConfig {
    heartbeatInterval: number;  // Time between heartbeats (ms)
    deadNodeTimeout: number;    // Time until node considered dead (ms)
    syncInterval: number;       // Time between sync attempts (ms)
    maxRetries: number;        // Max retry attempts for operations
}

interface NodeState {
    id: string;
    lastHeartbeat: Date;
    status: 'active' | 'syncing' | 'offline' | 'dead';
    syncStatus: {
        lastSync: Date;
        syncInProgress: boolean;
        failedAttempts: number;
    };
}

interface SyncOperation {
    id: string;
    type: 'full' | 'partial';
    startTime: Date;
    endTime?: Date;
    status: 'pending' | 'in-progress' | 'complete' | 'failed';
    progress: number;
}

class NodeCoordinator extends EventEmitter {
    private config: CoordinationConfig;
    private nodeStates: Map<string, NodeState>;
    private syncOperations: Map<string, SyncOperation>;
    private intervalHandles: NodeJS.Timer[];

    constructor(config: Partial<CoordinationConfig> = {}) {
        super();
        
        this.config = {
            heartbeatInterval: 30000,    // 30 seconds
            deadNodeTimeout: 300000,     // 5 minutes
            syncInterval: 3600000,       // 1 hour
            maxRetries: 3,
            ...config
        };

        this.nodeStates = new Map();
        this.syncOperations = new Map();
        this.intervalHandles = [];

        this.startCoordination();
    }

    async registerNode(nodeId: string): Promise<void> {
        try {
            const nodeState: NodeState = {
                id: nodeId,
                lastHeartbeat: new Date(),
                status: 'active',
                syncStatus: {
                    lastSync: new Date(),
                    syncInProgress: false,
                    failedAttempts: 0
                }
            };

            this.nodeStates.set(nodeId, nodeState);
            this.emit('nodeRegistered', nodeState);
        } catch (error) {
            console.error('Node registration failed:', error);
            throw new Error(`Failed to register node: ${error.message}`);
        }
    }

    async handleHeartbeat(nodeId: string): Promise<void> {
        try {
            const state = this.nodeStates.get(nodeId);
            if (!state) {
                throw new Error(`Unknown node: ${nodeId}`);
            }

            state.lastHeartbeat = new Date();
            if (state.status === 'offline' || state.status === 'dead') {
                state.status = 'active';
                this.emit('nodeRecovered', nodeId);
            }

            this.nodeStates.set(nodeId, state);
        } catch (error) {
            console.error('Heartbeat handling failed:', error);
            throw new Error(`Failed to handle heartbeat: ${error.message}`);
        }
    }

    async initiateSync(nodeId: string, type: 'full' | 'partial' = 'partial'): Promise<void> {
        try {
            const state = this.nodeStates.get(nodeId);
            if (!state) {
                throw new Error(`Unknown node: ${nodeId}`);
            }

            if (state.syncStatus.syncInProgress) {
                throw new Error(`Sync already in progress for node: ${nodeId}`);
            }

            const syncOp: SyncOperation = {
                id: `sync_${Date.now()}_${nodeId}`,
                type,
                startTime: new Date(),
                status: 'pending',
                progress: 0
            };

            state.syncStatus.syncInProgress = true;
            this.syncOperations.set(syncOp.id, syncOp);

            await this.performSync(nodeId, syncOp);
        } catch (error) {
            console.error('Sync initiation failed:', error);
            throw new Error(`Failed to initiate sync: ${error.message}`);
        }
    }

    private async performSync(nodeId: string, syncOp: SyncOperation): Promise<void> {
        try {
            syncOp.status = 'in-progress';
            
            // TODO: Implement actual sync logic
            // This would involve:
            // 1. Getting node's chunk list
            // 2. Comparing with expected state
            // 3. Initiating transfers as needed
            // 4. Updating progress

            await this.simulateSync(syncOp);

            syncOp.status = 'complete';
            syncOp.endTime = new Date();
            syncOp.progress = 100;

            const state = this.nodeStates.get(nodeId);
            if (state) {
                state.syncStatus.lastSync = new Date();
                state.syncStatus.syncInProgress = false;
                state.syncStatus.failedAttempts = 0;
            }

            this.emit('syncComplete', { nodeId, syncOp });
        } catch (error) {
            console.error('Sync failed:', error);
            syncOp.status = 'failed';
            syncOp.endTime = new Date();

            const state = this.nodeStates.get(nodeId);
            if (state) {
                state.syncStatus.syncInProgress = false;
                state.syncStatus.failedAttempts++;

                if (state.syncStatus.failedAttempts >= this.config.maxRetries) {
                    state.status = 'offline';
                    this.emit('nodeOffline', nodeId);
                }
            }

            throw new Error(`Sync failed: ${error.message}`);
        }
    }

    private startCoordination(): void {
        // Heartbeat monitoring
        this.intervalHandles.push(
            setInterval(() => this.checkHeartbeats(), this.config.heartbeatInterval)
        );

        // Sync monitoring
        this.intervalHandles.push(
            setInterval(() => this.checkSyncStatus(), this.config.syncInterval)
        );
    }

    private async checkHeartbeats(): Promise<void> {
        const now = Date.now();
        
        for (const [nodeId, state] of this.nodeStates) {
            const timeSinceHeartbeat = now - state.lastHeartbeat.getTime();

            if (timeSinceHeartbeat > this.config.deadNodeTimeout) {
                state.status = 'dead';
                this.emit('nodeDead', nodeId);
            } else if (timeSinceHeartbeat > this.config.heartbeatInterval * 2) {
                state.status = 'offline';
                this.emit('nodeOffline', nodeId);
            }
        }
    }

    private async checkSyncStatus(): Promise<void> {
        const now = Date.now();

        for (const [nodeId, state] of this.nodeStates) {
            if (state.status === 'active' && !state.syncStatus.syncInProgress) {
                const timeSinceSync = now - state.syncStatus.lastSync.getTime();
                
                if (timeSinceSync > this.config.syncInterval) {
                    await this.initiateSync(nodeId, 'partial')
                        .catch(error => console.error('Auto-sync failed:', error));
                }
            }
        }
    }

    private async simulateSync(syncOp: SyncOperation): Promise<void> {
        // This is a temporary method for testing
        // Would be replaced with actual sync logic
        return new Promise((resolve) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                syncOp.progress = progress;
                
                if (progress >= 100) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    async shutdown(): Promise<void> {
        this.intervalHandles.forEach(handle => clearInterval(handle));
        this.intervalHandles = [];
        
        // Clear all states
        this.nodeStates.clear();
        this.syncOperations.clear();
    }
}

export default NodeCoordinator;
