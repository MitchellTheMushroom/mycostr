import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';

interface ValidationConfig {
    maxErrors: number;
    cacheTimeout: number;
    customTypes: string[];
    strictMode: boolean;
    logger?: Logger;
}

interface ValidationSchema {
    id: string;
    name: string;
    version: string;
    fields: ValidationField[];
    rules: ValidationRule[];
    metadata?: Record<string, any>;
}

interface ValidationField {
    name: string;
    type: string;
    required: boolean;
    constraints?: {
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
        custom?: (value: any) => boolean;
    };
    nested?: ValidationField[];
}

interface ValidationRule {
    id: string;
    field: string | string[];
    condition: string;
    params?: any;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

interface ValidationError {
    field: string;
    value: any;
    rule: string;
    message: string;
    severity: ValidationRule['severity'];
    timestamp?: Date;
    context?: any;
}

interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    infos: ValidationError[];
    metadata: {
        schema: string;
        version: string;
        timestamp: Date;
        duration: number;
        context?: any;
    };
}

class DataValidator extends EventEmitter {
    private config: ValidationConfig;
    private schemas: Map<string, ValidationSchema>;
    private cache: Map<string, any>;
    private customValidators: Map<string, Function>;
    private logger: Logger;

    constructor(config: Partial<ValidationConfig> = {}) {
        super();
        
        this.config = {
            maxErrors: 100,
            cacheTimeout: 3600000,  // 1 hour
            customTypes: [],
            strictMode: true,
            ...config
        };

        this.logger = config.logger || new Logger('DataValidator');
        this.schemas = new Map();
        this.cache = new Map();
        this.customValidators = new Map();

        this.registerDefaultValidators();
        this.initializeSystemSchemas();
    }

    private registerDefaultValidators(): void {
        // Core system validators
        this.registerValidator('chunk', this.validateChunk.bind(this));
        this.registerValidator('node', this.validateNode.bind(this));
        this.registerValidator('metadata', this.validateMetadata.bind(this));
        this.registerValidator('storage', this.validateStorage.bind(this));
        
        // Standard validators
        this.registerValidator('email', (value: string) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        });

        this.registerValidator('ipAddress', (value: string) => {
            const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
            const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
            return ipv4Regex.test(value) || ipv6Regex.test(value);
        });

        this.registerValidator('hash', (value: string) => {
            return /^[0-9a-fA-F]{64}$/.test(value);
        });

        this.registerValidator('publicKey', (value: string) => {
            return /^[0-9a-fA-F]{66}$/.test(value);
        });
    }

    private initializeSystemSchemas(): void {
        // Register core system schemas
        this.registerSchema({
            name: 'ChunkValidation',
            version: '1.0',
            fields: [
                {
                    name: 'id',
                    type: 'string',
                    required: true,
                    constraints: {
                        pattern: '^[0-9a-fA-F]{32}$'
                    }
                },
                {
                    name: 'size',
                    type: 'number',
                    required: true,
                    constraints: {
                        min: 0,
                        max: 1024 * 1024 * 64 // 64MB max chunk size
                    }
                },
                {
                    name: 'hash',
                    type: 'hash',
                    required: true
                }
            ],
            rules: [
                {
                    id: 'validChunkSize',
                    field: 'size',
                    condition: 'value > 0 && value <= MAX_CHUNK_SIZE',
                    message: 'Chunk size must be between 0 and 64MB',
                    severity: 'error'
                }
            ]
        });

        this.registerSchema({
            name: 'NodeValidation',
            version: '1.0',
            fields: [
                {
                    name: 'id',
                    type: 'string',
                    required: true
                },
                {
                    name: 'publicKey',
                    type: 'publicKey',
                    required: true
                },
                {
                    name: 'ipAddress',
                    type: 'ipAddress',
                    required: true
                },
                {
                    name: 'capacity',
                    type: 'number',
                    required: true,
                    constraints: {
                        min: 1024 * 1024 * 1024 // 1GB minimum
                    }
                }
            ],
            rules: [
                {
                    id: 'nodeCapacity',
                    field: 'capacity',
                    condition: 'value >= MIN_NODE_CAPACITY',
                    message: 'Node capacity must be at least 1GB',
                    severity: 'error'
                }
            ]
        });
    }

    private validateChunk(chunk: any): boolean {
        try {
            if (!chunk || typeof chunk !== 'object') return false;
            if (!chunk.data || !(chunk.data instanceof Buffer)) return false;
            if (typeof chunk.size !== 'number' || chunk.size <= 0) return false;
            if (!chunk.hash || typeof chunk.hash !== 'string') return false;
            return true;
        } catch (error) {
            this.logger.error('Chunk validation error:', error);
            return false;
        }
    }

    private validateNode(node: any): boolean {
        try {
            if (!node || typeof node !== 'object') return false;
            if (!node.id || typeof node.id !== 'string') return false;
            if (!node.publicKey || typeof node.publicKey !== 'string') return false;
            if (!node.capacity || typeof node.capacity !== 'number') return false;
            return true;
        } catch (error) {
            this.logger.error('Node validation error:', error);
            return false;
        }
    }

    private validateMetadata(metadata: any): boolean {
        try {
            if (!metadata || typeof metadata !== 'object') return false;
            if (!metadata.timestamp || !(metadata.timestamp instanceof Date)) return false;
            if (!metadata.version || typeof metadata.version !== 'string') return false;
            return true;
        } catch (error) {
            this.logger.error('Metadata validation error:', error);
            return false;
        }
    }

    private validateStorage(storage: any): boolean {
        try {
            if (!storage || typeof storage !== 'object') return false;
            if (typeof storage.available !== 'number') return false;
            if (typeof storage.used !== 'number') return false;
            if (storage.available < storage.used) return false;
            return true;
        } catch (error) {
            this.logger.error('Storage validation error:', error);
            return false;
        }
    }

    async registerSchema(schema: Omit<ValidationSchema, 'id'>): Promise<ValidationSchema> {
        try {
            this.validateSchemaStructure(schema);

            const newSchema: ValidationSchema = {
                id: this.generateSchemaId(),
                ...schema
            };

            this.schemas.set(newSchema.id, newSchema);
            this.logger.info(`Schema registered: ${newSchema.name} v${newSchema.version}`);
            this.emit('schemaRegistered', newSchema);

            return newSchema;
        } catch (error) {
            this.logger.error('Schema registration failed:', error);
            throw error;
        }
    }

    async validate(data: any, schemaId: string, context?: any): Promise<ValidationResult> {
        const startTime = Date.now();
        
        try {
            const schema = this.schemas.get(schemaId);
            if (!schema) {
                throw new Error(`Schema not found: ${schemaId}`);
            }

            const errors: ValidationError[] = [];
            const warnings: ValidationError[] = [];
            const infos: ValidationError[] = [];

            // Field validation
            for (const field of schema.fields) {
                const value = this.getFieldValue(data, field.name);
                const fieldErrors = await this.validateField(value, field, context);
                
                fieldErrors.forEach(error => {
                    switch (error.severity) {
                        case 'error':
                            errors.push(error);
                            break;
                        case 'warning':
                            warnings.push(error);
                            break;
                        case 'info':
                            infos.push(error);
                            break;
                    }
                });

                if (errors.length >= this.config.maxErrors) {
                    break;
                }
            }

            // Rules validation
            if (errors.length < this.config.maxErrors) {
                for (const rule of schema.rules) {
                    const ruleErrors = await this.validateRule(data, rule, context);
                    
                    ruleErrors.forEach(error => {
                        switch (error.severity) {
                            case 'error':
                                errors.push(error);
                                break;
                            case 'warning':
                                warnings.push(error);
                                break;
                            case 'info':
                                infos.push(error);
                                break;
                        }
                    });

                    if (errors.length >= this.config.maxErrors) {
                        break;
                    }
                }
            }

            const result: ValidationResult = {
                valid: errors.length === 0,
                errors,
                warnings,
                infos,
                metadata: {
                    schema: schema.name,
                    version: schema.version,
                    timestamp: new Date(),
                    duration: Date.now() - startTime,
                    context
                }
            };

            this.logger.debug('Validation complete', {
                schema: schema.name,
                valid: result.valid,
                errorCount: errors.length
            });

            this.emit('validationComplete', result);
            return result;
        } catch (error) {
            this.logger.error('Validation failed:', error);
            throw error;
        }
    }

    registerValidator(type: string, validator: Function): void {
        this.customValidators.set(type, validator);
        this.logger.debug(`Registered custom validator: ${type}`);
    }

    private generateSchemaId(): string {
        return `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default DataValidator;
