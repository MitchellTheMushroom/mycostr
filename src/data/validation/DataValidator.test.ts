import { describe, test, expect, beforeEach } from 'jest';
import DataValidator from '../../../src/data/validation/DataValidator';
import { ValidationSchema } from '../../../src/data/validation/interfaces/ValidationSchema';

describe('DataValidator', () => {
    let validator: DataValidator;
    let testSchema: ValidationSchema;

    beforeEach(() => {
        validator = new DataValidator();
        testSchema = {
            id: 'test_schema',
            name: 'Test Schema',
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
                        max: 1024 * 1024 // 1MB
                    }
                }
            ],
            rules: [
                {
                    id: 'validSize',
                    field: 'size',
                    condition: 'value > 0',
                    message: 'Size must be greater than 0',
                    severity: 'error'
                }
            ]
        };
    });

    test('should register schema successfully', async () => {
        const schema = await validator.registerSchema(testSchema);
        expect(schema.id).toBeDefined();
        expect(schema.name).toBe('Test Schema');
    });

    test('should validate valid data successfully', async () => {
        const schema = await validator.registerSchema(testSchema);
        const validData = {
            id: '1234567890abcdef1234567890abcdef',
            size: 512 * 1024 // 512KB
        };

        const result = await validator.validate(validData, schema.id);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid data', async () => {
        const schema = await validator.registerSchema(testSchema);
        const invalidData = {
            id: 'invalid-id',
            size: -1
        };

        const result = await validator.validate(invalidData, schema.id);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle missing required fields', async () => {
        const schema = await validator.registerSchema(testSchema);
        const invalidData = {
            id: '1234567890abcdef1234567890abcdef'
            // missing size field
        };

        const result = await validator.validate(invalidData, schema.id);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('size');
    });

    test('should validate nested fields', async () => {
        const nestedSchema: ValidationSchema = {
            id: 'nested_schema',
            name: 'Nested Schema',
            version: '1.0',
            fields: [
                {
                    name: 'metadata',
                    type: 'object',
                    required: true,
                    nested: [
                        {
                            name: 'created',
                            type: 'date',
                            required: true
                        }
                    ]
                }
            ],
            rules: []
        };

        const schema = await validator.registerSchema(nestedSchema);
        const validData = {
            metadata: {
                created: new Date()
            }
        };

        const result = await validator.validate(validData, schema.id);
        expect(result.valid).toBe(true);
    });

    test('should handle custom validators', async () => {
        validator.registerValidator('customType', (value: any) => {
            return typeof value === 'string' && value.startsWith('custom_');
        });

        const customSchema: ValidationSchema = {
            id: 'custom_schema',
            name: 'Custom Schema',
            version: '1.0',
            fields: [
                {
                    name: 'customField',
                    type: 'customType',
                    required: true
                }
            ],
            rules: []
        };

        const schema = await validator.registerSchema(customSchema);
        
        const validData = {
            customField: 'custom_value'
        };
        const validResult = await validator.validate(validData, schema.id);
        expect(validResult.valid).toBe(true);

        const invalidData = {
            customField: 'invalid_value'
        };
        const invalidResult = await validator.validate(invalidData, schema.id);
        expect(invalidResult.valid).toBe(false);
    });
});
