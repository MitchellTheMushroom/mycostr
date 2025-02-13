import { EventEmitter } from 'events';
import crypto from 'crypto';

interface IndexConfig {
    maxIndexSize: number;      // Maximum entries per index
    reindexInterval: number;   // How often to reindex (ms)
    indexTypes: string[];      // Types of indices to maintain
}

interface IndexEntry {
    key: string;
    type: string;
    references: string[];      // IDs of referenced items
    metadata: any;             // Additional index metadata
    created: Date;
    updated: Date;
}

interface IndexStats {
    type: string;
    entries: number;
    size: number;
    lastReindex: Date;
}

class IndexManager extends EventEmitter {
    private config: IndexConfig;
    private indices: Map<string, Map<string, IndexEntry>>;
    private reverseIndices: Map<string, Set<string>>;

    constructor(config: Partial<IndexConfig> = {}) {
        super();
        
        this.config = {
            maxIndexSize: 1000000,    // 1M entries default
            reindexInterval: 3600000,  // 1 hour
            indexTypes: ['file', 'chunk', 'node', 'region'],
            ...config
        };

        this.indices = new Map();
        this.reverseIndices = new Map();
        
        this.initializeIndices();
        this.startMaintenanceRoutines();
    }

    private initializeIndices(): void {
        this.config.indexTypes.forEach(type => {
            this.indices.set(type, new Map());
            this.reverseIndices.set(type, new Set());
        });
    }

    async addEntry(
        type: string,
        key: string,
        references: string[],
        metadata?: any
    ): Promise<IndexEntry> {
        try {
            if (!this.indices.has(type)) {
                throw new Error(`Invalid index type: ${type}`);
            }

            const index = this.indices.get(type)!;
            if (index.size >= this.config.maxIndexSize) {
                throw new Error(`Index size limit reached for type: ${type}`);
            }

            const entry: IndexEntry = {
                key,
                type,
                references,
                metadata: metadata || {},
                created: new Date(),
                updated: new Date()
            };

            // Update main index
            index.set(key, entry);

            // Update reverse indices
            references.forEach(ref => {
                const reverseIndex = this.reverseIndices.get(type)!;
                reverseIndex.add(ref);
            });

            this.emit('entryAdded', entry);
            return entry;
        } catch (error) {
            console.error('Index entry addition failed:', error);
            throw new Error(`Failed to add index entry: ${error.message}`);
        }
    }

    async updateEntry(
        type: string,
        key: string,
        updates: Partial<Pick<IndexEntry, 'references' | 'metadata'>>
    ): Promise<IndexEntry> {
        try {
            const index = this.indices.get(type);
            if (!index) {
                throw new Error(`Invalid index type: ${type}`);
            }

            const entry = index.get(key);
            if (!entry) {
                throw new Error(`Entry not found: ${key}`);
            }

            // Update references if provided
            if (updates.references) {
                // Remove old reverse indices
                entry.references.forEach(ref => {
                    const reverseIndex = this.reverseIndices.get(type)!;
                    reverseIndex.delete(ref);
                });

                // Add new reverse indices
                updates.references.forEach(ref => {
                    const reverseIndex = this.reverseIndices.get(type)!;
                    reverseIndex.add(ref);
                });

                entry.references = updates.references;
            }

            // Update metadata if provided
            if (updates.metadata) {
                entry.metadata = {
                    ...entry.metadata,
                    ...updates.metadata
                };
            }

            entry.updated = new Date();
            index.set(key, entry);

            this.emit('entryUpdated', entry);
            return entry;
        } catch (error) {
            console.error('Index entry update failed:', error);
            throw new Error(`Failed to update index entry: ${error.message}`);
        }
    }

    async removeEntry(type: string, key: string): Promise<void> {
        try {
            const index = this.indices.get(type);
            if (!index) {
                throw new Error(`Invalid index type: ${type}`);
            }

            const entry = index.get(key);
            if (!entry) {
                throw new Error(`Entry not found: ${key}`);
            }

            // Remove main index entry
            index.delete(key);

            // Remove reverse indices
            entry.references.forEach(ref => {
                const reverseIndex = this.reverseIndices.get(type)!;
                reverseIndex.delete(ref);
            });

            this.emit('entryRemoved', entry);
        } catch (error) {
            console.error('Index entry removal failed:', error);
            throw new Error(`Failed to remove index entry: ${error.message}`);
        }
    }

    async query(type: string, filter: (entry: IndexEntry) => boolean): Promise<IndexEntry[]> {
        try {
            const index = this.indices.get(type);
            if (!index) {
                throw new Error(`Invalid index type: ${type}`);
            }

            return Array.from(index.values()).filter(filter);
        } catch (error) {
            console.error('Index query failed:', error);
            throw new Error(`Failed to query index: ${error.message}`);
        }
    }

    async findByReference(type: string, reference: string): Promise<IndexEntry[]> {
        try {
            const index = this.indices.get(type);
            if (!index) {
                throw new Error(`Invalid index type: ${type}`);
            }

            return Array.from(index.values())
                .filter(entry => entry.references.includes(reference));
        } catch (error) {
            console.error('Reference search failed:', error);
            throw new Error(`Failed to find by reference: ${error.message}`);
        }
    }

    async getStats(): Promise<IndexStats[]> {
        return Array.from(this.indices.entries()).map(([type, index]) => ({
            type,
            entries: index.size,
            size: this.calculateIndexSize(index),
            lastReindex: new Date() // TODO: Track actual reindex time
        }));
    }

    private calculateIndexSize(index: Map<string, IndexEntry>): number {
        // Rough estimation of memory usage
        return Array.from(index.entries())
            .reduce((size, [key, entry]) => {
                return size + 
                    key.length + 
                    JSON.stringify(entry).length;
            }, 0);
    }

    private startMaintenanceRoutines(): void {
        setInterval(() => this.reindex(), this.config.reindexInterval);
    }

    private async reindex(): Promise<void> {
        try {
            for (const [type, index] of this.indices) {
                // Rebuild reverse indices
                const reverseIndex = new Set<string>();
                for (const entry of index.values()) {
                    entry.references.forEach(ref => reverseIndex.add(ref));
                }
                this.reverseIndices.set(type, reverseIndex);
            }

            this.emit('reindexComplete', await this.getStats());
        } catch (error) {
            console.error('Reindexing failed:', error);
            this.emit('reindexFailed', error);
        }
    }
}

export default IndexManager;
