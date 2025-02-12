interface ChunkConfig {
    chunkSize: number;      // Size of each chunk in bytes
    encryption: boolean;     // Whether to encrypt chunks
    hashAlgorithm: string;  // Algorithm for chunk verification
}

class ChunkHandler {
    private config: ChunkConfig;

    constructor(config: Partial<ChunkConfig> = {}) {
        this.config = {
            chunkSize: 1024 * 1024,  // Default 1MB chunks
            encryption: true,         // Encrypt by default
            hashAlgorithm: 'sha256', // Use SHA256 for verification
            ...config
        };
    }

    async splitFile(file: Buffer): Promise<Chunk[]> {
        const chunks: Chunk[] = [];
        
        for (let i = 0; i < file.length; i += this.config.chunkSize) {
            const chunkData = file.slice(i, i + this.config.chunkSize);
            const chunk = await this.processChunk(chunkData, i / this.config.chunkSize);
            chunks.push(chunk);
        }
        
        return chunks;
    }

    private async processChunk(data: Buffer, index: number): Promise<Chunk> {
        // If encryption is enabled, encrypt the chunk
        const processedData = this.config.encryption 
            ? await this.encryptChunk(data)
            : data;

        // Calculate hash for verification
        const hash = await this.hashChunk(processedData);

        return {
            index,
            data: processedData,
            hash,
            size: data.length
        };
    }
}
