import { EventEmitter } from 'events';

interface StoragePreferences {
    redundancyLevel: 'minimum' | 'standard' | 'maximum' | 'custom';
    customRedundancy?: number;    
    preferredRegions?: string[];  
    minNodesPerRegion?: number;   
}

interface StorageNode {
    id: string;
    region: string;
    capacity: number;
    available: number;
    reliability: number;
    lastSeen: Date;
}

interface DistributionPlan {
    chunkId: string;
    targetNodes: StorageNode[];
    redundancyLevel: number;
    regions: string[];
    estimatedCost: number;
}

interface RedundancyTier {
    level: string;
    copies: number;
    regions: number;
    costMultiplier: number;
}

class DistributionManager extends EventEmitter {
    private nodes: Map<string, StorageNode>;
    private readonly redundancyTiers: Map<string, RedundancyTier> = new Map([
        ['minimum', {
            level: 'minimum',
            copies: 5,
            regions: 2,
            costMultiplier: 1.0
        }],
        ['standard', {
            level: 'standard',
            copies: 15,
            regions: 4,
            costMultiplier: 1.8
        }],
        ['maximum', {
            level: 'maximum',
            copies: 30,
            regions: 8,
            costMultiplier: 3.0
        }]
    ]);

    constructor() {
        super();
        this.nodes = new Map();
    }

    async createDistributionPlan(
        chunkId: string, 
        preferences: StoragePreferences,
        paymentCapacity: number
    ): Promise<DistributionPlan> {
        try {
            let targetRedundancy: number;
            let targetRegions: number;
            
            if (preferences.redundancyLevel === 'custom') {
                if (!preferences.customRedundancy || preferences.customRedundancy < 5) {
                    throw new Error('Custom redundancy must be at least 5');
                }
                targetRedundancy = preferences.customRedundancy;
                targetRegions = Math.max(2, Math.floor(targetRedundancy / 5));
                
                const costMultiplier = targetRedundancy / 5;
                if (costMultiplier * this.getBaseCostPerChunk() > paymentCapacity) {
                    throw new Error('Insufficient payment capacity for requested redundancy');
                }
            } else {
                const tier = this.redundancyTiers.get(preferences.redundancyLevel || 'standard');
                if (!tier) {
                    throw new Error('Invalid redundancy level');
                }

                if (tier.costMultiplier * this.getBaseCostPerChunk() > paymentCapacity) {
                    throw new Error('Insufficient payment capacity for selected tier');
                }

                targetRedundancy = tier.copies;
                targetRegions = tier.regions;
            }

            const availableNodes = this.getAvailableNodes();
            if (availableNodes.length < targetRedundancy) {
                throw new Error('Insufficient nodes available for requested redundancy');
            }

            const targetNodes = this.selectTargetNodes(
                availableNodes, 
                targetRedundancy,
                targetRegions,
                preferences.preferredRegions
            );

            return {
                chunkId,
                targetNodes,
                redundancyLevel: targetRedundancy,
                regions: [...new Set(targetNodes.map(node => node.region))],
                estimatedCost: this.calculateCost(targetRedundancy)
            };
        } catch (error) {
            console.error('Failed to create distribution plan:', error);
            throw new Error(`Distribution plan creation failed: ${error.message}`);
        }
    }

    private getAvailableNodes(): StorageNode[] {
        return Array.from(this.nodes.values())
            .filter(node => 
                node.available > 0 && 
                (Date.now() - node.lastSeen.getTime()) < 300000 // 5 minutes
            )
            .sort((a, b) => b.reliability - a.reliability);
    }

    private selectTargetNodes(
        nodes: StorageNode[], 
        count: number,
        targetRegions: number,
        preferredRegions?: string[]
    ): StorageNode[] {
        try {
            const selected: StorageNode[] = [];
            const selectedRegions = new Set<string>();

            // First, try to select nodes from preferred regions
            if (preferredRegions) {
                for (const region of preferredRegions) {
                    const regionNodes = nodes.filter(node => 
                        node.region === region && 
                        !selected.includes(node)
                    );
                    this.selectNodesFromRegion(regionNodes, selected, Math.floor(count / targetRegions));
                    if (regionNodes.length > 0) {
                        selectedRegions.add(region);
                    }
                }
            }

            // Then fill remaining slots with best available nodes
            // Prioritize geographic distribution
            while (selected.length < count && nodes.length > 0) {
                // First try to find nodes from new regions
                const remainingNodes = nodes.filter(node => !selected.includes(node));
                const newRegionNodes = remainingNodes.filter(node => 
                    !selectedRegions.has(node.region)
                );

                if (newRegionNodes.length > 0 && selectedRegions.size < targetRegions) {
                    const node = newRegionNodes[0];
                    selected.push(node);
                    selectedRegions.add(node.region);
                } else {
                    // If we can't find new regions, just take the best remaining nodes
                    const bestNode = remainingNodes[0];
                    if (bestNode) {
                        selected.push(bestNode);
                        selectedRegions.add(bestNode.region);
                    }
                }
            }

            if (selected.length < 5) {
                throw new Error('Could not select enough nodes for minimum redundancy');
            }

            return selected;
        } catch (error) {
            console.error('Node selection failed:', error);
            throw new Error(`Failed to select target nodes: ${error.message}`);
        }
    }

    private selectNodesFromRegion(
        nodes: StorageNode[], 
        selected: StorageNode[], 
        targetCount: number
    ) {
        const count = Math.min(targetCount, nodes.length);
        for (let i = 0; i < count; i++) {
            if (nodes[i] && !selected.includes(nodes[i])) {
                selected.push(nodes[i]);
            }
        }
    }

    private getBaseCostPerChunk(): number {
        return 1000; // Base cost: 1000 sats per chunk per month
    }

    private calculateCost(redundancy: number): number {
        return this.getBaseCostPerChunk() * (redundancy / 5);
    }

    // Node management methods
    async addNode(node: StorageNode): Promise<void> {
        this.nodes.set(node.id, node);
        this.emit('nodeAdded', node);
    }

    async updateNode(nodeId: string, updates: Partial<StorageNode>): Promise<void> {
        const node = this.nodes.get(nodeId);
        if (node) {
            Object.assign(node, updates);
            this.nodes.set(nodeId, node);
            this.emit('nodeUpdated', node);
        }
    }

    async removeNode(nodeId: string): Promise<void> {
        this.nodes.delete(nodeId);
        this.emit('nodeRemoved', nodeId);
    }
}

export default DistributionManager;
