import { EventEmitter } from 'events';

interface ValidationConfig {
    maxErrors: number;          // Maximum errors before stopping
    cacheTimeout: number;       // Schema cache timeout (ms)
    customTypes: string[];      // Custom data types
    strictMode: boolean;        // Strict validation mode
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
    field: string | string[];   // Can be multiple fields
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
    };
}

class DataValidator extends EventEmitter {
    private config: ValidationConfig;
    private schemas: Map<string, ValidationSchema>;
    private cache: Map<string, any>;
    private customValidators: Map<string, Function>;

    constructor(config: Partial<ValidationConfig> = {}) {
        super();
        
        this.config = {
            maxErrors: 100,
            cacheTimeout: 3600000,  // 1 hour
            customTypes: [],
            strictMode: true,
            ...config
        };

        this.schemas = new Map();
        this.cache = new Map();
        this.customValidators = new Map();

        this.registerDefaultValidators();
    }

    private registerDefaultValidators(): void {
        // Register built-in validators
        this.registerValidator('email', (value: string) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        });

        this.registerValidator('url', (value: string) => {
            try {
                new URL(value);
                return true;
            } catch {
                return false;
            }
        });

        this.registerValidator('date', (value: string) => {
            const date = new Date(value);
            return !isNaN(date.getTime());
        });

        this.registerValidator('objectId', (value: string) => {
            return /^[0-9a-fA-F]{24}$/.test(value);
        });
    }

    async registerSchema(schema: Omit<ValidationSchema, 'id'>): Promise<ValidationSchema> {
        try {
            // Validate schema structure
            this.validateSchemaStructure(schema);

            const newSchema: ValidationSchema = {
                id: this.generateSchemaId(),
                ...schema
            };

            this.schemas.set(newSchema.id, newSchema);
            this.emit('schemaRegistered', newSchema);

            return newSchema;
        } catch (error) {
            this.emit('schemaRegistrationFailed', { error: error.message });
            throw error;
        }
    }

    async validate(data: any, schemaId: string): Promise<ValidationResult> {
        const startTime = Date.now();
        
        try {
            const schema = this.schemas.get(schemaId);
            if (!schema) {
                throw new Error(`Schema not found: ${schemaId}`);
            }

            const errors: ValidationError[] = [];
            const warnings: ValidationError[] = [];
            const infos: ValidationError[] = [];

            // Validate fields
            for (const field of schema.fields) {
                const value = this.getFieldValue(data, field.name);
                const fieldErrors = await this.validateField(value, field);
                
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

            // Validate rules
            if (errors.length < this.config.maxErrors) {
                for (const rule of schema.rules) {
                    const ruleErrors = await this.validateRule(data, rule);
                    
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
                    duration: Date.now() - startTime
                }
            };

            this.emit('validationComplete', result);
            return result;
        } catch (error) {
            this.emit('validationFailed', { schemaId, error: error.message });
            throw error;
        }
    }

    private async validateField(
        value: any,
        field: ValidationField
    ): Promise<ValidationError[]> {
        const errors: ValidationError[] = [];

        // Check required
        if (field.required && (value === undefined || value === null)) {
            errors.push({
                field: field.name,
                value,
                rule: 'required',
                message: `Field ${field.name} is required`,
                severity: 'error'
            });
            return errors;
        }

        // Skip further validation if value is undefined/null and not required
        if (value === undefined || value === null) {
            return errors;
        }

        // Type validation
        if (!this.validateType(value, field.type)) {
            errors.push({
                field: field.name,
                value,
                rule: 'type',
                message: `Field ${field.name} must be of type ${field.type}`,
                severity: 'error'
            });
            return errors;
        }

        // Constraints validation
        if (field.constraints) {
            if (field.constraints.min !== undefined &&
                !this.validateMinConstraint(value, field.constraints.min)) {
                errors.push({
                    field: field.name,
                    value,
                    rule: 'min',
                    message: `Field ${field.name} must be at least ${field.constraints.min}`,
                    severity: 'error'
                });
            }

            if (field.constraints.max !== undefined &&
                !this.validateMaxConstraint(value, field.constraints.max)) {
                errors.push({
                    field: field.name,
                    value,
                    rule: 'max',
                    message: `Field ${field.name} must be at most ${field.constraints.max}`,
                    severity: 'error'
                });
            }

            if (field.constraints.pattern &&
                !new RegExp(field.constraints.pattern).test(value)) {
                errors.push({
                    field: field.name,
                    value,
                    rule: 'pattern',
                    message: `Field ${field.name} must match pattern ${field.constraints.pattern}`,
                    severity: 'error'
                });
            }

            if (field.constraints.enum &&
                !field.constraints.enum.includes(value)) {
                errors.push({
                    field: field.name,
                    value,
                    rule: 'enum',
                    message: `Field ${field.name} must be one of ${field.constraints.enum.join(', ')}`,
                    severity: 'error'
                });
            }

            if (field.constraints.custom &&
                !field.constraints.custom(value)) {
                errors.push({
                    field: field.name,
                    value,
                    rule: 'custom',
                    message: `Field ${field.name} failed custom validation`,
                    severity: 'error'
                });
            }
        }

        // Nested validation
        if (field.nested && Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                for (const nestedField of field.nested) {
                    const nestedErrors = await this.validateField(
                        value[i][nestedField.name],
                        nestedField
                    );
                    errors.push(...nestedErrors.map(error => ({
                        ...error,
                        field: `${field.name}[${i}].${error.field}`
                    })));
                }
            }
        }

        return errors;
    }

    private async validateRule(
        data: any,
        rule: ValidationRule
    ): Promise<ValidationError[]> {
        const errors: ValidationError[] = [];

        try {
            const fields = Array.isArray(rule.field) ? rule.field : [rule.field];
            const values = fields.map(field => this.getFieldValue(data, field));

            // Evaluate condition
            const valid = await this.evaluateCondition(rule.condition, values, rule.params);

            if (!valid) {
                errors.push({
                    field: Array.isArray(rule.field) ? rule.field.join(', ') : rule.field,
                    value: values,
                    rule: rule.id,
                    message: rule.message,
                    severity: rule.severity
                });
            }
        } catch (error) {
            console.error('Rule validation failed:', error);
            errors.push({
                field: Array.isArray(rule.field) ? rule.field.join(', ') : rule.field,
                value: undefined,
                rule: rule.id,
                message: `Rule evaluation failed: ${error.message}`,
                severity: 'error'
            });
        }

        return errors;
    }

    private validateType(value: any, type: string): boolean {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                // Check custom validators
                const validator = this.customValidators.get(type);
                return validator ? validator(value) : false;
        }
    }

    private validateMinConstraint(value: any, min: number): boolean {
        if (typeof value === 'number') {
            return value >= min;
        }
        if (typeof value === 'string' || Array.isArray(value)) {
            return value.length >= min;
        }
        return false;
    }

    private validateMaxConstraint(value: any, max: number): boolean {
        if (typeof value === 'number') {
            return value <= max;
        }
        if (typeof value === 'string' || Array.isArray(value)) {
            return value.length <= max;
        }
        return false;
    }

    private async evaluateCondition(
        condition: string,
        values: any[],
        params?: any
    ): Promise<boolean> {
        // TODO: Implement condition evaluation
        return true;
    }

    private getFieldValue(data: any, field: string): any {
        const parts = field.split('.');
        let value = data;
        
        for (const part of parts) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[part];
        }
        
        return value;
    }

    private validateSchemaStructure(schema: any): void {
        if (!schema.name || typeof schema.name !== 'string') {
            throw new Error('Schema must have a valid name');
        }

        if (!schema.version || typeof schema.version !== 'string') {
            throw new Error('Schema must have a valid version');
        }

        if (!Array.isArray(schema.fields)) {
            throw new Error('Schema must have a fields array');
        }

        if (!Array.isArray(schema.rules)) {
            throw new Error('Schema must have a rules array');
        }
    }

    registerValidator(type: string, validator: Function): void {
        this.customValidators.set(type, validator);
    }

    private generateSchemaId(): string {
        return `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default DataValidator;
