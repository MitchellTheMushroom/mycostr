import { EventEmitter } from 'events';

interface NodeInfo {
    id: string;
    address: string;
    pubkey: string;
    region: string;
    capacity: number;
    available: number;
    lastSeen: Date;
    version: string;
}

interface NetworkConfig {
    maxPeers: number;          // Maximum number of peer connections
    pingInterval: number;      // How often to ping peers (ms)
    timeoutThreshold: number;  // How long before considering node offline (ms)
    minNodes: number;          // Minimum nodes required for network health
}

interface PeerStatus {
    id: string;
    latency: number;
    lastPing: Date;
    failedPings: number;
    isActive: boolean;
}

class NetworkDiscovery extends EventEmitter {
    private nodes: Map<string, NodeInfo>;
    private peerStatus: Map<string, PeerStatus>;
    private config: NetworkConfig;

    constructor(config: Partial<NetworkConfig> = {}) {
        super();
        
        this.config = {
            maxPeers: 50,
            pingInterval: 30000,        // 30 seconds
            timeoutThreshold: 300000,   // 5 minutes
            minNodes: 10,
            ...config
        };

        this.nodes = new Map();
        this.peerStatus = new Map();

        this.startNetworkMonitoring();
    }

    async announceNode(info: NodeInfo): Promise<void> {
        try {
            this.validateNodeInfo(info);
            
            // Update or add node information
            this.nodes.set(info.id, {
                ...info,
                lastSeen: new Date()
            });

            // Initialize peer status if new
            if (!this.peerStatus.has(info.id)) {
                this.peerStatus.set(info.id, {
                    id: info.id,
                    latency: 0,
                    lastPing: new Date(),
                    failedPings: 0,
                    isActive: true
                });
            }

            this.emit('nodeAnnounced', info);
        } catch (error) {
            console.error('Node announcement failed:', error);
            throw new Error(`Failed to announce node: ${error.message}`);
        }
    }

    async findNodes(criteria: Partial<NodeInfo> = {}): Promise<NodeInfo[]> {
        try {
            return Array.from(this.nodes.values())
                .filter(node => this.nodeMatchesCriteria(node, criteria))
                .filter(node => this.isNodeActive(node.id))
                .sort((a, b) => 
                    (this.peerStatus.get(b.id)?.latency || 0) - 
                    (this.peerStatus.get(a.id)?.latency || 0)
                );
        } catch (error) {
            console.error('Node search failed:', error);
            throw new Error(`Failed to find nodes: ${error.message}`);
        }
    }

    private validateNodeInfo(info: NodeInfo): void {
        if (!info.id || !info.address || !info.pubkey) {
            throw new Error('Missing required node information');
        }

        if (info.capacity < 0 || info.available < 0) {
            throw new Error('Invalid capacity values');
        }
    }

    private nodeMatchesCriteria(node: NodeInfo, criteria: Partial<NodeInfo>): boolean {
        return Object.entries(criteria).every(([key, value]) => 
            node[key as keyof NodeInfo] === value
        );
    }

    private isNodeActive(nodeId: string): boolean {
        const status = this.peerStatus.get(nodeId);
        return status?.isActive || false;
    }

    private startNetworkMonitoring(): void {
        setInterval(() => this.pingNodes(), this.config.pingInterval);
        setInterval(() => this.checkNetworkHealth(), this.config.pingInterval * 2);
    }

    private async pingNodes(): Promise<void> {
        for (const [nodeId, status] of this.peerStatus) {
            try {
                const startTime = Date.now();
                await this.pingNode(nodeId);
                
                // Update status on successful ping
                this.peerStatus.set(nodeId, {
                    ...status,
                    latency: Date.now() - startTime,
                    lastPing: new Date(),
                    failedPings: 0,
                    isActive: true
                });
            } catch (error) {
                console.warn(`Failed to ping node ${nodeId}:`, error);
                
                // Update failed ping count
                status.failedPings++;
                if (status.failedPings > 3) {
                    status.isActive = false;
                    this.emit('nodeOffline', nodeId);
                }
                this.peerStatus.set(nodeId, status);
            }
        }
    }

    private async pingNode(nodeId: string): Promise<void> {
        // TODO: Implement actual ping mechanism
        // For now, just simulate network latency
        await new Promise(resolve => 
            setTimeout(resolve, Math.random() * 100)
        );
    }

    private checkNetworkHealth(): void {
        const activeNodes = Array.from(this.peerStatus.values())
            .filter(status => status.isActive)
            .length;

        if (activeNodes < this.config.minNodes) {
            this.emit('networkUnhealthy', {
                activeNodes,
                required: this.config.minNodes
            });
        }
    }
}

export default NetworkDiscovery;
