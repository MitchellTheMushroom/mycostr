import { Logger } from './LoggingSystem';
import { SecurityManager } from './SecurityManager';
import { MetadataStore } from './MetadataStore';

interface ValidationRule {
  name: string;
  validate: (data: any) => Promise<ValidationResult>;
  severity: 'ERROR' | 'WARNING';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  rule: string;
  message: string;
  path?: string;
}

interface ValidationWarning {
  rule: string;
  message: string;
  path?: string;
}

export class DataValidationSystem {
  private readonly logger: Logger;
  private readonly rules: Map<string, ValidationRule>;
  private readonly security: SecurityManager;
  private readonly metadata: MetadataStore;

  constructor(
    logger: Logger,
    security: SecurityManager,
    metadata: MetadataStore
  ) {
    this.logger = logger;
    this.security = security;
    this.metadata = metadata;
    this.rules = new Map();
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    // File size validation
    this.addRule({
      name: 'maxFileSize',
      validate: async (data: Buffer) => {
        const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
        const valid = data.length <= MAX_SIZE;
        return {
          valid,
          errors: valid ? [] : [{
            rule: 'maxFileSize',
            message: `File size exceeds maximum allowed size of ${MAX_SIZE} bytes`
          }],
          warnings: []
        };
      },
      severity: 'ERROR'
    });

    // Content type validation
    this.addRule({
      name: 'contentType',
      validate: async (data: { type: string, content: Buffer }) => {
        const ALLOWED_TYPES = ['application/octet-stream', 'text/plain'];
        const valid = ALLOWED_TYPES.includes(data.type);
        return {
          valid,
          errors: valid ? [] : [{
            rule: 'contentType',
            message: `Content type ${data.type} is not allowed`
          }],
          warnings: []
        };
      },
      severity: 'ERROR'
    });

    // Metadata validation
    this.addRule({
      name: 'metadata',
      validate: async (data: { metadata: any }) => {
        const required = ['name', 'size', 'created'];
        const missing = required.filter(field => !data.metadata[field]);
        
        return {
          valid: missing.length === 0,
          errors: missing.map(field => ({
            rule: 'metadata',
            message: `Missing required metadata field: ${field}`,
            path: `metadata.${field}`
          })),
          warnings: []
        };
      },
      severity: 'ERROR'
    });
  }

  public addRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
    this.logger.info(`Added validation rule: ${rule.name}`);
  }

  public async validateData(
    data: any,
    context: { type: string, metadata?: any }
  ): Promise<ValidationResult> {
    this.logger.debug('Starting data validation', { context });

    const results: ValidationResult[] = [];

    // Run all applicable rules
    for (const [name, rule] of this.rules.entries()) {
      try {
        const result = await rule.validate(data);
        results.push(result);
      } catch (error) {
        this.logger.error(`Validation rule ${name} failed`, { error });
        results.push({
          valid: false,
          errors: [{
            rule: name,
            message: `Validation rule failed: ${error.message}`
          }],
          warnings: []
        });
      }
    }

    // Combine all results
    const combinedResult: ValidationResult = {
      valid: results.every(r => r.valid),
      errors: results.flatMap(r => r.errors),
      warnings: results.flatMap(r => r.warnings)
    };

    // Log validation results
    if (!combinedResult.valid) {
      this.logger.warn('Data validation failed', { errors: combinedResult.errors });
    }

    return combinedResult;
  }

  public async validateChunk(chunk: Buffer, metadata: any): Promise<ValidationResult> {
    return this.validateData(chunk, { type: 'chunk', metadata });
  }

  public async validateFile(file: Buffer, metadata: any): Promise<ValidationResult> {
    return this.validateData(file, { type: 'file', metadata });
  }

  public async validateMetadata(metadata: any): Promise<ValidationResult> {
    return this.validateData(metadata, { type: 'metadata' });
  }

  public async validateStorageNode(nodeInfo: any): Promise<ValidationResult> {
    return this.validateData(nodeInfo, { type: 'node' });
  }

  public getRule(name: string): ValidationRule | undefined {
    return this.rules.get(name);
  }

  public listRules(): string[] {
    return Array.from(this.rules.keys());
  }

  public removeRule(name: string): boolean {
    return this.rules.delete(name);
  }
}
