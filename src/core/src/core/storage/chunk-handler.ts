import crypto from 'crypto';

// Custom error class for chunk-related errors
class ChunkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChunkError';
    }
}

interface ChunkConfig {
    chunkSize: number;      
    encryption: boolean;     
    hashAlgorithm: string;  
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
    iv?: Buffer;        
    tag?: Buffer;       
}

class ChunkHandler {
    private config: ChunkConfig;

    constructor(config: Partial<ChunkConfig> = {}) {
        // Validate configuration
        if (config.chunkSize && config.chunkSize <= 0) {
            throw new ChunkError('Chunk size must be positive');
        }

        this.config = {
            chunkSize: 1024 * 1024,  
            encryption: true,         
            hashAlgorithm: 'sha256', 
            ...config
        };
    }

    async splitFile(file: Buffer): Promise<Chunk[]> {
        try {
            // Validate input
            if (!Buffer.isBuffer(file)) {
                throw new ChunkError('Input must be a Buffer');
            }

            if (file.length === 0) {
                throw new ChunkError('Cannot process empty file');
            }

            const chunks: Chunk[] = [];
            
            for (let i = 0; i < file.length; i += this.config.chunkSize) {
                const chunkData = file.slice(i, i + this.config.chunkSize);
                const chunk = await this.processChunk(chunkData, i / this.config.chunkSize);
                chunks.push(chunk);
            }
            
            return chunks;
        } catch (error) {
            console.error('File splitting failed:', error);
            throw new ChunkError(`Failed to split file: ${error.message}`);
        }
    }

    private async processChunk(data: Buffer, index: number): Promise<Chunk> {
        try {
            if (!Buffer.isBuffer(data)) {
                throw new ChunkError('Chunk data must be a Buffer');
            }

            if (index < 0) {
                throw new ChunkError('Chunk index must be non-negative');
            }

            const processedData = this.config.encryption 
                ? await this.encryptChunk(data)
                : data;

            const hash = await this.hashChunk(processedData);

            return {
                index,
                data: processedData,
                hash,
                size: data.length
            };
        } catch (error) {
            console.error('Chunk processing failed:', error);
            throw new ChunkError(`Failed to process chunk ${index}: ${error.message}`);
        }
    }

    private async encryptChunk(data: Buffer): Promise<Buffer> {
        try {
            if (!Buffer.isBuffer(data)) {
                throw new ChunkError('Data must be a Buffer');
            }

            if (data.length === 0) {
                throw new ChunkError('Cannot encrypt empty data');
            }

            const iv = crypto.randomBytes(12);
            const key = await this.getEncryptionKey();
            
            if (!key || key.length !== 32) {
                throw new ChunkError('Invalid encryption key');
            }

            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const encrypted = Buffer.concat([
                cipher.update(data),
                cipher.final()
            ]);
            const tag = cipher.getAuthTag();

            return Buffer.concat([iv, encrypted, tag]);
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new ChunkError(`Encryption failed: ${error.message}`);
        }
    }

    private async decryptChunk(encryptedChunk: Buffer): Promise<Buffer> {
        try {
            if (!Buffer.isBuffer(encryptedChunk)) {
                throw new ChunkError('Encrypted data must be a Buffer');
            }

            if (encryptedChunk.length < 29) { // 12 (iv) + 1 (min data) + 16 (tag)
                throw new ChunkError('Invalid encrypted data size');
            }

            const iv = encryptedChunk.slice(0, 12);
            const tag = encryptedChunk.slice(-16);
            const data = encryptedChunk.slice(12, -16);

            const key = await this.getEncryptionKey();
            if (!key || key.length !== 32) {
                throw new ChunkError('Invalid decryption key');
            }

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);

            return Buffer.concat([
                decipher.update(data),
                decipher.final()
            ]
