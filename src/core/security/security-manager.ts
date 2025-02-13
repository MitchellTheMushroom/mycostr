import { EventEmitter } from 'events';
import crypto from 'crypto';

interface KeyPair {
    publicKey: string;
    privateKey: string;
}

interface EncryptionKey {
    id: string;
    key: Buffer;
    created: Date;
    algorithm: string;
    status: 'active' | 'rotating' | 'revoked';
}

interface AccessControl {
    fileId: string;
    userId: string;
    permissions: 'read' | 'write' | 'admin';
    granted: Date;
    expires?: Date;
}

class SecurityManager extends EventEmitter {
    private keys: Map<string, EncryptionKey>;
    private accessControls: Map<string, AccessControl[]>;
    private userKeys: Map<string, KeyPair>;

    constructor() {
        super();
        this.keys = new Map();
        this.accessControls = new Map();
        this.userKeys = new Map();
    }

    async encryptData(data: Buffer, keyId?: string): Promise<{
        encrypted: Buffer;
        keyId: string;
        iv: Buffer;
        tag: Buffer;
    }> {
        try {
            // Get or create encryption key
            const encKey = keyId 
                ? await this.getEncryptionKey(keyId)
                : await this.createEncryptionKey();

            // Generate IV
            const iv = crypto.randomBytes(12);

            // Create cipher
            const cipher = crypto.createCipheriv(
                'aes-256-gcm',
                encKey.key,
                iv
            );

            // Encrypt data
            const encrypted = Buffer.concat([
                cipher.update(data),
                cipher.final()
            ]);

            // Get auth tag
            const tag = cipher.getAuthTag();

            return {
                encrypted,
                keyId: encKey.id,
                iv,
                tag
            };
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    async decryptData(
        encrypted: Buffer,
        keyId: string,
        iv: Buffer,
        tag: Buffer
    ): Promise<Buffer> {
        try {
            const encKey = await this.getEncryptionKey(keyId);

            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                encKey.key,
                iv
            );

            decipher.setAuthTag(tag);

            return Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    async createUserKeys(userId: string): Promise<KeyPair> {
        try {
            const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            });

            const keyPair = { publicKey, privateKey };
            this.userKeys.set(userId, keyPair);
            
            return keyPair;
        } catch (error) {
            console.error('Key pair generation failed:', error);
            throw new Error(`Failed to create user keys: ${error.message}`);
        }
    }

    async grantAccess(
        fileId: string,
        userId: string,
        permissions: AccessControl['permissions'],
        duration?: number
    ): Promise<AccessControl> {
        try {
            const access: AccessControl = {
                fileId,
                userId,
                permissions,
                granted: new Date(),
                expires: duration ? new Date(Date.now() + duration) : undefined
            };

            let fileAccess = this.accessControls.get(fileId) || [];
            fileAccess = fileAccess.filter(a => a.userId !== userId);
            fileAccess.push(access);
            
            this.accessControls.set(fileId, fileAccess);
            this.emit('accessGranted', access);

            return access;
        } catch (error) {
            console.error('Access grant failed:', error);
            throw new Error(`Failed to grant access: ${error.message}`);
        }
    }

    async checkAccess(
        fileId: string,
        userId: string,
        requiredPermission: AccessControl['permissions']
    ): Promise<boolean> {
        try {
            const fileAccess = this.accessControls.get(fileId) || [];
            const userAccess = fileAccess.find(a => a.userId === userId);

            if (!userAccess) {
                return false;
            }

            // Check if access has expired
            if (userAccess.expires && userAccess.expires < new Date()) {
                return false;
            }

            // Check permission level
            const permissionLevels = {
                'read': 1,
                'write': 2,
                'admin': 3
            };

            return permissionLevels[userAccess.permissions] >= permissionLevels[requiredPermission];
        } catch (error) {
            console.error('Access check failed:', error);
            throw new Error(`Failed to check access: ${error.message}`);
        }
    }

    private async createEncryptionKey(): Promise<EncryptionKey> {
        const key: EncryptionKey = {
            id: `key_${crypto.randomBytes(16).toString('hex')}`,
            key: crypto.randomBytes(32),
            created: new Date(),
            algorithm: 'aes-256-gcm',
            status: 'active'
        };

        this.keys.set(key.id, key);
        return key;
    }

    private async getEncryptionKey(keyId: string): Promise<EncryptionKey> {
        const key = this.keys.get(keyId);
        if (!key) {
            throw new Error(`Key not found: ${keyId}`);
        }
        if (key.status === 'revoked') {
            throw new Error(`Key has been revoked: ${keyId}`);
        }
        return key;
    }

    async rotateKey(keyId: string): Promise<string> {
        try {
            const oldKey = await this.getEncryptionKey(keyId);
            oldKey.status = 'rotating';

            // Create new key
            const newKey = await this.createEncryptionKey();
