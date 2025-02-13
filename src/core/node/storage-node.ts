import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface NodeConfig {
    id?: string;
    dataDir: string;
    capacity: number;      // Total storage capacity in bytes
    region: string;        // Geographic region
    minSpace: number;      // Minimum free space to maintain
    maxConnections: number;// Maximum concurrent connections
}

interface ChunkStorage {
    chunkId: string;
    size: number;
    stored: Date;
    lastAccessed: Date;
    verifications: number;
}

interface NodeStatus {
    id: string;
    uptime: number;
    spaceUsed: number;
    spaceAvailable: number;
    chunks: number;
    connections: number;
    lastVerified: Date;
    earnings: number;     // Sats earned
}

class StorageNode extends EventEmitter {
    private config: NodeConfig;
    private chunks: Map<string, ChunkStorage>;
    private startTime: Date;
    private activeConnections: number;
    private totalEarnings: number;

    constructor(config: NodeConfig) {
        super();
        this.validateConfig(config);
        
        this.config = {
            id: config.id || this.generateNodeId(),
            dataDir: config.dataDir,
            capacity: config.capacity,
            region: config.region,
            minSpace: config.minSpace || (0.1 * config.capacity), // 10% default
            maxConnections: config.maxConnections || 100,
            ...config
        };

        this.chunks = new Map();
        this.startTime = new Date();
        this.activeConnections = 0;
        this.totalEarnings = 0;

        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // Ensure data directory exists
            await fs.mkdir(this.config.dataDir, { recursive: true });
            
            // Load existing chunks
            await this.loadExistingChunks();
            
            // Start maintenance routines
            this.startMaintenanceRoutines();
            
            this.emit('ready', {
                id: this.config.id,
                region: this.config.region,
                capacity: this.config.capacity
            });
        } catch (error) {
            console.error('Node initialization failed:', error);
            this.emit('error', error);
        }
    }

    async storeChunk(chunkId: string, data: Buffer): Promise<void> {
        try {
            await this.checkResources();
            this.activeConnections++;

            const chunkPath = this.getChunkPath(chunkId);
            await fs.writeFile(chunkPath, data);

            const chunkInfo: ChunkStorage = {
                chunkId,
                size: data.length,
                stored: new Date(),
                lastAccessed: new Date(),
                verifications: 0
            };

            this.chunks.set(chunkId, chunkInfo);
            this.emit('chunkStored', chunkInfo);
        } catch (error) {
            console.error('Chunk storage failed:', error);
            throw new Error(`Failed to store chunk: ${error.message}`);
        } finally {
            this.activeConnections--;
        }
    }

    async retrieveChunk(chunkId: string): Promise<Buffer> {
        try {
            await this.checkConnection();
            this.activeConnections++;

            const chunk = this.chunks.get(chunkId);
            if (!chunk) {
                throw new Error(`Chunk not found: ${chunkId}`);
            }

            const chunkPath = this.getChunkPath(chunkId);
            const data = await fs.readFile(chunkPath);

            chunk.lastAccessed = new Date();
            this.chunks.set(chunkId, chunk);

            return data;
        } catch (error) {
            console.error('Chunk retrieval failed:', error);
            throw new Error(`Failed to retrieve chunk: ${error.message}`);
        } finally {
            this.activeConnections--;
        }
    }

    async verifyChunk(chunkId: string): Promise<boolean> {
        try {
            const chunk = this.chunks.get(chunkId);
            if (!chunk) {
                return false;
            }

            const chunkPath = this.getChunkPath(chunkId);
            await fs.access(chunkPath);

            chunk.verifications++;
            chunk.lastAccessed = new Date();
            this.chunks.set(chunkId, chunk);

            return true;
        } catch (error) {
            console.error('Chunk verification failed:', error);
            return false;
        }
    }

    async getStatus(): Promise<NodeStatus> {
        const spaceUsed = Array.from(this.chunks.values())
            .reduce((total, chunk) => total + chunk.size, 0);

        return {
            id: this.config.id,
            uptime: Date.now() - this.startTime.getTime(),
            spaceUsed,
            spaceAvailable: this.config.capacity - spaceUsed,
            chunks: this.chunks.size,
            connections: this.activeConnections,
            lastVerified: new Date(),
            earnings: this.totalEarnings
        };
    }

    private async checkResources(): Promise<void> {
        const status = await this.getStatus();

        if (status.spaceAvailable < this.config.minSpace) {
            throw new Error('Insufficient storage space');
        }

        if (this.activeConnections >= this.config.maxConnections) {
            throw new Error('Too many active connections');
        }
    }

    private async checkConnection(): Promise<void> {
        if (this.activeConnections >= this.config.maxConnections) {
            throw new Error('Too many active connections');
        }
    }

    private getChunkPath(chunkId: string): string {
        return path.join(this.config.dataDir, `${chunkId}.chunk`);
    }

    private generateNodeId(): string {
        return `node_${crypto.randomBytes(16).toString('hex')}`;
    }

    private async loadExistingChunks(): Promise<void> {
        try {
            const files = await fs.readdir(this.config.dataDir);
            
            for (const file of files) {
                if (file.endsWith('.chunk')) {
                    const chunkId = file.replace('.chunk', '');
                    const stats = await fs.stat(path.join(this.config.dataDir, file));
                    
                    this.chunks.set(chunkId, {
                        chunkId,
                        size: stats.size,
                        stored: stats.birthtime,
                        lastAccessed: stats.mtime,
                        verifications: 0
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load existing chunks:', error);
            throw error;
        }
    }

    private startMaintenanceRoutines(): void {
        // Regular status updates
        setInterval(async () => {
            const status = await this.getStatus();
            this.emit('status', status);
        }, 60000); // Every minute

        // Space management
        setInterval(async () => {
            const status = await this.getStatus();
            if (status.spaceAvailable < this.config.minSpace) {
                this.emit('lowSpace', status);
            }
        }, 300000); // Every 5 minutes
    }

    private validateConfig(config: NodeConfig): void {
        if (!config.dataDir) {
            throw new Error('Data directory must be specified');
        }
        if (!config.capacity || config.capacity <= 0) {
            throw new Error('Invalid storage capacity');
        }
        if (!config.region) {
            throw new Error('Region must be specified');
        }
    }
}

export default StorageNode;
