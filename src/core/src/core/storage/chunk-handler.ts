import crypto from 'crypto';

interface ChunkConfig {
    chunkSize: number;      // Size of each chunk in bytes
    encryption: boolean;     // Whether to encrypt chunks
    hashAlgorithm: string;  // Algorithm for chunk verification
}

interface EncryptedData {
    data: Buffer;
    iv: Buffer;
    tag: Buffer;
}

interface Chunk {
    index: number;
    data: Buffer;
    hash: string;
    size: number;
    iv?: Buffer;        // For encrypted chunks
    tag?: Buffer;       // For encrypted chunks
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

    private async encryptChunk(data: Buffer): Promise<Buffer> {
        // Generate a random initialization vector
        const iv = crypto.randomBytes(12);
        
        // Create cipher using AES-256-GCM
        const cipher = crypto.createCipheriv(
            'aes-256-gcm', 
            await this.getEncryptionKey(),
            iv
        );

        // Encrypt the data
        const encrypted = Buffer.concat([
            cipher.update(data),
            cipher.final()
        ]);

        // Get authentication tag
        const tag = cipher.getAuthTag();

        // Combine IV, encrypted data, and tag into single buffer
        return Buffer.concat([iv, encrypted, tag]);
    }

    private async decryptChunk(encryptedChunk: Buffer): Promise<Buffer> {
        // Extract IV (first 12 bytes), tag (last 16 bytes), and data (middle)
        const iv = encryptedChunk.slice(0, 12);
        const tag = encryptedChunk.slice(-16);
        const data = encryptedChunk.slice(12, -16);

        // Create decipher
        const decipher = crypto.createDecipheriv(
            'aes-256-gc
