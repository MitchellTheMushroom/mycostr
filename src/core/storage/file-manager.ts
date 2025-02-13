import { EventEmitter } from 'events';
import crypto from 'crypto';

interface FileMetadata {
    fileId: string;
    name: string;
    size: number;
    created: Date;
    modified: Date;
    mimeType: string;
    chunks: ChunkMetadata[];
    encryption: EncryptionInfo;
    redundancy: RedundancyInfo;
}

interface ChunkMetadata {
    id: string;
    index: number;
    size: number;
    hash: string;
    nodes: string[];  // Node IDs storing this chunk
}

interface EncryptionInfo {
    algorithm: string;
    keyId: string;
    iv: string;
}

interface RedundancyInfo {
    level: string;
    copies: number;
    regions: string[];
}

class FileManager extends EventEmitter {
    private files: Map<string, FileMetadata>;
    private chunkLocations: Map<string, Set<string>>;  // chunkId -> nodeIds

    constructor() {
        super();
        this.files = new Map();
        this.chunkLocations = new Map();
    }

    async createFileEntry(
        name: string,
        size: number,
        mimeType: string,
        chunks: ChunkMetadata[],
        redundancyInfo: RedundancyInfo
    ): Promise<FileMetadata> {
        try {
            const fileId = this.generateFileId();
            
            const metadata: FileMetadata = {
                fileId,
                name,
                size,
                created: new Date(),
                modified: new Date(),
                mimeType,
                chunks,
                encryption: {
                    algorithm: 'aes-256-gcm',
                    keyId: await this.generateKeyId(),
                    iv: crypto.randomBytes(12).toString('hex')
                },
                redundancy: redundancyInfo
            };

            // Store metadata
            this.files.set(fileId, metadata);
            
            // Update chunk locations
            chunks.forEach(chunk => {
                this.chunkLocations.set(chunk.id, new Set(chunk.nodes));
            });

            this.emit('fileCreated', metadata);
            return metadata;
        } catch (error) {
            console.error('File entry creation failed:', error);
            throw new Error(`Failed to create file entry: ${error.message}`);
        }
    }

    async updateChunkLocation(chunkId: string, nodeId: string, action: 'add' | 'remove'): Promise<void> {
        try {
            let locations = this.chunkLocations.get(chunkId);
            if (!locations) {
                locations = new Set();
                this.chunkLocations.set(chunkId, locations);
            }

            if (action === 'add') {
                locations.add(nodeId);
            } else {
                locations.delete(nodeId);
            }

            // Check redundancy level
            if (locations.size < 5) {  // Minimum redundancy threshold
                this.emit('lowRedundancy', { chunkId, currentCopies: locations.size });
            }
        } catch (error) {
            console.error('Chunk location update failed:', error);
            throw new Error(`Failed to update chunk location: ${error.message}`);
        }
    }

    async getFileMetadata(fileId: string): Promise<FileMetadata> {
        const metadata = this.files.get(fileId);
        if (!metadata) {
            throw new Error(`File not found: ${fileId}`);
        }
        return metadata;
    }

    async getChunkLocations(chunkId: string): Promise<string[]> {
        const locations = this.chunkLocations.get(chunkId);
        if (!locations) {
            throw new Error(`Chunk not found: ${chunkId}`);
        }
        return Array.from(locations);
    }

    async updateFileMetadata(fileId: string, updates: Partial<FileMetadata>): Promise<FileMetadata> {
        try {
            const metadata = await this.getFileMetadata(fileId);
            const updated = {
                ...metadata,
                ...updates,
                modified: new Date()
            };

            this.files.set(fileId, updated);
            this.emit('fileUpdated', updated);

            return updated;
        } catch (error) {
            console.error('Metadata update failed:', error);
            throw new Error(`Failed to update file metadata: ${error.message}`);
        }
    }

    async deleteFile(fileId: string): Promise<void> {
        try {
            const metadata = await this.getFileMetadata(fileId);
            
            // Remove chunk locations
            metadata.chunks.forEach(chunk => {
                this.chunkLocations.delete(chunk.id);
            });

            // Remove file metadata
            this.files.delete(fileId);
            
            this.emit('fileDeleted', fileId);
        } catch (error) {
            console.error('File deletion failed:', error);
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    }

    private generateFileId(): string {
        return `file_${crypto.randomBytes(16).toString('hex')}`;
    }

    private async generateKeyId(): Promise<string> {
        return `key_${crypto.randomBytes(16).toString('hex')}`;
    }
}

export default FileManager;
