import { EventEmitter } from 'events';
import crypto from 'crypto';

interface ConfigItem {
    key: string;
    value: any;
    type: 'string' | 'number' | 'boolean' | 'object';
    encrypted?: boolean;
    lastModified: Date;
    version: number;
}

interface ConfigChange {
    key: string;
    oldValue: any;
    newValue: any;
    timestamp: Date;
    author: string;
}

interface ValidationRule {
    type: 'range' | 'regex' | 'enum' | 'custom';
    params: any;
    message: string;
}

class ConfigurationManager extends EventEmitter {
    private config: Map<string, ConfigItem>;
    private history: ConfigChange[];
    private validators: Map<string, ValidationRule[]>;
    private encryptionKey: Buffer;

    constructor(encryptionKey?: string) {
        super();
        this.config = new Map();
        this.history = [];
        this.validators = new Map();
        this.encryptionKey = Buffer.from(
            encryptionKey || crypto.randomBytes(32).toString('hex'),
            'hex'
        );

        this.initializeDefaultConfig();
    }

    private initializeDefaultConfig(): void {
        // System defaults
        this.setConfig('system.maxNodes', 100, 'number');
        this.setConfig('system.minNodes', 3, 'number');
        this.setConfig('system.healthCheckInterval', 30000, 'number');

        // Storage defaults
        this.setConfig('storage.chunkSize', 1048576, 'number');  // 1MB
        this.setConfig('storage.minRedundancy', 3, 'number');
        this.setConfig('storage.maxRedundancy', 10, 'number');

        // Network defaults
        this.setConfig('network.maxConnections', 50, 'number');
        this.setConfig('network.timeout', 5000, 'number');
        this.setConfig('network.retryAttempts', 3, 'number');

        // Add validators
        this.addValidator('system.maxNodes', {
            type: 'range',
            params: { min: 1, max: 1000 },
            message: 'Max nodes must be between 1 and 1000'
        });

        this.addValidator('storage.chunkSize', {
            type: 'range',
            params: { min: 65536, max: 10485760 },  // 64KB to 10MB
            message: 'Chunk size must be between 64KB and 10MB'
        });
    }

    async setConfig(
        key: string,
        value: any,
        type: ConfigItem['type'],
        encrypted: boolean = false
    ): Promise<void> {
        try {
            // Validate value
            await this.validateConfig(key, value);

            const oldItem = this.config.get(key);
            const newItem: ConfigItem = {
                key,
                value: encrypted ? await this.encrypt(value) : value,
                type,
                encrypted,
                lastModified: new Date(),
                version: oldItem ? oldItem.version + 1 : 1
            };

            // Record change
            if (oldItem) {
                this.recordChange({
                    key,
                    oldValue: oldItem.value,
                    newValue: value,
                    timestamp: new Date(),
                    author: 'system'  // TODO: Add user authentication
                });
            }

            this.config.set(key, newItem);
            this.emit('configChanged', { key, value });
        } catch (error) {
            console.error('Configuration update failed:', error);
            throw new Error(`Failed to update configuration: ${error.message}`);
        }
    }

    async getConfig<T>(key: string): Promise<T> {
        const item = this.config.get(key);
        if (!item) {
            throw new Error(`Configuration key not found: ${key}`);
        }

        if (item.encrypted) {
            return await this.decrypt(item.value);
        }

        return item.value;
    }

    async getAllConfig(): Promise<Record<string, any>> {
        const result: Record<string, any> = {};
        for (const [key, item] of this.config) {
            result[key] = item.encrypted ? 
                await this.decrypt(item.value) : 
                item.value;
        }
        return result;
    }

    getConfigHistory(key?: string): ConfigChange[] {
        if (key) {
            return this.history.filter(change => change.key === key);
        }
        return this.history;
    }

    addValidator(key: string, rule: ValidationRule): void {
        if (!this.validators.has(key)) {
            this.validators.set(key, []);
        }
        this.validators.get(key)!.push(rule);
    }

    private async validateConfig(key: string, value: any): Promise<void> {
        const rules = this.validators.get(key) || [];
        
        for (const rule of rules) {
            switch (rule.type) {
                case 'range':
                    if (value < rule.params.min || value > rule.params.max) {
                        throw new Error(rule.message);
                    }
                    break;

                case 'regex':
                    if (!new RegExp(rule.params.pattern).test(value)) {
                        throw new Error(rule.message);
                    }
                    break;

                case 'enum':
                    if (!rule.params.values.includes(value)) {
                        throw new Error(rule.message);
                    }
                    break;

                case 'custom':
                    if (!await rule.params.validate(value)) {
                        throw new Error(rule.message);
                    }
                    break;
            }
        }
    }

    private recordChange(change: ConfigChange): void {
        this.history.push(change);
        this.emit('configChangeRecorded', change);
    }

    private async encrypt(value: any): Promise<string> {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(value), 'utf8'),
            cipher.final()
        ]);

        const tag = cipher.getAuthTag();

        return Buffer.concat([iv, encrypted, tag]).toString('base64');
    }

    private async decrypt(value: string): Promise<any> {
        const data = Buffer.from(value, 'base64');
        const iv = data.slice(0, 12);
        const tag = data.slice(-16);
        const encrypted = data.slice(12, -16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    }

    async exportConfig(): Promise<string> {
        const config = await this.getAllConfig();
        return JSON.stringify(config, null, 2);
    }

    async importConfig(configData: string): Promise<void> {
        try {
            const config = JSON.parse(configData);
            
            for (const [key, value] of Object.entries(config)) {
                const existing = this.config.get(key);
                if (existing) {
                    await this.setConfig(
                        key,
                        value,
                        existing.type,
                        existing.encrypted
                    );
                }
            }
        } catch (error) {
            console.error('Configuration import failed:', error);
            throw new Error(`Failed to import configuration: ${error.message}`);
        }
    }

    async validateAllConfig(): Promise<boolean> {
        try {
            for (const [key, item] of this.config) {
                await this.validateConfig(key, item.value);
            }
            return true;
        } catch (error) {
            console.error('Configuration validation failed:', error);
            return false;
        }
    }
}

export default ConfigurationManager;
